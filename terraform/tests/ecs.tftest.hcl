# Tests for ECS resources: CloudWatch log groups, Fargate cluster, task definitions,
# and ECS services.
# Uses mock_provider so no AWS credentials are required in CI.

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  project_name           = "opm-test"
  environment            = "test"
  aws_region             = "us-east-1"
  backend_cpu            = 512
  backend_memory         = 1024
  frontend_cpu           = 256
  frontend_memory        = 512
  backend_port           = 8000
  frontend_port          = 80
  backend_desired_count  = 2
  frontend_desired_count = 2
}

# ─────────────────────────────────────────────
# CloudWatch Log Groups
# ─────────────────────────────────────────────
run "backend_log_group_name" {
  command = plan

  assert {
    condition     = aws_cloudwatch_log_group.backend.name == "/ecs/${var.project_name}/backend"
    error_message = "Backend log group name must be '/ecs/<project_name>/backend'."
  }
}

run "frontend_log_group_name" {
  command = plan

  assert {
    condition     = aws_cloudwatch_log_group.frontend.name == "/ecs/${var.project_name}/frontend"
    error_message = "Frontend log group name must be '/ecs/<project_name>/frontend'."
  }
}

run "log_groups_have_retention" {
  command = plan

  assert {
    condition     = aws_cloudwatch_log_group.backend.retention_in_days > 0
    error_message = "Backend log group must have a retention policy set."
  }

  assert {
    condition     = aws_cloudwatch_log_group.frontend.retention_in_days > 0
    error_message = "Frontend log group must have a retention policy set."
  }
}

run "log_groups_have_required_tags" {
  command = plan

  assert {
    condition     = aws_cloudwatch_log_group.backend.tags["Project"] == var.project_name
    error_message = "Backend log group must have 'Project' tag."
  }

  assert {
    condition     = aws_cloudwatch_log_group.backend.tags["Environment"] == var.environment
    error_message = "Backend log group must have 'Environment' tag."
  }

  assert {
    condition     = aws_cloudwatch_log_group.frontend.tags["Project"] == var.project_name
    error_message = "Frontend log group must have 'Project' tag."
  }

  assert {
    condition     = aws_cloudwatch_log_group.frontend.tags["Environment"] == var.environment
    error_message = "Frontend log group must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# ECS Cluster
# ─────────────────────────────────────────────
run "ecs_cluster_name_contains_project" {
  command = plan

  assert {
    condition     = aws_ecs_cluster.main.name == "${var.project_name}-cluster"
    error_message = "ECS cluster name must be '<project_name>-cluster'."
  }
}

run "ecs_cluster_has_required_tags" {
  command = plan

  assert {
    condition     = aws_ecs_cluster.main.tags["Project"] == var.project_name
    error_message = "ECS cluster must have 'Project' tag."
  }

  assert {
    condition     = aws_ecs_cluster.main.tags["Environment"] == var.environment
    error_message = "ECS cluster must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# Backend Task Definition
# ─────────────────────────────────────────────
run "backend_task_definition_family" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.backend.family == "${var.project_name}-backend"
    error_message = "Backend task definition family must be '<project_name>-backend'."
  }
}

run "backend_task_definition_requires_fargate" {
  command = plan

  assert {
    condition     = contains(aws_ecs_task_definition.backend.requires_compatibilities, "FARGATE")
    error_message = "Backend task definition must require FARGATE compatibility."
  }
}

run "backend_task_definition_uses_awsvpc_network_mode" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.backend.network_mode == "awsvpc"
    error_message = "Backend task definition must use 'awsvpc' network mode (required by Fargate)."
  }
}

run "backend_task_definition_cpu_matches_variable" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.backend.cpu == tostring(var.backend_cpu)
    error_message = "Backend task definition CPU must match var.backend_cpu."
  }
}

run "backend_task_definition_memory_matches_variable" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.backend.memory == tostring(var.backend_memory)
    error_message = "Backend task definition memory must match var.backend_memory."
  }
}

run "backend_task_definition_has_required_tags" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.backend.tags["Project"] == var.project_name
    error_message = "Backend task definition must have 'Project' tag."
  }

  assert {
    condition     = aws_ecs_task_definition.backend.tags["Environment"] == var.environment
    error_message = "Backend task definition must have 'Environment' tag."
  }
}

run "backend_task_definition_health_check_uses_ready_endpoint" {
  command = plan

  assert {
    condition     = strcontains(file("${path.module}/ecs.tf"), "healthCheck = {") && strcontains(file("${path.module}/ecs.tf"), "CMD-SHELL") && strcontains(file("${path.module}/ecs.tf"), "/api/ready')\\\" || exit 1")
    error_message = "Backend container health check command must probe '/api/ready'."
  }
}

# ─────────────────────────────────────────────
# Frontend Task Definition
# ─────────────────────────────────────────────
run "frontend_task_definition_family" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.frontend.family == "${var.project_name}-frontend"
    error_message = "Frontend task definition family must be '<project_name>-frontend'."
  }
}

run "frontend_task_definition_requires_fargate" {
  command = plan

  assert {
    condition     = contains(aws_ecs_task_definition.frontend.requires_compatibilities, "FARGATE")
    error_message = "Frontend task definition must require FARGATE compatibility."
  }
}

run "frontend_task_definition_uses_awsvpc_network_mode" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.frontend.network_mode == "awsvpc"
    error_message = "Frontend task definition must use 'awsvpc' network mode (required by Fargate)."
  }
}

run "frontend_task_definition_cpu_matches_variable" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.frontend.cpu == tostring(var.frontend_cpu)
    error_message = "Frontend task definition CPU must match var.frontend_cpu."
  }
}

run "frontend_task_definition_memory_matches_variable" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.frontend.memory == tostring(var.frontend_memory)
    error_message = "Frontend task definition memory must match var.frontend_memory."
  }
}

run "frontend_task_definition_has_required_tags" {
  command = plan

  assert {
    condition     = aws_ecs_task_definition.frontend.tags["Project"] == var.project_name
    error_message = "Frontend task definition must have 'Project' tag."
  }

  assert {
    condition     = aws_ecs_task_definition.frontend.tags["Environment"] == var.environment
    error_message = "Frontend task definition must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# ECS Services
# ─────────────────────────────────────────────
run "backend_service_no_public_ip" {
  command = plan

  assert {
    condition     = aws_ecs_service.backend.network_configuration[0].assign_public_ip == false
    error_message = "Backend ECS service must not assign public IPs (tasks run in private subnets)."
  }
}

run "backend_service_desired_count_matches_variable" {
  command = plan

  assert {
    condition     = aws_ecs_service.backend.desired_count == var.backend_desired_count
    error_message = "Backend service desired count must match var.backend_desired_count."
  }
}

run "backend_service_uses_fargate_launch_type" {
  command = plan

  assert {
    condition     = aws_ecs_service.backend.launch_type == "FARGATE"
    error_message = "Backend ECS service must use FARGATE launch type."
  }
}

run "backend_service_has_required_tags" {
  command = plan

  assert {
    condition     = aws_ecs_service.backend.tags["Project"] == var.project_name
    error_message = "Backend ECS service must have 'Project' tag."
  }

  assert {
    condition     = aws_ecs_service.backend.tags["Environment"] == var.environment
    error_message = "Backend ECS service must have 'Environment' tag."
  }
}

run "frontend_service_no_public_ip" {
  command = plan

  assert {
    condition     = aws_ecs_service.frontend.network_configuration[0].assign_public_ip == false
    error_message = "Frontend ECS service must not assign public IPs (tasks run in private subnets)."
  }
}

run "frontend_service_desired_count_matches_variable" {
  command = plan

  assert {
    condition     = aws_ecs_service.frontend.desired_count == var.frontend_desired_count
    error_message = "Frontend service desired count must match var.frontend_desired_count."
  }
}

run "frontend_service_uses_fargate_launch_type" {
  command = plan

  assert {
    condition     = aws_ecs_service.frontend.launch_type == "FARGATE"
    error_message = "Frontend ECS service must use FARGATE launch type."
  }
}

run "frontend_service_has_required_tags" {
  command = plan

  assert {
    condition     = aws_ecs_service.frontend.tags["Project"] == var.project_name
    error_message = "Frontend ECS service must have 'Project' tag."
  }

  assert {
    condition     = aws_ecs_service.frontend.tags["Environment"] == var.environment
    error_message = "Frontend ECS service must have 'Environment' tag."
  }
}
