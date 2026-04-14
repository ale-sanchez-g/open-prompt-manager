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
  frontend_port = 80
  backend_port  = 8000
}

# ─────────────────────────────────────────────
# ALB Security Group
# ─────────────────────────────────────────────
run "alb_sg_allows_http_ingress" {
  command = plan

  assert {
    condition = anytrue([
      for r in aws_security_group.alb.ingress : r.from_port == 80 && r.to_port == 80 && contains(r.cidr_blocks, "0.0.0.0/0")
    ])
    error_message = "ALB security group must allow inbound HTTP (port 80) from 0.0.0.0/0."
  }
}

run "alb_sg_allows_https_ingress" {
  command = plan

  assert {
    condition = anytrue([
      for r in aws_security_group.alb.ingress : r.from_port == 443 && r.to_port == 443 && contains(r.cidr_blocks, "0.0.0.0/0")
    ])
    error_message = "ALB security group must allow inbound HTTPS (port 443) from 0.0.0.0/0."
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
