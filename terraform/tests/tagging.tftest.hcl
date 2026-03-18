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
    condition     = aws_vpc.main.tags["Project"] == var.project_name && aws_vpc.main.tags["Environment"] == var.environment
    error_message = "aws_vpc.main is missing 'project' or 'Environment' tag."
  }
}

run "igw_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_internet_gateway.main.tags["Project"] == var.project_name && aws_internet_gateway.main.tags["Environment"] == var.environment
    error_message = "aws_internet_gateway.main is missing 'project' or 'Environment' tag."
  }
}

run "public_subnets_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.tags["Project"] == var.project_name && s.tags["Environment"] == var.environment])
    error_message = "One or more public subnets are missing 'project' or 'Environment' tag."
  }
}

run "private_subnets_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = alltrue([for s in aws_subnet.private : s.tags["Project"] == var.project_name && s.tags["Environment"] == var.environment])
    error_message = "One or more private subnets are missing 'project' or 'Environment' tag."
  }
}

run "nat_eip_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_eip.nat.tags["Project"] == var.project_name && aws_eip.nat.tags["Environment"] == var.environment
    error_message = "aws_eip.nat is missing 'project' or 'Environment' tag."
  }
}

run "nat_gateway_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_nat_gateway.main.tags["Project"] == var.project_name && aws_nat_gateway.main.tags["Environment"] == var.environment
    error_message = "aws_nat_gateway.main is missing 'project' or 'Environment' tag."
  }
}

run "route_tables_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_route_table.public.tags["Project"] == var.project_name && aws_route_table.public.tags["Environment"] == var.environment
    error_message = "aws_route_table.public is missing 'project' or 'Environment' tag."
  }

  assert {
    condition     = aws_route_table.private.tags["Project"] == var.project_name && aws_route_table.private.tags["Environment"] == var.environment
    error_message = "aws_route_table.private is missing 'project' or 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# Security Groups
# ─────────────────────────────────────────────
run "security_groups_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_security_group.alb.tags["Project"] == var.project_name && aws_security_group.alb.tags["Environment"] == var.environment
    error_message = "aws_security_group.alb is missing 'project' or 'Environment' tag."
  }

  assert {
    condition     = aws_security_group.frontend.tags["Project"] == var.project_name && aws_security_group.frontend.tags["Environment"] == var.environment
    error_message = "aws_security_group.frontend is missing 'project' or 'Environment' tag."
  }

  assert {
    condition     = aws_security_group.backend.tags["Project"] == var.project_name && aws_security_group.backend.tags["Environment"] == var.environment
    error_message = "aws_security_group.backend is missing 'project' or 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# ALB & Target Groups
# ─────────────────────────────────────────────
run "alb_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_lb.main.tags["Project"] == var.project_name && aws_lb.main.tags["Environment"] == var.environment
    error_message = "aws_lb.main is missing 'project' or 'Environment' tag."
  }
}

run "target_groups_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_lb_target_group.frontend.tags["Project"] == var.project_name && aws_lb_target_group.frontend.tags["Environment"] == var.environment
    error_message = "aws_lb_target_group.frontend is missing 'project' or 'Environment' tag."
  }

  assert {
    condition     = aws_lb_target_group.backend.tags["Project"] == var.project_name && aws_lb_target_group.backend.tags["Environment"] == var.environment
    error_message = "aws_lb_target_group.backend is missing 'project' or 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# ECR Repositories
# ─────────────────────────────────────────────
run "ecr_repositories_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_ecr_repository.backend.tags["Project"] == var.project_name && aws_ecr_repository.backend.tags["Environment"] == var.environment
    error_message = "aws_ecr_repository.backend is missing 'project' or 'Environment' tag."
  }

  assert {
    condition     = aws_ecr_repository.frontend.tags["Project"] == var.project_name && aws_ecr_repository.frontend.tags["Environment"] == var.environment
    error_message = "aws_ecr_repository.frontend is missing 'project' or 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# ECS Resources
# ─────────────────────────────────────────────
run "ecs_cluster_has_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_ecs_cluster.main.tags["Project"] == var.project_name && aws_ecs_cluster.main.tags["Environment"] == var.environment
    error_message = "aws_ecs_cluster.main is missing 'project' or 'Environment' tag."
  }
}

run "ecs_task_definitions_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.backend.tags["Project"] == var.project_name && aws_ecs_task_definition.backend.tags["Environment"] == var.environment
    error_message = "aws_ecs_task_definition.backend is missing 'project' or 'Environment' tag."
  }

  assert {
    condition     = aws_ecs_task_definition.frontend.tags["Project"] == var.project_name && aws_ecs_task_definition.frontend.tags["Environment"] == var.environment
    error_message = "aws_ecs_task_definition.frontend is missing 'project' or 'Environment' tag."
  }
}

run "ecs_services_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_ecs_service.backend.tags["Project"] == var.project_name && aws_ecs_service.backend.tags["Environment"] == var.environment
    error_message = "aws_ecs_service.backend is missing 'project' or 'Environment' tag."
  }

  assert {
    condition     = aws_ecs_service.frontend.tags["Project"] == var.project_name && aws_ecs_service.frontend.tags["Environment"] == var.environment
    error_message = "aws_ecs_service.frontend is missing 'project' or 'Environment' tag."
  }
}

run "cloudwatch_log_groups_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_cloudwatch_log_group.backend.tags["Project"] == var.project_name && aws_cloudwatch_log_group.backend.tags["Environment"] == var.environment
    error_message = "aws_cloudwatch_log_group.backend is missing 'project' or 'Environment' tag."
  }

  assert {
    condition     = aws_cloudwatch_log_group.frontend.tags["Project"] == var.project_name && aws_cloudwatch_log_group.frontend.tags["Environment"] == var.environment
    error_message = "aws_cloudwatch_log_group.frontend is missing 'project' or 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# IAM Roles
# ─────────────────────────────────────────────
run "iam_roles_have_project_and_environment_tags" {
  command = plan

  assert {
    condition     = aws_iam_role.ecs_task_execution.tags["Project"] == var.project_name && aws_iam_role.ecs_task_execution.tags["Environment"] == var.environment
    error_message = "aws_iam_role.ecs_task_execution is missing 'project' or 'Environment' tag."
  }

  assert {
    condition     = aws_iam_role.ecs_task.tags["Project"] == var.project_name && aws_iam_role.ecs_task.tags["Environment"] == var.environment
    error_message = "aws_iam_role.ecs_task is missing 'project' or 'Environment' tag."
  }
}
