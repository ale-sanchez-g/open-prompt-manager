# ─────────────────────────────────────────────
# RDS Master User Password
# Generated randomly and stored in Secrets Manager.
# Never set as a plain-text environment variable.
# ─────────────────────────────────────────────
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ─────────────────────────────────────────────
# Secrets Manager — DATABASE_URL
# Stores the full PostgreSQL connection string.
# The ECS task execution role is granted read
# access so ECS can inject it at container start.
# ─────────────────────────────────────────────
resource "aws_secretsmanager_secret" "db_url" {
  name                    = "${var.project_name}/${var.environment}/database-url"
  description             = "PostgreSQL DATABASE_URL for the ${var.project_name} backend service"
  recovery_window_in_days = 7

  tags = {
    Name        = "${var.project_name}-db-url-secret"
    project     = var.project_name
    environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id = aws_secretsmanager_secret.db_url.id

  # Construct the SQLAlchemy-compatible URL after RDS is created.
  secret_string = format(
    "postgresql://%s:%s@%s:%s/%s",
    var.db_username,
    random_password.db_password.result,
    aws_db_instance.main.address,
    aws_db_instance.main.port,
    var.db_name
  )
}

# ─────────────────────────────────────────────
# DB Subnet Group
# RDS must be placed in at least two AZs; the
# existing private subnets fulfil this requirement.
# ─────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-${var.environment}"
  description = "Subnet group for ${var.project_name} RDS instance"
  subnet_ids  = aws_subnet.private[*].id

  tags = {
    Name        = "${var.project_name}-db-subnet-group"
    project     = var.project_name
    environment = var.environment
  }
}

# ─────────────────────────────────────────────
# RDS PostgreSQL Instance
# Deployed into private subnets, encrypted at
# rest, and reachable only from the backend SG.
# ─────────────────────────────────────────────
resource "aws_db_instance" "main" {
  identifier        = "${var.project_name}-${var.environment}"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = var.db_multi_az
  publicly_accessible = false
  deletion_protection = var.db_deletion_protection

  # Take a final snapshot before deletion only when deletion_protection is on,
  # which signals a production-grade deployment.
  skip_final_snapshot       = !var.db_deletion_protection
  final_snapshot_identifier = var.db_deletion_protection ? "${var.project_name}-${var.environment}-final-snapshot" : null

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  tags = {
    Name        = "${var.project_name}-db"
    project     = var.project_name
    environment = var.environment
  }
}
