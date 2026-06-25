# ─────────────────────────────────────────────
# Shared account/region data sources
# ─────────────────────────────────────────────
data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# ─────────────────────────────────────────────
# KMS CMK for CloudWatch Logs encryption
# Encrypts the ECS application log groups and the
# VPC flow log group at rest. The key policy grants
# the CloudWatch Logs service in this region
# permission to use the key, scoped by encryption
# context to log groups in this account.
# ─────────────────────────────────────────────
data "aws_iam_policy_document" "logs_kms" {
  # Account administrators retain full control of the key.
  statement {
    sid       = "EnableRootAccount"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  # CloudWatch Logs service may use the key to encrypt/decrypt log data.
  statement {
    sid    = "AllowCloudWatchLogs"
    effect = "Allow"

    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:Describe*",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.name}.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:*"]
    }
  }
}

resource "aws_kms_key" "logs" {
  description             = "${var.project_name} CloudWatch Logs encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.logs_kms.json

  tags = {
    Name        = "${var.project_name}-logs-kms"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_kms_alias" "logs" {
  name          = "alias/${var.project_name}-logs"
  target_key_id = aws_kms_key.logs.key_id
}

# ─────────────────────────────────────────────
# KMS CMK for Secrets Manager (CKV_AWS_149)
# Encrypts the JWT_SECRET and DATABASE_URL secrets
# at rest with a customer-managed key so rotation
# and CloudTrail audit are available. The key
# policy grants the ECS task execution role decrypt
# access so ECS can inject secrets at task launch
# (see iam.tf -> ecs_execution_secrets).
# ─────────────────────────────────────────────
data "aws_iam_policy_document" "secrets_kms" {
  # Account administrators retain full control of the key (anti-lockout).
  statement {
    sid       = "EnableRootAccount"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  # The ECS task execution role decrypts secrets at container start.
  statement {
    sid       = "AllowEcsExecutionRoleDecrypt"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.ecs_task_execution.arn]
    }
  }

  # Scope general key use to the Secrets Manager service in this account.
  statement {
    sid    = "AllowSecretsManagerUse"
    effect = "Allow"

    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["secretsmanager.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_kms_key" "secrets" {
  description             = "${var.project_name} Secrets Manager encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.secrets_kms.json

  tags = {
    Name        = "${var.project_name}-secrets-kms"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.project_name}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# ─────────────────────────────────────────────
# KMS CMK for ECR image encryption (CKV_AWS_136)
# ECR uses KMS grants to encrypt/decrypt image
# layers server-side; image pullers need only
# standard ECR permissions (already granted via the
# managed AmazonECSTaskExecutionRolePolicy), not
# direct KMS access.
# ─────────────────────────────────────────────
data "aws_iam_policy_document" "ecr_kms" {
  # Account administrators retain full control of the key (anti-lockout).
  statement {
    sid       = "EnableRootAccount"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  # Allow the ECR service to use the key and create the grants it needs
  # for layer encryption, scoped to this account.
  statement {
    sid    = "AllowEcrServiceUse"
    effect = "Allow"

    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
      "kms:CreateGrant",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["ecr.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_kms_key" "ecr" {
  description             = "${var.project_name} ECR image encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.ecr_kms.json

  tags = {
    Name        = "${var.project_name}-ecr-kms"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_kms_alias" "ecr" {
  name          = "alias/${var.project_name}-ecr"
  target_key_id = aws_kms_key.ecr.key_id
}
