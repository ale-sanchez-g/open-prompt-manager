# Tests for security groups: ALB, frontend, backend.
# Uses mock_provider so no AWS credentials are required in CI.

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

variables {
  project_name  = "opm-test"
  environment   = "test"
  aws_region    = "us-east-1"
  vpc_cidr      = "10.0.0.0/16"
  frontend_port = 80
  backend_port  = 8000
}

# ─────────────────────────────────────────────
# ALB Security Group
# ─────────────────────────────────────────────
run "alb_sg_no_public_http_ingress_by_default" {
  command = plan

  # ALB rules are separate aws_vpc_security_group_*_rule resources. With the
  # default (empty) alb_http_ingress_cidrs no HTTP (port 80) rule is created
  # at all, so it can never be exposed to 0.0.0.0/0 (CKV_AWS_260).
  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.alb_http) == 0
    error_message = "ALB must not create an HTTP (port 80) ingress rule when alb_http_ingress_cidrs is empty."
  }
}

run "alb_sg_http_ingress_restricted_when_enabled" {
  command = plan

  variables {
    alb_http_ingress_cidrs = ["203.0.113.0/24"]
  }

  assert {
    condition = anytrue([
      for r in aws_vpc_security_group_ingress_rule.alb_http : r.from_port == 80 && r.to_port == 80 && r.cidr_ipv4 == "203.0.113.0/24"
    ])
    error_message = "ALB must allow HTTP (port 80) from the configured restricted range."
  }

  assert {
    condition = alltrue([
      for r in aws_vpc_security_group_ingress_rule.alb_http : r.cidr_ipv4 != "0.0.0.0/0"
    ])
    error_message = "ALB HTTP ingress must never come from 0.0.0.0/0 (CKV_AWS_260)."
  }
}

run "alb_sg_allows_https_ingress" {
  command = plan

  assert {
    condition     = aws_vpc_security_group_ingress_rule.alb_https.from_port == 443 && aws_vpc_security_group_ingress_rule.alb_https.cidr_ipv4 == "0.0.0.0/0"
    error_message = "ALB security group must allow inbound HTTPS (port 443) from 0.0.0.0/0."
  }
}

run "alb_sg_egress_not_open_to_world" {
  command = plan

  assert {
    condition     = length(aws_security_group.alb.egress) == 0
    error_message = "ALB security group must revoke the default inline allow-all egress rule."
  }

  assert {
    condition     = aws_vpc_security_group_egress_rule.alb_frontend.cidr_ipv4 != "0.0.0.0/0" && aws_vpc_security_group_egress_rule.alb_backend.cidr_ipv4 != "0.0.0.0/0"
    error_message = "ALB egress must not allow 0.0.0.0/0 (CKV_AWS_382)."
  }
}

run "alb_sg_name_contains_project" {
  command = plan

  assert {
    condition     = aws_security_group.alb.name == "${var.project_name}-alb-sg"
    error_message = "ALB security group name must follow the pattern '<project_name>-alb-sg'."
  }
}

run "alb_sg_has_required_tags" {
  command = plan

  assert {
    condition     = aws_security_group.alb.tags["Project"] == var.project_name
    error_message = "ALB security group must have 'Project' tag."
  }

  assert {
    condition     = aws_security_group.alb.tags["Environment"] == var.environment
    error_message = "ALB security group must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# Frontend Security Group
# ─────────────────────────────────────────────
run "frontend_sg_ingress_port_matches_variable" {
  command = plan

  assert {
    condition = anytrue([
      for r in aws_security_group.frontend.ingress : r.from_port == var.frontend_port && r.to_port == var.frontend_port
    ])
    error_message = "Frontend security group must allow ingress on var.frontend_port (${var.frontend_port})."
  }
}

run "frontend_sg_name_contains_project" {
  command = plan

  assert {
    condition     = aws_security_group.frontend.name == "${var.project_name}-frontend-sg"
    error_message = "Frontend security group name must follow '<project_name>-frontend-sg'."
  }
}

run "frontend_sg_has_required_tags" {
  command = plan

  assert {
    condition     = aws_security_group.frontend.tags["Project"] == var.project_name
    error_message = "Frontend security group must have 'Project' tag."
  }

  assert {
    condition     = aws_security_group.frontend.tags["Environment"] == var.environment
    error_message = "Frontend security group must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# Backend Security Group
# ─────────────────────────────────────────────
run "backend_sg_ingress_port_matches_variable" {
  command = plan

  assert {
    condition = anytrue([
      for r in aws_security_group.backend.ingress : r.from_port == var.backend_port && r.to_port == var.backend_port
    ])
    error_message = "Backend security group must allow ingress on var.backend_port (${var.backend_port})."
  }
}

run "backend_sg_name_contains_project" {
  command = plan

  assert {
    condition     = aws_security_group.backend.name == "${var.project_name}-backend-sg"
    error_message = "Backend security group name must follow '<project_name>-backend-sg'."
  }
}

run "backend_sg_has_required_tags" {
  command = plan

  assert {
    condition     = aws_security_group.backend.tags["Project"] == var.project_name
    error_message = "Backend security group must have 'Project' tag."
  }

  assert {
    condition     = aws_security_group.backend.tags["Environment"] == var.environment
    error_message = "Backend security group must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# Restricted egress (CKV_AWS_382)
# ─────────────────────────────────────────────
run "frontend_sg_egress_not_open_to_world" {
  command = plan

  # The S3 gateway/prefix-list-only egress rule has cidr_blocks == null, so
  # coalesce to an empty list before checking for 0.0.0.0/0.
  assert {
    condition = alltrue([
      for r in aws_security_group.frontend.egress : !contains(coalesce(r.cidr_blocks, []), "0.0.0.0/0")
    ])
    error_message = "Frontend egress must not allow 0.0.0.0/0 (CKV_AWS_382)."
  }
}

run "backend_sg_egress_not_open_to_world" {
  command = plan

  assert {
    condition = alltrue([
      for r in aws_security_group.backend.egress : !contains(coalesce(r.cidr_blocks, []), "0.0.0.0/0")
    ])
    error_message = "Backend egress must not allow 0.0.0.0/0 (CKV_AWS_382)."
  }

  assert {
    condition = anytrue([
      for r in aws_security_group.backend.egress : r.from_port == 5432 && r.to_port == 5432
    ])
    error_message = "Backend must retain egress to PostgreSQL (port 5432)."
  }
}

# Uses command = apply: with no egress block the security group's egress set
# is Computed and therefore unknown at plan time, so the count can only be
# evaluated after apply (mock_provider resolves it to an empty set).
# The apply is targeted at the RDS security group: a full mocked apply fails
# because mock_provider fills computed ARNs (aws_lb.main.arn, IAM role ARNs,
# log group ARNs) with random strings that downstream resources reject as
# invalid ARNs. The target closure only contains VPC/SG resources, which
# carry no ARN-validated attributes.
run "rds_sg_has_no_egress" {
  command = apply

  plan_options {
    target = [aws_security_group.rds]
  }

  assert {
    condition     = length(aws_security_group.rds.egress) == 0
    error_message = "RDS security group must not declare any egress rules (locked down)."
  }
}
