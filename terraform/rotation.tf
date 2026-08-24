# ─────────────────────────────────────────────
# Secrets Manager Rotation for DATABASE_URL (CKV2_AWS_57)
#
# A custom in-VPC Lambda rotates the RDS master-user password and rewrites the
# DATABASE_URL connection-string secret in place, so the application's secret
# contract (a single libpq/SQLAlchemy URL injected into ECS) is unchanged.
#
# The JWT secret is deliberately excluded from automatic rotation; see the
# inline justification on aws_secretsmanager_secret.jwt_secret in rds.tf and
# docs/adr-secrets-rotation-iam-auth.md.
# ─────────────────────────────────────────────

# Package the handler plus its vendored dependencies (run build.sh first; the
# deploy pipeline does this automatically).
data "archive_file" "db_rotation" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/db_rotation"
  output_path = "${path.module}/lambda/db_rotation.zip"

  # Keep build/test/doc files out of the deployed package.
  excludes = [
    "build.sh",
    "requirements.txt",
    "README.md",
    "test_rotation_helpers.py",
    "__pycache__",
  ]
}

# Pre-create the Lambda log group so it is encrypted with the logs CMK and has a
# managed retention period rather than the unbounded, unencrypted default.
resource "aws_cloudwatch_log_group" "db_rotation" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-db-rotation"
  retention_in_days = var.cloudwatch_log_retention_in_days
  kms_key_id        = aws_kms_key.logs.arn

  tags = {
    Name        = "${var.project_name}-db-rotation-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Dead-letter queue for the rotation function so failed asynchronous invocations
# are retained for inspection rather than dropped (CKV_AWS_116).
resource "aws_sqs_queue" "db_rotation_dlq" {
  name                      = "${var.project_name}-${var.environment}-db-rotation-dlq"
  message_retention_seconds = 1209600 # 14 days
  sqs_managed_sse_enabled   = true

  tags = {
    Name        = "${var.project_name}-db-rotation-dlq"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_lambda_function" "db_rotation" {
  # checkov:skip=CKV_AWS_272:Lambda code-signing requires an AWS Signer signing
  # profile and trust anchor that are not provisioned for this project. The
  # function source is version-controlled in terraform/lambda/db_rotation and
  # packaged deterministically by our own build/deploy pipeline (source_code_hash
  # is tracked), so provenance is established without Signer.
  function_name = "${var.project_name}-${var.environment}-db-rotation"
  description   = "Rotates the RDS master password stored in the DATABASE_URL secret"
  role          = aws_iam_role.db_rotation.arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.12"

  filename         = data.archive_file.db_rotation.output_path
  source_code_hash = data.archive_file.db_rotation.output_base64sha256

  timeout     = 30
  memory_size = 256

  # Cap concurrency: rotation is infrequent and strictly serial per secret.
  reserved_concurrent_executions = 2

  # Encrypt environment variables at rest with the customer-managed secrets CMK.
  kms_key_arn = aws_kms_key.secrets.arn

  # Run in private subnets with a security group permitted to reach RDS.
  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.db_rotation.id]
  }

  # Retain failed asynchronous invocations for inspection.
  dead_letter_config {
    target_arn = aws_sqs_queue.db_rotation_dlq.arn
  }

  # Active tracing for observability of rotation runs.
  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      SECRETS_MANAGER_ENDPOINT = "https://secretsmanager.${var.aws_region}.amazonaws.com"
    }
  }

  depends_on = [
    aws_iam_role_policy.db_rotation,
    aws_iam_role_policy_attachment.db_rotation_vpc,
    aws_cloudwatch_log_group.db_rotation,
  ]

  tags = {
    Name        = "${var.project_name}-db-rotation"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Allow Secrets Manager to invoke the rotation function for this secret only.
resource "aws_lambda_permission" "db_rotation" {
  statement_id  = "AllowSecretsManagerInvocation"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.db_rotation.function_name
  principal     = "secretsmanager.amazonaws.com"
  source_arn    = aws_secretsmanager_secret.db_url.arn
}

# Attach automatic rotation to the DATABASE_URL secret.
resource "aws_secretsmanager_secret_rotation" "db_url" {
  secret_id           = aws_secretsmanager_secret.db_url.id
  rotation_lambda_arn = aws_lambda_function.db_rotation.arn

  rotation_rules {
    automatically_after_days = var.db_secret_rotation_days
  }

  depends_on = [
    aws_lambda_permission.db_rotation,
    aws_secretsmanager_secret_version.db_url,
  ]
}
