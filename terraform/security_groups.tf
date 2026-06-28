# ─────────────────────────────────────────────
# ALB Security Group
# Inbound HTTPS from the internet; HTTP (port 80)
# only from restricted ranges (opt-in). Egress is
# limited to the application tasks inside the VPC.
# ─────────────────────────────────────────────
resource "aws_security_group" "alb" {
  # Use name_prefix (not a fixed name) together with create_before_destroy so
  # that when an immutable attribute forces replacement, Terraform can stand up
  # the new group (under a unique generated name), move the ALB onto it, and
  # only then delete the old one. A fixed name would collide during that
  # overlap window; destroy-before-create fails with DependencyViolation while
  # the ALB's ENIs still reference the old group.
  name_prefix = "${var.project_name}-alb-"
  description = "Allow inbound HTTPS from the internet (HTTP only from restricted ranges)"
  vpc_id      = aws_vpc.main.id

  # Rules are declared as separate aws_vpc_security_group_*_rule resources
  # below so that the public 0.0.0.0/0 HTTPS rule and the (opt-in,
  # never-public) HTTP rule are evaluated independently — keeping CKV_AWS_260
  # from cross-associating the two within a single resource. No inline
  # ingress/egress may be configured here (not even egress = []): inline
  # rules and standalone rule resources on the same security group conflict,
  # and an explicit empty egress would remove the standalone egress rules on
  # every subsequent apply. The provider already revokes AWS's default
  # allow-all egress rule when it creates the group, so the dedicated
  # aws_vpc_security_group_egress_rule resources fully control outbound access.

  tags = {
    Name        = "${var.project_name}-alb-sg"
    Project     = var.project_name
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from the internet"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"

  tags = {
    Name        = "${var.project_name}-alb-https-in"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Port 80 ingress is opt-in via var.alb_http_ingress_cidrs and is never
# exposed to 0.0.0.0/0 (CKV_AWS_260; the variable validation rejects it).
# Leave the list empty for the HTTPS-only target architecture; populate it
# with trusted source ranges only while plaintext HTTP is temporarily needed.
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  for_each = toset(var.alb_http_ingress_cidrs)

  security_group_id = aws_security_group.alb.id
  description       = "HTTP from restricted source range"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  cidr_ipv4         = each.value

  tags = {
    Name        = "${var.project_name}-alb-http-in"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Egress is restricted to the application tasks inside the VPC; the ALB only
# forwards requests to the frontend and backend target groups (CKV_AWS_382).
resource "aws_vpc_security_group_egress_rule" "alb_frontend" {
  security_group_id = aws_security_group.alb.id
  description       = "Forward to frontend tasks within the VPC"
  from_port         = var.frontend_port
  to_port           = var.frontend_port
  ip_protocol       = "tcp"
  cidr_ipv4         = var.vpc_cidr

  tags = {
    Name        = "${var.project_name}-alb-frontend-out"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_vpc_security_group_egress_rule" "alb_backend" {
  security_group_id = aws_security_group.alb.id
  description       = "Forward to backend tasks within the VPC"
  from_port         = var.backend_port
  to_port           = var.backend_port
  ip_protocol       = "tcp"
  cidr_ipv4         = var.vpc_cidr

  tags = {
    Name        = "${var.project_name}-alb-backend-out"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Frontend Security Group
# Allows traffic only from the ALB.
# ─────────────────────────────────────────────
resource "aws_security_group" "frontend" {
  name        = "${var.project_name}-frontend-sg"
  description = "Allow inbound traffic from ALB to frontend"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "From ALB"
    from_port       = var.frontend_port
    to_port         = var.frontend_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Outbound is restricted to in-VPC AWS endpoints and DNS; image layers
  # are pulled from S3 via the gateway endpoint prefix list. No 0.0.0.0/0
  # egress (CKV_AWS_382).
  egress {
    description = "HTTPS to AWS interface VPC endpoints (ECR, logs)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description     = "HTTPS to S3 via gateway endpoint (ECR image layers)"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [aws_vpc_endpoint.s3.prefix_list_id]
  }

  egress {
    description = "DNS (UDP) to the VPC resolver"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "DNS (TCP) to the VPC resolver"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name        = "${var.project_name}-frontend-sg"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Backend Security Group
# Allows traffic only from the ALB.
# ─────────────────────────────────────────────
resource "aws_security_group" "backend" {
  name        = "${var.project_name}-backend-sg"
  description = "Allow inbound traffic from ALB to backend"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "From ALB"
    from_port       = var.backend_port
    to_port         = var.backend_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Outbound is restricted to in-VPC AWS endpoints, S3 (gateway endpoint),
  # the RDS database, and DNS. No 0.0.0.0/0 egress (CKV_AWS_382).
  egress {
    description = "HTTPS to AWS interface VPC endpoints (ECR, logs, secrets, sts, kms)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description     = "HTTPS to S3 via gateway endpoint (ECR image layers)"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [aws_vpc_endpoint.s3.prefix_list_id]
  }

  egress {
    description = "PostgreSQL to RDS within the VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "DNS (UDP) to the VPC resolver"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "DNS (TCP) to the VPC resolver"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name        = "${var.project_name}-backend-sg"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─────────────────────────────────────────────
# RDS Security Group
# Allows PostgreSQL connections only from the
# backend ECS tasks. No public access.
# ─────────────────────────────────────────────
resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Allow inbound PostgreSQL from backend ECS tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from backend"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  ingress {
    description     = "PostgreSQL from secret-rotation Lambda"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.db_rotation.id]
  }

  # No egress rules: the database never initiates outbound connections, so
  # declaring the resource without an egress block revokes the default
  # allow-all rule and leaves egress fully locked down (CKV_AWS_382).

  tags = {
    Name        = "${var.project_name}-rds-sg"
    Project     = var.project_name
    Environment = var.environment
  }
}

# ─────────────────────────────────────────────
# Secret Rotation Lambda Security Group
# The DATABASE_URL rotation Lambda (rotation.tf)
# runs in the private subnets. It needs egress to
# PostgreSQL (to ALTER the password) and HTTPS (to
# reach the Secrets Manager API via NAT/endpoint).
# ─────────────────────────────────────────────
resource "aws_security_group" "db_rotation" {
  name        = "${var.project_name}-db-rotation-sg"
  description = "Secret rotation Lambda egress to RDS and Secrets Manager"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "PostgreSQL to RDS"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "HTTPS to AWS APIs (Secrets Manager, KMS)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-db-rotation-sg"
    Project     = var.project_name
    Environment = var.environment
  }
}
