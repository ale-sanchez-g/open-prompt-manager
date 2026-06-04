# Tests for baseline RDS hardening defaults.
# Uses mock_provider so no AWS credentials are required in CI.

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  project_name = "opm-test"
  environment  = "test"
  aws_region   = "us-east-1"
}

run "rds_auto_minor_version_upgrade_enabled" {
  command = plan

  assert {
    condition     = aws_db_instance.main.auto_minor_version_upgrade == true
    error_message = "RDS must enable automatic minor version upgrades."
  }
}

run "rds_copy_tags_to_snapshot_enabled" {
  command = plan

  assert {
    condition     = aws_db_instance.main.copy_tags_to_snapshot == true
    error_message = "RDS must copy tags to snapshots."
  }
}

run "rds_cloudwatch_log_exports_enabled" {
  command = plan

  assert {
    condition     = contains(aws_db_instance.main.enabled_cloudwatch_logs_exports, "postgresql")
    error_message = "RDS must export PostgreSQL logs to CloudWatch."
  }

  assert {
    condition     = contains(aws_db_instance.main.enabled_cloudwatch_logs_exports, "upgrade")
    error_message = "RDS must export upgrade logs to CloudWatch."
  }
}

run "rds_enhanced_monitoring_enabled" {
  command = plan

  assert {
    condition     = aws_db_instance.main.monitoring_interval == 60
    error_message = "RDS enhanced monitoring must be enabled with 60-second granularity."
  }
}

run "rds_performance_insights_enabled" {
  command = plan

  assert {
    condition     = aws_db_instance.main.performance_insights_enabled == true
    error_message = "RDS Performance Insights must be enabled."
  }
}

run "jwt_secret_override_uses_provided_value" {
  command = plan

  variables {
    jwt_secret = "test-jwt-secret-value"
  }

  assert {
    condition     = aws_secretsmanager_secret_version.jwt_secret.secret_string == "test-jwt-secret-value"
    error_message = "jwt_secret override must store the provided value, not the generated random_password."
  }
}
