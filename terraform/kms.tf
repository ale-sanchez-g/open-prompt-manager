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
