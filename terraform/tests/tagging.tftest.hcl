# Cross-cutting tagging tests: every AWS resource with an explicit tags block
# must carry both 'project' and 'environment' keys.
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
# Networking
# ─────────────────────────────────────────────
run "vpc_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_vpc.main.tags["project"] == var.project_name && aws_vpc.main.tags["environment"] == var.environment
    error_message = "aws_vpc.main is missing 'project' or 'environment' tag."
  }
}

run "igw_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_internet_gateway.main.tags["project"] == var.project_name && aws_internet_gateway.main.tags["environment"] == var.environment
    error_message = "aws_internet_gateway.main is missing 'project' or 'environment' tag."
  }
}

run "public_subnets_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.tags["project"] == var.project_name && s.tags["environment"] == var.environment])
    error_message = "One or more public subnets are missing 'project' or 'environment' tag."
  }
}

run "private_subnets_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = alltrue([for s in aws_subnet.private : s.tags["project"] == var.project_name && s.tags["environment"] == var.environment])
    error_message = "One or more private subnets are missing 'project' or 'environment' tag."
  }
}

run "nat_eip_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_eip.nat.tags["project"] == var.project_name && aws_eip.nat.tags["environment"] == var.environment
    error_message = "aws_eip.nat is missing 'project' or 'environment' tag."
  }
}

run "nat_gateway_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_nat_gateway.main.tags["project"] == var.project_name && aws_nat_gateway.main.tags["environment"] == var.environment
    error_message = "aws_nat_gateway.main is missing 'project' or 'environment' tag."
  }
}

run "route_tables_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_route_table.public.tags["project"] == var.project_name && aws_route_table.public.tags["environment"] == var.environment
    error_message = "aws_route_table.public is missing 'project' or 'environment' tag."
  }

  assert {
    condition     = aws_route_table.private.tags["project"] == var.project_name && aws_route_table.private.tags["environment"] == var.environment
    error_message = "aws_route_table.private is missing 'project' or 'environment' tag."
  }
}

# ─────────────────────────────────────────────
# Security Groups
# ─────────────────────────────────────────────
run "security_groups_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_security_group.alb.tags["project"] == var.project_name && aws_security_group.alb.tags["environment"] == var.environment
    error_message = "aws_security_group.alb is missing 'project' or 'environment' tag."
  }

  assert {
    condition     = aws_security_group.frontend.tags["project"] == var.project_name && aws_security_group.frontend.tags["environment"] == var.environment
    error_message = "aws_security_group.frontend is missing 'project' or 'environment' tag."
  }

  assert {
    condition     = aws_security_group.backend.tags["project"] == var.project_name && aws_security_group.backend.tags["environment"] == var.environment
    error_message = "aws_security_group.backend is missing 'project' or 'environment' tag."
  }
}

# ─────────────────────────────────────────────
# ALB & Target Groups
# ─────────────────────────────────────────────
run "alb_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_lb.main.tags["project"] == var.project_name && aws_lb.main.tags["environment"] == var.environment
    error_message = "aws_lb.main is missing 'project' or 'environment' tag."
  }
}

run "target_groups_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_lb_target_group.frontend.tags["project"] == var.project_name && aws_lb_target_group.frontend.tags["environment"] == var.environment
    error_message = "aws_lb_target_group.frontend is missing 'project' or 'environment' tag."
  }

  assert {
    condition     = aws_lb_target_group.backend.tags["project"] == var.project_name && aws_lb_target_group.backend.tags["environment"] == var.environment
    error_message = "aws_lb_target_group.backend is missing 'project' or 'environment' tag."
  }
}

# ─────────────────────────────────────────────
# ECR Repositories
# ─────────────────────────────────────────────
run "ecr_repositories_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_ecr_repository.backend.tags["project"] == var.project_name && aws_ecr_repository.backend.tags["environment"] == var.environment
    error_message = "aws_ecr_repository.backend is missing 'project' or 'environment' tag."
  }

  assert {
    condition     = aws_ecr_repository.frontend.tags["project"] == var.project_name && aws_ecr_repository.frontend.tags["environment"] == var.environment
    error_message = "aws_ecr_repository.frontend is missing 'project' or 'environment' tag."
  }
}

# ─────────────────────────────────────────────
# ECS Resources
# ─────────────────────────────────────────────
run "ecs_cluster_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_ecs_cluster.main.tags["project"] == var.project_name && aws_ecs_cluster.main.tags["environment"] == var.environment
    error_message = "aws_ecs_cluster.main is missing 'project' or 'environment' tag."
  }
}

run "ecs_task_definitions_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.backend.tags["project"] == var.project_name && aws_ecs_task_definition.backend.tags["environment"] == var.environment
    error_message = "aws_ecs_task_definition.backend is missing 'project' or 'environment' tag."
  }

  assert {
    condition     = aws_ecs_task_definition.frontend.tags["project"] == var.project_name && aws_ecs_task_definition.frontend.tags["environment"] == var.environment
    error_message = "aws_ecs_task_definition.frontend is missing 'project' or 'environment' tag."
  }
}

run "ecs_services_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_ecs_service.backend.tags["project"] == var.project_name && aws_ecs_service.backend.tags["environment"] == var.environment
    error_message = "aws_ecs_service.backend is missing 'project' or 'environment' tag."
  }

  assert {
    condition     = aws_ecs_service.frontend.tags["project"] == var.project_name && aws_ecs_service.frontend.tags["environment"] == var.environment
    error_message = "aws_ecs_service.frontend is missing 'project' or 'environment' tag."
  }
}

run "cloudwatch_log_groups_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_cloudwatch_log_group.backend.tags["project"] == var.project_name && aws_cloudwatch_log_group.backend.tags["environment"] == var.environment
    error_message = "aws_cloudwatch_log_group.backend is missing 'project' or 'environment' tag."
  }

  assert {
    condition     = aws_cloudwatch_log_group.frontend.tags["project"] == var.project_name && aws_cloudwatch_log_group.frontend.tags["environment"] == var.environment
    error_message = "aws_cloudwatch_log_group.frontend is missing 'project' or 'environment' tag."
  }
}

# ─────────────────────────────────────────────
# IAM Roles
# ─────────────────────────────────────────────
run "iam_roles_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_iam_role.ecs_task_execution.tags["project"] == var.project_name && aws_iam_role.ecs_task_execution.tags["environment"] == var.environment
    error_message = "aws_iam_role.ecs_task_execution is missing 'project' or 'environment' tag."
  }

  assert {
    condition     = aws_iam_role.ecs_task.tags["project"] == var.project_name && aws_iam_role.ecs_task.tags["environment"] == var.environment
    error_message = "aws_iam_role.ecs_task is missing 'project' or 'environment' tag."
  }
}
