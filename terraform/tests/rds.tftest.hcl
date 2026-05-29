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
