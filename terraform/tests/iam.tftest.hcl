# Tests for IAM roles used by ECS tasks.
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

# ─────────────────────────────────────────────
# ECS Task Execution Role
# ─────────────────────────────────────────────
run "task_execution_role_name_contains_project" {
  command = plan

  assert {
    condition     = aws_iam_role.ecs_task_execution.name == "${var.project_name}-ecs-task-execution-role"
    error_message = "ECS task execution role name must be '<project_name>-ecs-task-execution-role'."
  }
}

run "task_execution_role_has_required_tags" {
  command = plan

  assert {
    condition     = aws_iam_role.ecs_task_execution.tags["Project"] == var.project_name
    error_message = "ECS task execution role must have 'Project' tag."
  }

  assert {
    condition     = aws_iam_role.ecs_task_execution.tags["Environment"] == var.environment
    error_message = "ECS task execution role must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# ECS Task Role
# ─────────────────────────────────────────────
run "task_role_name_contains_project" {
  command = plan

  assert {
    condition     = aws_iam_role.ecs_task.name == "${var.project_name}-ecs-task-role"
    error_message = "ECS task role name must be '<project_name>-ecs-task-role'."
  }
}

run "task_role_has_required_tags" {
  command = plan

  assert {
    condition     = aws_iam_role.ecs_task.tags["Project"] == var.project_name
    error_message = "ECS task role must have 'Project' tag."
  }

  assert {
    condition     = aws_iam_role.ecs_task.tags["Environment"] == var.environment
    error_message = "ECS task role must have 'Environment' tag."
  }
}
