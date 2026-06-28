# ─────────────────────────────────────────────
# VPC Endpoints
# Keep ECS task traffic to AWS APIs inside the VPC
# instead of routing it over the public internet
# through the NAT Gateway. Interface (PrivateLink)
# endpoints are provisioned for the services the
# tasks depend on, and a gateway endpoint serves S3
# (where ECR stores image layers). This is what lets
# the application security groups drop their
# unrestricted 0.0.0.0/0 egress (CKV_AWS_382).
# ─────────────────────────────────────────────
locals {
  # AWS interface endpoints required by the ECS tasks.
  interface_endpoints = [
    "ecr.api",        # ECR control plane (auth, manifests)
    "ecr.dkr",        # ECR Docker registry (image pulls)
    "logs",           # CloudWatch Logs (awslogs driver)
    "secretsmanager", # DATABASE_URL / JWT secret injection
    "sts",            # Task role credential vending
    "kms",            # Decrypt ECR / Secrets Manager KMS keys
  ]
}

# Security group for the interface endpoint ENIs. Accepts HTTPS only
# from within the VPC; responses use the stateful return path, so no
# egress rules are required.
resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.project_name}-vpce-sg"
  description = "Allow HTTPS from within the VPC to interface VPC endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from within the VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name        = "${var.project_name}-vpce-sg"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "interface" {
  for_each = toset(local.interface_endpoints)

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name        = "${var.project_name}-vpce-${replace(each.value, ".", "-")}"
    Project     = var.project_name
    Environment = var.environment
  }
}

# S3 gateway endpoint — ECR stores image layers in S3, so pulls need a
# route to S3 that does not traverse the NAT Gateway / public internet.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]

  tags = {
    Name        = "${var.project_name}-vpce-s3"
    Project     = var.project_name
    Environment = var.environment
  }
}
