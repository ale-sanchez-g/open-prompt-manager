# ─────────────────────────────────────────────
# ALB Security Group
# Inbound HTTPS from the internet; HTTP (port 80)
# only from restricted ranges (opt-in). Egress is
# limited to the application tasks inside the VPC.
# ─────────────────────────────────────────────
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Allow inbound HTTPS from the internet (HTTP only from restricted ranges)"
  vpc_id      = aws_vpc.main.id

  # Port 80 ingress is opt-in via var.alb_http_ingress_cidrs and is never
  # exposed to 0.0.0.0/0 (CKV_AWS_260). Leave the list empty for the
  # HTTPS-only target architecture; populate it with trusted source ranges
  # only while plaintext HTTP is temporarily required.
  dynamic "ingress" {
    for_each = length(var.alb_http_ingress_cidrs) > 0 ? [1] : []
    content {
      description = "HTTP from restricted source ranges"
      from_port   = 80
      to_port     = 80
      protocol    = "tcp"
      cidr_blocks = var.alb_http_ingress_cidrs
    }
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress is restricted to the application tasks inside the VPC; the ALB
  # only forwards requests to the frontend and backend target groups.
  egress {
    description = "Forward to frontend tasks within the VPC"
    from_port   = var.frontend_port
    to_port     = var.frontend_port
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Forward to backend tasks within the VPC"
    from_port   = var.backend_port
    to_port     = var.backend_port
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name        = "${var.project_name}-alb-sg"
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

  # No egress rules: the database never initiates outbound connections, so
  # declaring the resource without an egress block revokes the default
  # allow-all rule and leaves egress fully locked down (CKV_AWS_382).

  tags = {
    Name        = "${var.project_name}-rds-sg"
    Project     = var.project_name
    Environment = var.environment
  }
}
