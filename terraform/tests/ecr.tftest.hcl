# Tests for ECR repositories (backend and frontend).
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
# Backend ECR Repository
# ─────────────────────────────────────────────
run "backend_ecr_repo_name_contains_project" {
  command = plan

  assert {
    condition     = aws_ecr_repository.backend.name == "${var.project_name}-backend"
    error_message = "Backend ECR repository name must be '<project_name>-backend'."
  }
}

run "backend_ecr_scan_on_push_enabled" {
  command = plan

  assert {
    condition     = aws_ecr_repository.backend.image_scanning_configuration[0].scan_on_push == true
    error_message = "Backend ECR repository must have scan_on_push enabled."
  }
}

run "backend_ecr_has_required_tags" {
  command = plan

  assert {
    condition     = aws_ecr_repository.backend.tags["Project"] == var.project_name
    error_message = "Backend ECR repository must have 'Project' tag."
  }

  assert {
    condition     = aws_ecr_repository.backend.tags["Environment"] == var.environment
    error_message = "Backend ECR repository must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# Frontend ECR Repository
# ─────────────────────────────────────────────
run "frontend_ecr_repo_name_contains_project" {
  command = plan

  assert {
    condition     = aws_ecr_repository.frontend.name == "${var.project_name}-frontend"
    error_message = "Frontend ECR repository name must be '<project_name>-frontend'."
  }
}

run "frontend_ecr_scan_on_push_enabled" {
  command = plan

  assert {
    condition     = aws_ecr_repository.frontend.image_scanning_configuration[0].scan_on_push == true
    error_message = "Frontend ECR repository must have scan_on_push enabled."
  }
}

run "frontend_ecr_has_required_tags" {
  command = plan

  assert {
    condition     = aws_ecr_repository.frontend.tags["Project"] == var.project_name
    error_message = "Frontend ECR repository must have 'Project' tag."
  }

  assert {
    condition     = aws_ecr_repository.frontend.tags["Environment"] == var.environment
    error_message = "Frontend ECR repository must have 'Environment' tag."
  }
}
