# Tests for the OpenTelemetry Collector's private ECR mirror repository (#365).
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

run "otel_mirror_ecr_repo_name_contains_project" {
  command = plan

  assert {
    condition     = aws_ecr_repository.otel_collector_mirror.name == "${var.project_name}-otel-collector"
    error_message = "OTel mirror ECR repository name must be '<project_name>-otel-collector'."
  }
}

run "otel_mirror_ecr_scan_on_push_enabled" {
  command = plan

  assert {
    condition     = aws_ecr_repository.otel_collector_mirror.image_scanning_configuration[0].scan_on_push == true
    error_message = "OTel mirror ECR repository must have scan_on_push enabled."
  }
}

run "otel_mirror_ecr_uses_kms_encryption" {
  command = plan

  assert {
    condition     = aws_ecr_repository.otel_collector_mirror.encryption_configuration[0].encryption_type == "KMS"
    error_message = "OTel mirror ECR repository must use KMS (CMK) encryption."
  }
}

run "otel_mirror_ecr_wired_to_dedicated_cmk" {
  command = plan

  # Computed key ARNs are unknown at plan time, so verify the wiring via the
  # configuration source (consistent with tests/ecr.tftest.hcl).
  assert {
    condition     = strcontains(file("${path.module}/otel.tf"), "kms_key         = aws_kms_key.ecr.arn")
    error_message = "OTel mirror ECR repository must encrypt image layers with the dedicated ECR CMK (aws_kms_key.ecr)."
  }
}

run "otel_mirror_ecr_tags_are_immutable" {
  command = plan

  # The repo only ever holds a digest-pinned mirror of a third-party image,
  # so a tag must never be repointed at different content.
  assert {
    condition     = aws_ecr_repository.otel_collector_mirror.image_tag_mutability == "IMMUTABLE"
    error_message = "OTel mirror ECR repository must have IMMUTABLE image tags."
  }
}

run "otel_mirror_ecr_has_required_tags" {
  command = plan

  assert {
    condition     = aws_ecr_repository.otel_collector_mirror.tags["Name"] == "${var.project_name}-otel-collector"
    error_message = "OTel mirror ECR repository must have a 'Name' tag."
  }

  assert {
    condition     = aws_ecr_repository.otel_collector_mirror.tags["Project"] == var.project_name
    error_message = "OTel mirror ECR repository must have 'Project' tag."
  }

  assert {
    condition     = aws_ecr_repository.otel_collector_mirror.tags["Environment"] == var.environment
    error_message = "OTel mirror ECR repository must have 'Environment' tag."
  }
}

run "otel_mirror_ecr_lifecycle_policy_keeps_last_10" {
  command = plan

  assert {
    condition     = aws_ecr_lifecycle_policy.otel_collector_mirror.repository == "${var.project_name}-otel-collector"
    error_message = "OTel mirror lifecycle policy must be attached to the mirror repository."
  }

  assert {
    condition     = strcontains(aws_ecr_lifecycle_policy.otel_collector_mirror.policy, "\"countNumber\":10")
    error_message = "OTel mirror ECR repository must expire all but the last 10 images."
  }
}
