# Tests for the Application Load Balancer: ALB, target groups, and the HTTP listener.
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
# Application Load Balancer
# ─────────────────────────────────────────────
run "alb_is_internet_facing" {
  command = plan

  assert {
    condition     = aws_lb.main.internal == false
    error_message = "ALB must be internet-facing (internal = false)."
  }
}

run "alb_is_application_type" {
  command = plan

  assert {
    condition     = aws_lb.main.load_balancer_type == "application"
    error_message = "Load balancer type must be 'application'."
  }
}

run "alb_name_contains_project" {
  command = plan

  assert {
    condition     = aws_lb.main.name == "${var.project_name}-alb"
    error_message = "ALB name must follow the pattern '<project_name>-alb'."
  }
}

run "alb_has_required_tags" {
  command = plan

  assert {
    condition     = aws_lb.main.tags["Project"] == var.project_name
    error_message = "ALB must have 'Project' tag."
  }

  assert {
    condition     = aws_lb.main.tags["Environment"] == var.environment
    error_message = "ALB must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# Target Groups
# ─────────────────────────────────────────────
run "frontend_target_group_port_matches_variable" {
  command = plan

  assert {
    condition     = aws_lb_target_group.frontend.port == var.frontend_port
    error_message = "Frontend target group port must match var.frontend_port."
  }
}

run "frontend_target_group_uses_ip_target_type" {
  command = plan

  assert {
    condition     = aws_lb_target_group.frontend.target_type == "ip"
    error_message = "Frontend target group must use target_type = 'ip' (required for Fargate awsvpc networking)."
  }
}

run "frontend_target_group_health_check_path" {
  command = plan

  assert {
    condition     = aws_lb_target_group.frontend.health_check[0].path == "/"
    error_message = "Frontend target group health check path must be '/'."
  }
}

run "frontend_target_group_has_required_tags" {
  command = plan

  assert {
    condition     = aws_lb_target_group.frontend.tags["Project"] == var.project_name
    error_message = "Frontend target group must have 'Project' tag."
  }

  assert {
    condition     = aws_lb_target_group.frontend.tags["Environment"] == var.environment
    error_message = "Frontend target group must have 'Environment' tag."
  }
}

run "backend_target_group_port_matches_variable" {
  command = plan

  assert {
    condition     = aws_lb_target_group.backend.port == var.backend_port
    error_message = "Backend target group port must match var.backend_port."
  }
}

run "backend_target_group_uses_ip_target_type" {
  command = plan

  assert {
    condition     = aws_lb_target_group.backend.target_type == "ip"
    error_message = "Backend target group must use target_type = 'ip' (required for Fargate awsvpc networking)."
  }
}

run "backend_target_group_health_check_path" {
  command = plan

  assert {
    condition     = aws_lb_target_group.backend.health_check[0].path == "/api/health"
    error_message = "Backend target group health check path must be '/api/health'."
  }
}

run "backend_target_group_has_required_tags" {
  command = plan

  assert {
    condition     = aws_lb_target_group.backend.tags["Project"] == var.project_name
    error_message = "Backend target group must have 'Project' tag."
  }

  assert {
    condition     = aws_lb_target_group.backend.tags["Environment"] == var.environment
    error_message = "Backend target group must have 'Environment' tag."
  }
}

# ─────────────────────────────────────────────
# HTTP Listener
# ─────────────────────────────────────────────
run "http_listener_port_is_80" {
  command = plan

  assert {
    condition     = aws_lb_listener.http.port == 80
    error_message = "HTTP listener must listen on port 80."
  }
}

run "http_listener_protocol_is_http" {
  command = plan

  assert {
    condition     = aws_lb_listener.http.protocol == "HTTP"
    error_message = "HTTP listener protocol must be 'HTTP'."
  }
}

# ─────────────────────────────────────────────
# MCP Listener Rule
# ─────────────────────────────────────────────
run "mcp_listener_rule_action_type_is_forward" {
  command = plan

  assert {
    condition     = aws_lb_listener_rule.http_backend_mcp[0].action[0].type == "forward"
    error_message = "MCP listener rule action type must be 'forward'."
  }
}

run "mcp_listener_rule_priority_is_20" {
  command = plan

  assert {
    condition     = aws_lb_listener_rule.http_backend_mcp[0].priority == 20
    error_message = "MCP listener rule priority must be 20."
  }
}

run "mcp_listener_rule_has_lower_priority_than_api" {
  command = plan

  assert {
    condition     = aws_lb_listener_rule.http_backend_mcp[0].priority > aws_lb_listener_rule.http_backend_api[0].priority
    error_message = "MCP listener rule priority must be numerically greater than the API rule priority."
  }
}

run "mcp_listener_rule_matches_mcp_path" {
  command = plan

  assert {
    condition     = contains(flatten([for c in aws_lb_listener_rule.http_backend_mcp[0].condition : [for pp in c.path_pattern : pp.values]]), "/mcp")
    error_message = "MCP listener rule must match the exact /mcp path."
  }
}

run "mcp_listener_rule_matches_mcp_wildcard" {
  command = plan

  assert {
    condition     = contains(flatten([for c in aws_lb_listener_rule.http_backend_mcp[0].condition : [for pp in c.path_pattern : pp.values]]), "/mcp/*")
    error_message = "MCP listener rule must match /mcp/* sub-paths."
  }
}
