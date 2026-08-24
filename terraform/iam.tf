# ─────────────────────────────────────────────
# ECS Task Execution Role
# Allows ECS to pull images from ECR and write
# logs to CloudWatch on behalf of the task.
# ─────────────────────────────────────────────
data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "rds_monitoring_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "flow_log_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${var.project_name}-ecs-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = {
    Name        = "${var.project_name}-ecs-task-execution-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ─────────────────────────────────────────────
# ECS Task Role
# Permissions granted to the running container
# (e.g. access to S3 or SSM Parameter Store).
# Add additional policy attachments below as
# your application requires them.
# ─────────────────────────────────────────────
resource "aws_iam_role" "ecs_task" {
  name               = "${var.project_name}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = {
    Name        = "${var.project_name}-ecs-task-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Allow the task execution role to read the
# DATABASE_URL secret so ECS can inject it into
# the container at launch time.
# ─────────────────────────────────────────────
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${var.project_name}-ecs-execution-secrets-policy"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.db_url.arn, aws_secretsmanager_secret.jwt_secret.arn, aws_secretsmanager_secret.opm_encryption_key.arn]
      }
    ]
  })
}

resource "aws_iam_role" "rds_enhanced_monitoring" {
  name               = "${var.project_name}-${var.environment}-rds-monitoring-role"
  assume_role_policy = data.aws_iam_policy_document.rds_monitoring_assume_role.json

  tags = {
    Name        = "${var.project_name}-rds-monitoring-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ─────────────────────────────────────────────
# VPC Flow Log Delivery Role
# Allows the VPC Flow Logs service to publish
# network traffic records to the CloudWatch Log
# Group defined in vpc.tf.
# ─────────────────────────────────────────────
resource "aws_iam_role" "flow_log" {
  name               = "${var.project_name}-${var.environment}-vpc-flow-log-role"
  assume_role_policy = data.aws_iam_policy_document.flow_log_assume_role.json

  tags = {
    Name        = "${var.project_name}-vpc-flow-log-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_iam_role_policy" "flow_log" {
  name = "${var.project_name}-vpc-flow-log-policy"
  role = aws_iam_role.flow_log.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          aws_cloudwatch_log_group.flow_log.arn,
          "${aws_cloudwatch_log_group.flow_log.arn}:*"
        ]
      }
    ]
  })
}

# ─────────────────────────────────────────────
# Secrets Manager Rotation Lambda Role
# Execution role for the DATABASE_URL rotation
# function (see rotation.tf). Grants the minimum
# permissions to read/write the single rotated
# secret, run inside the VPC, and emit traces.
# ─────────────────────────────────────────────
resource "aws_iam_role" "db_rotation" {
  name               = "${var.project_name}-${var.environment}-db-rotation-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Name        = "${var.project_name}-db-rotation-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Managed policy grants the ENI + CloudWatch Logs permissions a VPC-attached
# Lambda requires (AWSLambdaVPCAccessExecutionRole).
resource "aws_iam_role_policy_attachment" "db_rotation_vpc" {
  role       = aws_iam_role.db_rotation.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "db_rotation" {
  name = "${var.project_name}-db-rotation-policy"
  role = aws_iam_role.db_rotation.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageRotatedSecret"
        Effect = "Allow"
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecretVersionStage"
        ]
        Resource = aws_secretsmanager_secret.db_url.arn
      },
      {
        Sid      = "GenerateRotationPassword"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetRandomPassword"]
        Resource = "*"
      },
      {
        Sid    = "DecryptSecretWithCmk"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = aws_kms_key.secrets.arn
      },
      {
        Sid    = "WriteTraces"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      },
      {
        Sid      = "SendToDeadLetterQueue"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.db_rotation_dlq.arn
      }
    ]
  })
}
