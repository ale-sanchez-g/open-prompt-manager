# ─────────────────────────────────────────────
# OpenTelemetry Collector — ECS sidecar (#339)
#
# Foundation for OTel across the stack: a Collector runs as a sidecar
# container inside the backend Fargate task and receives OTLP
# (traces/metrics/logs) from the backend over the task's shared
# network namespace (localhost:4317 grpc / localhost:4318 http).
# Forwarding is backend-agnostic — only the `otel_exporter_otlp_*`
# variables (and the SSM parameter they render into) change once a
# telemetry backend is chosen in #346; nothing here is coupled to
# Grafana or SigNoz specifically.
#
# Self-contained on purpose: every variable, resource, and IAM policy
# the Collector needs lives in this single file so it can be iterated
# on without generating merge churn in the shared variables.tf/iam.tf
# files that other concurrent infra issues also touch. The only
# outside references are to resources this file does not own
# (aws_iam_role.ecs_task_execution, aws_kms_key.secrets/logs/ecr) and the
# container definition it contributes to aws_ecs_task_definition.backend
# in ecs.tf.
# ─────────────────────────────────────────────

# ───────────── Variables ─────────────

variable "otel_collector_enabled" {
  description = "If true, adds the OpenTelemetry Collector as a sidecar container to the backend ECS task definition."
  type        = bool
  default     = true
}

variable "otel_collector_image" {
  description = "Container image for the OpenTelemetry Collector sidecar, pinned by digest (AWS Distro for OpenTelemetry Collector -- public.ecr.aws/aws-observability/aws-otel-collector). The default digest below is the multi-arch image index for the ':latest' tag resolved at the time this was written; bump it deliberately after reviewing upstream release notes, never point this at a mutable tag."
  type        = string
  default     = "public.ecr.aws/aws-observability/aws-otel-collector@sha256:a465f606684ab1ac3c5221c8bffe783b0120c8bd5318e1bf63c90f2cf56af835"
}

variable "otel_collector_memory" {
  description = "Soft memory limit (MiB) for the otel-collector sidecar container within the backend task, and the basis for the memory_limiter processor's limit_mib/spike_limit_mib. var.backend_memory must leave enough headroom on top of the backend container's own needs to fit this."
  type        = number
  default     = 256
}

variable "otel_resourcedetection_detectors" {
  description = "Ordered detector list for the resourcedetection processor. 'ec2' is a no-op on Fargate (no EC2 IMDS present) and is kept for parity with any future EC2-launch-type deployment."
  type        = list(string)
  default     = ["env", "ecs", "ec2"]
}

variable "otel_exporter_otlp_endpoint" {
  description = "OTLP/HTTP endpoint the Collector forwards traces/metrics/logs to once a backend is chosen (#346), e.g. a Grafana Cloud or SigNoz OTLP gateway URL. Leave empty (default) to use the 'debug' exporter, which just logs telemetry to CloudWatch instead of forwarding it anywhere -- a safe no-op until a backend is decided."
  type        = string
  default     = ""
}

variable "otel_exporter_otlp_headers" {
  description = "Extra HTTP headers (e.g. Authorization / API key) sent with every OTLP export request to var.otel_exporter_otlp_endpoint. Rendered only into the SecureString SSM parameter below -- never written to a plaintext ECS 'environment' block or logged."
  type        = map(string)
  default     = {}
  sensitive   = true
}

# ───────────── Mirror registry (private ECR) ─────────────
# The Collector image lives on the ECR *Public* Gallery, which the
# backend's private-egress VPC cannot reach: the ecr.api/ecr.dkr
# interface endpoints only proxy private ECR, so pulling the sidecar
# image times out with CannotPullContainerError (#365). This repository
# holds a mirror of that upstream image so the pull stays inside the VPC.
resource "aws_ecr_repository" "otel_collector_mirror" {
  name = "${var.project_name}-otel-collector"
  # IMMUTABLE (unlike the MUTABLE backend/frontend repos): this only ever
  # holds a mirror of a third-party image pinned by digest, never an app
  # rebuild that reuses a tag.
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.ecr.arn
  }

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${var.project_name}-otel-collector"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_ecr_lifecycle_policy" "otel_collector_mirror" {
  repository = aws_ecr_repository.otel_collector_mirror.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ───────────── Rendered Collector config ─────────────

locals {
  otel_use_configured_exporter = var.otel_exporter_otlp_endpoint != ""

  # memory_limiter is configured with absolute limit_mib/spike_limit_mib
  # (rather than limit_percentage) because that is the reliable option in
  # a containerized sidecar: it does not depend on the process correctly
  # discovering a cgroup memory ceiling, just the memory we've told ECS to
  # give this container below.
  otel_memory_limiter_limit_mib       = max(floor(var.otel_collector_memory * 0.8), 32)
  otel_memory_limiter_spike_limit_mib = max(floor(var.otel_collector_memory * 0.25), 16)

  otel_collector_config = <<-EOT
    extensions:
      health_check:
        endpoint: 0.0.0.0:13133

    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318

    processors:
      memory_limiter:
        check_interval: 1s
        limit_mib: ${local.otel_memory_limiter_limit_mib}
        spike_limit_mib: ${local.otel_memory_limiter_spike_limit_mib}
      batch:
        timeout: 5s
        send_batch_size: 8192
      resourcedetection:
        detectors: [${join(", ", var.otel_resourcedetection_detectors)}]
        timeout: 2s
        override: false

    exporters:
      debug:
        verbosity: basic
      %{~if local.otel_use_configured_exporter~}
      otlphttp:
        endpoint: "${var.otel_exporter_otlp_endpoint}"
        %{~if length(var.otel_exporter_otlp_headers) > 0~}
        headers:
        %{~for key, value in var.otel_exporter_otlp_headers~}
          "${key}": "${value}"
        %{~endfor~}
        %{~endif~}
      %{~endif~}

    service:
      extensions: [health_check]
      pipelines:
        traces:
          receivers: [otlp]
          processors: [memory_limiter, resourcedetection, batch]
          exporters: [${local.otel_use_configured_exporter ? "otlphttp" : "debug"}]
        metrics:
          receivers: [otlp]
          processors: [memory_limiter, resourcedetection, batch]
          exporters: [${local.otel_use_configured_exporter ? "otlphttp" : "debug"}]
        logs:
          receivers: [otlp]
          processors: [memory_limiter, resourcedetection, batch]
          exporters: [${local.otel_use_configured_exporter ? "otlphttp" : "debug"}]
  EOT
}

# ───────────── Config distribution (SSM Parameter Store) ─────────────
# The rendered YAML above is stored as a SecureString SSM parameter and
# injected into the container as the AOT_CONFIG_CONTENT environment
# variable via the task definition's `secrets` (valueFrom) mechanism --
# the ADOT Collector's documented way of overriding its config from an
# env var. Because the value comes from `secrets`/valueFrom rather than
# being baked into the task definition's plain `environment` list or the
# container image, the exporter target can be changed by updating this
# parameter's value and forcing a new ECS deployment: no new task
# definition revision, no image rebuild.
resource "aws_ssm_parameter" "otel_collector_config" {
  name        = "/${var.project_name}/${var.environment}/otel/collector-config"
  description = "OpenTelemetry Collector YAML config for the ${var.project_name} ECS sidecar (#339). Injected as AOT_CONFIG_CONTENT."
  type        = "SecureString"
  key_id      = aws_kms_key.secrets.arn
  tier        = "Standard"
  value       = local.otel_collector_config

  tags = {
    Name        = "${var.project_name}-otel-collector-config"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ───────────── Logging ─────────────

resource "aws_cloudwatch_log_group" "otel_collector" {
  name              = "/ecs/${var.project_name}/otel-collector"
  retention_in_days = var.cloudwatch_log_retention_in_days
  kms_key_id        = aws_kms_key.logs.arn

  tags = {
    Name        = "${var.project_name}-otel-collector-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ───────────── IAM (least privilege, self-contained) ─────────────
# Only the ECS task EXECUTION role needs new permissions: it is the role
# ECS uses to resolve `secrets`/valueFrom entries (SSM/Secrets Manager)
# when launching the task, the same mechanism already used for
# DATABASE_URL/JWT_SECRET in iam.tf. Scoped to exactly this one
# parameter -- nothing else.
#
# The ECS TASK role (aws_iam_role.ecs_task, assumed by the running
# containers) is intentionally granted nothing new here: the
# resourcedetection processor only talks to the local ECS/EC2 metadata
# endpoints (no IAM involved), and the debug/otlphttp exporters make
# plain HTTPS calls with no AWS SigV4/IAM auth. Zero added permissions
# is the least-privilege outcome when the workload needs zero AWS API
# access.
#
# KMS: aws_kms_key.secrets (defined in kms.tf) already grants
# aws_iam_role.ecs_task_execution kms:Decrypt/DescribeKey account-wide
# (see the AllowEcsExecutionRoleDecrypt statement), so reusing that key
# for this SecureString parameter needs no further KMS changes.
resource "aws_iam_role_policy" "ecs_execution_otel_config" {
  name = "${var.project_name}-ecs-execution-otel-config-policy"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameters"]
        Resource = [aws_ssm_parameter.otel_collector_config.arn]
      }
    ]
  })
}

# ───────────── Sidecar container definition ─────────────
# Consumed from ecs.tf, which appends this to the backend task's
# container_definitions list when var.otel_collector_enabled is true.
# Kept as a local (rather than duplicated JSON) so this file remains the
# single place that defines everything about the Collector.
locals {
  otel_sidecar_container_definition = {
    name      = "otel-collector"
    image     = var.otel_collector_image
    essential = false
    memory    = var.otel_collector_memory

    portMappings = [
      {
        containerPort = 4317
        protocol      = "tcp"
      },
      {
        containerPort = 4318
        protocol      = "tcp"
      }
    ]

    secrets = [
      {
        name      = "AOT_CONFIG_CONTENT"
        valueFrom = aws_ssm_parameter.otel_collector_config.arn
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.otel_collector.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "otel-collector"
      }
    }
  }
}
