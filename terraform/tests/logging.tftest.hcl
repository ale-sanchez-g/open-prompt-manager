# Tests for edge observability and encryption: ALB access log bucket, the
# CloudWatch Logs KMS key, and ALB access logging.
# Uses mock_provider so no AWS credentials are required in CI.

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  project_name  = "opm-test"
  environment   = "test"
  aws_region    = "us-east-1"
  frontend_port = 80
  backend_port  = 8000
}

# ─────────────────────────────────────────────
# CloudWatch Logs KMS key
# ─────────────────────────────────────────────
run "logs_kms_key_rotation_enabled" {
  command = plan

  assert {
    condition     = aws_kms_key.logs.enable_key_rotation == true
    error_message = "CloudWatch Logs KMS key must have key rotation enabled."
  }
}

run "logs_kms_alias_named_for_project" {
  command = plan

  assert {
    condition     = aws_kms_alias.logs.name == "alias/${var.project_name}-logs"
    error_message = "KMS alias must follow the pattern 'alias/<project_name>-logs'."
  }
}

# ─────────────────────────────────────────────
# ALB access log bucket
# ─────────────────────────────────────────────
run "alb_log_bucket_blocks_public_access" {
  command = plan

  assert {
    condition = (
      aws_s3_bucket_public_access_block.alb_logs.block_public_acls == true &&
      aws_s3_bucket_public_access_block.alb_logs.block_public_policy == true &&
      aws_s3_bucket_public_access_block.alb_logs.ignore_public_acls == true &&
      aws_s3_bucket_public_access_block.alb_logs.restrict_public_buckets == true
    )
    error_message = "ALB log bucket must block all public access."
  }
}

run "alb_log_bucket_is_encrypted" {
  command = plan

  assert {
    condition = anytrue([
      for r in aws_s3_bucket_server_side_encryption_configuration.alb_logs.rule :
      anytrue([for e in r.apply_server_side_encryption_by_default : e.sse_algorithm == "AES256"])
    ])
    error_message = "ALB log bucket must enable server-side encryption (AES256, required for ALB log delivery)."
  }
}

run "alb_log_bucket_has_access_logging" {
  command = plan

  assert {
    condition     = aws_s3_bucket_logging.alb_logs.target_prefix == "s3-access-logs/"
    error_message = "ALB log bucket must have server access logging enabled to the 's3-access-logs/' prefix."
  }
}

run "alb_log_bucket_has_lifecycle" {
  command = plan

  assert {
    condition     = length(aws_s3_bucket_lifecycle_configuration.alb_logs.rule) > 0
    error_message = "ALB log bucket must define at least one lifecycle rule."
  }
}

# ─────────────────────────────────────────────
# ALB access logging
# ─────────────────────────────────────────────
run "alb_access_logs_enabled" {
  command = plan

  assert {
    condition     = aws_lb.main.access_logs[0].enabled == true
    error_message = "ALB access logs must be enabled."
  }

  assert {
    condition     = aws_lb.main.access_logs[0].prefix == var.project_name
    error_message = "ALB access logs must be written under the project prefix."
  }
}
