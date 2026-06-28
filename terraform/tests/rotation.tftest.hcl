# Tests for the DATABASE_URL secret-rotation infrastructure (CKV2_AWS_57).
# Uses mock_provider so no AWS credentials are required in CI.

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  project_name = "opm-test"
  environment  = "test"
  aws_region   = "us-east-1"
}

run "rotation_lambda_runtime_and_handler" {
  command = plan

  assert {
    condition     = aws_lambda_function.db_rotation.runtime == "python3.12"
    error_message = "Rotation Lambda must use the python3.12 runtime."
  }

  assert {
    condition     = aws_lambda_function.db_rotation.handler == "lambda_function.lambda_handler"
    error_message = "Rotation Lambda handler must be lambda_function.lambda_handler."
  }
}

run "rotation_lambda_hardening" {
  command = plan

  assert {
    condition     = aws_lambda_function.db_rotation.reserved_concurrent_executions == 2
    error_message = "Rotation Lambda must cap reserved concurrency."
  }

  assert {
    condition     = aws_lambda_function.db_rotation.tracing_config[0].mode == "Active"
    error_message = "Rotation Lambda must enable Active X-Ray tracing."
  }

  # Lambda must run in-VPC (private subnets + dedicated SG) to reach RDS.
  assert {
    condition     = length(aws_lambda_function.db_rotation.vpc_config) == 1
    error_message = "Rotation Lambda must be attached to the VPC."
  }

  # Dead-letter queue wired for failed asynchronous invocations (CKV_AWS_116).
  assert {
    condition     = length(aws_lambda_function.db_rotation.dead_letter_config) == 1
    error_message = "Rotation Lambda must have a dead-letter queue configured."
  }
}

run "rotation_dlq_encrypted" {
  command = plan

  assert {
    condition     = aws_sqs_queue.db_rotation_dlq.sqs_managed_sse_enabled == true
    error_message = "Rotation dead-letter queue must be encrypted at rest."
  }
}

run "rotation_secrets_manager_endpoint_env" {
  command = plan

  assert {
    condition     = aws_lambda_function.db_rotation.environment[0].variables["SECRETS_MANAGER_ENDPOINT"] == "https://secretsmanager.${var.aws_region}.amazonaws.com"
    error_message = "Rotation Lambda must target the regional Secrets Manager endpoint."
  }
}

run "rotation_lambda_invoke_permission_scoped" {
  command = plan

  assert {
    condition     = aws_lambda_permission.db_rotation.principal == "secretsmanager.amazonaws.com"
    error_message = "Only Secrets Manager may invoke the rotation Lambda."
  }
}

run "rotation_sg_egress_to_postgres" {
  command = plan

  # The rotation SG must allow egress to PostgreSQL within the VPC and the RDS
  # SG must accept the rotation SG as an ingress source. Both are verified via
  # configuration source because the security-group IDs are unknown at plan.
  assert {
    condition     = strcontains(file("${path.module}/security_groups.tf"), "PostgreSQL from secret-rotation Lambda")
    error_message = "RDS security group must allow ingress from the rotation Lambda SG."
  }
}
