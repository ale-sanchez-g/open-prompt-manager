# ─────────────────────────────────────────────
# Networking Outputs
# ─────────────────────────────────────────────
output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets."
  value       = aws_subnet.private[*].id
}

output "nat_gateway_id" {
  description = "ID of the NAT Gateway."
  value       = aws_nat_gateway.main.id
}

output "nat_gateway_public_ip" {
  description = "Public Elastic IP address of the NAT Gateway."
  value       = aws_eip.nat.public_ip
}

# ─────────────────────────────────────────────
# Application Outputs
# ─────────────────────────────────────────────
output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer. Use this to access the application."
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer."
  value       = aws_lb.main.arn
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster."
  value       = aws_ecs_cluster.main.name
}

output "backend_ecr_repository_url" {
  description = "ECR repository URL for the backend image."
  value       = aws_ecr_repository.backend.repository_url
}

output "frontend_ecr_repository_url" {
  description = "ECR repository URL for the frontend image."
  value       = aws_ecr_repository.frontend.repository_url
}

output "backend_target_group_arn" {
  description = "ARN of the backend ALB target group."
  value       = aws_lb_target_group.backend.arn
}

output "frontend_target_group_arn" {
  description = "ARN of the frontend ALB target group."
  value       = aws_lb_target_group.frontend.arn
}

output "application_url" {
  description = "URL to access the Open Prompt Manager application."
  value       = "http://${aws_lb.main.dns_name}"
}

output "mcp_url" {
  description = "MCP server endpoint for AI agent connectivity (Model Context Protocol)."
  value       = "http://${aws_lb.main.dns_name}/mcp"
}

# ─────────────────────────────────────────────
# Database Outputs
# ─────────────────────────────────────────────
output "db_endpoint" {
  description = "RDS instance endpoint (host:port). Use this for direct DB access from a bastion or VPN."
  value       = aws_db_instance.main.endpoint
}

output "db_name" {
  description = "Name of the PostgreSQL database."
  value       = aws_db_instance.main.db_name
}

output "db_secret_arn" {
  description = "ARN of the Secrets Manager secret that holds the DATABASE_URL. Reference this to retrieve credentials."
  value       = aws_secretsmanager_secret.db_url.arn
}
