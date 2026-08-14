# ─────────────────────────────────────────────
# CloudWatch Log Groups
# ─────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project_name}/backend"
  retention_in_days = var.cloudwatch_log_retention_in_days
  kms_key_id        = aws_kms_key.logs.arn

  tags = {
    Name        = "${var.project_name}-backend-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${var.project_name}/frontend"
  retention_in_days = var.cloudwatch_log_retention_in_days
  kms_key_id        = aws_kms_key.logs.arn

  tags = {
    Name        = "${var.project_name}-frontend-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─────────────────────────────────────────────
# ECS Cluster
# ─────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "${var.project_name}-cluster"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ─────────────────────────────────────────────
# Backend Task Definition & Service
# ─────────────────────────────────────────────
locals {
  backend_image_uri    = var.backend_image != "" ? var.backend_image : "${aws_ecr_repository.backend.repository_url}:latest"
  frontend_image_uri   = var.frontend_image != "" ? var.frontend_image : "${aws_ecr_repository.frontend.repository_url}:latest"
  cors_allowed_origins = join(",", distinct(compact(concat(["vscode-file://vscode-app", "http://${aws_lb.main.dns_name}"], [for d in var.domain_names : "https://${d}"], var.domain_name != "" ? ["https://${var.domain_name}"] : []))))
  # "vscode-app" is the netloc VS Code sends in its Origin header (vscode-file://vscode-app).
  # It must be included so the MCP SDK does not reject VS Code client connections with 403.
  mcp_allowed_hosts   = join(",", distinct(compact(concat(["vscode-app", aws_lb.main.dns_name], var.domain_names, var.domain_name != "" ? [var.domain_name] : []))))
  mcp_allowed_origins = "vscode-file://vscode-app"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project_name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode(concat(
    [
      {
        name      = "backend"
        image     = local.backend_image_uri
        essential = true

        portMappings = [
          {
            containerPort = var.backend_port
            protocol      = "tcp"
          }
        ]

        environment = [
          {
            name  = "CORS_ORIGINS"
            value = local.cors_allowed_origins
          },
          {
            # Allow MCP clients connecting through the ALB.  The default only
            # permits localhost, which would cause 403s in production.
            name  = "MCP_ALLOWED_HOSTS"
            value = local.mcp_allowed_hosts
          },
          {
            # VS Code's MCP client sends Origin: vscode-file://vscode-app.
            name  = "MCP_ALLOWED_ORIGINS"
            value = local.mcp_allowed_origins
          },
          {
            name  = "RATE_LIMIT_ENABLED"
            value = tostring(var.rate_limit_enabled)
          },
          {
            name  = "RATE_LIMIT_PER_MINUTE"
            value = tostring(var.rate_limit_per_minute)
          },
          {
            name  = "RATE_LIMIT_AUTH_PER_MINUTE"
            value = tostring(var.rate_limit_auth_per_minute)
          },
          {
            # otel-collector (#339) is a sidecar in this same task, sharing
            # its network namespace, so it is reachable over localhost.
            # These are provided so backend instrumentation (#340) has a
            # known, stable endpoint to export OTLP to without needing
            # another change to this file.
            name  = "OTEL_EXPORTER_OTLP_ENDPOINT"
            value = "http://localhost:4318"
          },
          {
            name  = "OTEL_EXPORTER_OTLP_PROTOCOL"
            value = "http/protobuf"
          },
          {
            name  = "OTEL_SERVICE_NAME"
            value = "${var.project_name}-backend"
          }
        ]

        secrets = [
          {
            name      = "DATABASE_URL"
            valueFrom = aws_secretsmanager_secret.db_url.arn
          },
          {
            name      = "JWT_SECRET"
            valueFrom = aws_secretsmanager_secret.jwt_secret.arn
          },
          {
            name      = "OPM_ENCRYPTION_KEY"
            valueFrom = aws_secretsmanager_secret.opm_encryption_key.arn
          }
        ]

        logConfiguration = {
          logDriver = "awslogs"
          options = {
            "awslogs-group"         = aws_cloudwatch_log_group.backend.name
            "awslogs-region"        = var.aws_region
            "awslogs-stream-prefix" = "backend"
          }
        }

        healthCheck = {
          command     = ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:${var.backend_port}/api/ready')\" || exit 1"]
          interval    = 30
          timeout     = 10
          retries     = 3
          startPeriod = 15
        }
      }
    ],
    # otel-collector (#339): OTLP fan-in sidecar, defined in otel.tf so
    # everything about the Collector lives in one self-contained file.
    var.otel_collector_enabled ? [local.otel_sidecar_container_definition] : []
  ))

  tags = {
    Name        = "${var.project_name}-backend-task"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_ecs_service" "backend" {
  name            = "${var.project_name}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = var.backend_port
  }

  depends_on = [
    aws_lb_listener.http,
    aws_iam_role_policy_attachment.ecs_task_execution,
    aws_iam_role_policy.ecs_execution_secrets,
    aws_secretsmanager_secret_version.db_url,
    aws_iam_role_policy.ecs_execution_otel_config,
    aws_ssm_parameter.otel_collector_config,
  ]

  tags = {
    Name        = "${var.project_name}-backend-service"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Frontend Task Definition & Service
# ─────────────────────────────────────────────
resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.project_name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = local.frontend_image_uri
      essential = true

      portMappings = [
        {
          containerPort = var.frontend_port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          # In ECS, ALB routes /api/* directly to the backend service — nginx never
          # receives those requests. This value just satisfies nginx startup (envsubst).
          name  = "BACKEND_URL"
          value = "http://127.0.0.1:8000"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "frontend"
        }
      }
    }
  ])

  tags = {
    Name        = "${var.project_name}-frontend-task"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_ecs_service" "frontend" {
  name            = "${var.project_name}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.frontend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.frontend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = var.frontend_port
  }

  depends_on = [
    aws_lb_listener.http,
    aws_iam_role_policy_attachment.ecs_task_execution,
  ]

  tags = {
    Name        = "${var.project_name}-frontend-service"
    Project     = var.project_name
    Environment = var.environment
  }
}
