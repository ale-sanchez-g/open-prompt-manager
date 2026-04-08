# ─────────────────────────────────────────────
# General
# ─────────────────────────────────────────────
variable "aws_region" {
  description = "AWS region where all resources will be deployed."
  type        = string
  default     = "ap-southeast-2"
}

variable "project_name" {
  description = "Short name used to prefix every resource (e.g. open-prompt-manager)."
  type        = string
  default     = "open-prompt-manager"
}

variable "environment" {
  description = "Deployment environment label (e.g. dev, staging, prod)."
  type        = string
  default     = "prod"
}

# ─────────────────────────────────────────────
# Networking
# ─────────────────────────────────────────────
variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per Availability Zone)."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per Availability Zone)."
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "availability_zones" {
  description = "List of Availability Zones in which to create subnets."
  type        = list(string)
  default     = ["ap-southeast-2a", "ap-southeast-2b"]
}

# ─────────────────────────────────────────────
# ECS / Application
# ─────────────────────────────────────────────
variable "backend_image" {
  description = "Full URI of the backend Docker image (ECR or any registry)."
  type        = string
  default     = ""
}

variable "frontend_image" {
  description = "Full URI of the frontend Docker image (ECR or any registry)."
  type        = string
  default     = ""
}

variable "backend_cpu" {
  description = "vCPU units reserved for the backend Fargate task (1024 = 1 vCPU)."
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Memory (MiB) reserved for the backend Fargate task."
  type        = number
  default     = 1024
}

variable "frontend_cpu" {
  description = "vCPU units reserved for the frontend Fargate task."
  type        = number
  default     = 256
}

variable "frontend_memory" {
  description = "Memory (MiB) reserved for the frontend Fargate task."
  type        = number
  default     = 512
}

variable "backend_desired_count" {
  description = "Desired number of backend ECS tasks."
  type        = number
  default     = 2
}

variable "frontend_desired_count" {
  description = "Desired number of frontend ECS tasks."
  type        = number
  default     = 2
}

variable "backend_port" {
  description = "Container port exposed by the backend service."
  type        = number
  default     = 8000
}

variable "frontend_port" {
  description = "Container port exposed by the frontend service."
  type        = number
  default     = 80
}

# ─────────────────────────────────────────────
# Database (RDS PostgreSQL)
# ─────────────────────────────────────────────
variable "db_name" {
  description = "Name of the PostgreSQL database to create."
  type        = string
  default     = "promptmanager"
}

variable "db_username" {
  description = "Master username for the RDS instance."
  type        = string
  default     = "dbadmin"
}

variable "db_instance_class" {
  description = "RDS instance type (e.g. db.t4g.micro for dev, db.t4g.small for prod)."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GiB for the RDS instance."
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for RDS high availability (recommended for production)."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Prevent accidental deletion of the RDS instance. Set to true for production."
  type        = bool
  default     = false
}

# ─────────────────────────────────────────────
# TLS/HTTPS
# ─────────────────────────────────────────────
variable "enable_https" {
  description = "Enable HTTPS/TLS with an ACM certificate. If true, either provide acm_certificate_arn or set create_certificate=true."
  type        = bool
  default     = false
}

variable "create_certificate" {
  description = "If true and enable_https=true, create a self-signed ACM certificate. If false, use the acm_certificate_arn variable."
  type        = bool
  default     = false
}

variable "domain_names" {
  description = "List of domain names for the certificate (e.g., ['example.com', 'www.example.com'])."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ARN of an existing ACM certificate for HTTPS. If not provided and create_certificate=true, a new certificate will be created."
  type        = string
  default     = ""
}

# ─────────────────────────────────────────────
# DNS / Route 53
# ─────────────────────────────────────────────
variable "create_route53_zone" {
  description = "If true, create a Route 53 hosted zone for your domain. Requires domain_name to be set."
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Existing public Route 53 hosted zone ID to use for DNS records. If set, Terraform will not create a new hosted zone."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Primary domain name (e.g., example.com). Required if create_route53_zone=true. Used for Route 53 hosted zone and certificate SANs."
  type        = string
  default     = ""
}
