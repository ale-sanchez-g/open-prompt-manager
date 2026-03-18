# ─────────────────────────────────────────────
# ECS Task Execution Role
# Allows ECS to pull images from ECR and write
# logs to CloudWatch on behalf of the task.
# ─────────────────────────────────────────────
data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${var.project_name}-ecs-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = {
    Name        = "${var.project_name}-ecs-task-execution-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ─────────────────────────────────────────────
# ECS Task Role
# Permissions granted to the running container
# (e.g. access to S3 or SSM Parameter Store).
# Add additional policy attachments below as
# your application requires them.
# ─────────────────────────────────────────────
resource "aws_iam_role" "ecs_task" {
  name               = "${var.project_name}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = {
    Name        = "${var.project_name}-ecs-task-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Allow the task execution role to read the
# DATABASE_URL secret so ECS can inject it into
# the container at launch time.
# ─────────────────────────────────────────────
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${var.project_name}-ecs-execution-secrets-policy"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.db_url.arn]
      }
    ]
  })
}
