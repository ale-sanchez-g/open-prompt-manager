# Terraform tests for the distributed rate-limit Redis infrastructure.
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  project_name                             = "opm-test"
  environment                              = "test"
  aws_region                               = "us-east-1"
  vpc_cidr                                 = "10.0.0.0/16"
  private_subnet_cidrs                     = ["10.0.10.0/24", "10.0.11.0/24"]
  availability_zones                       = ["us-east-1a", "us-east-1b"]
  rate_limit_backend                       = "redis"
  rate_limit_trusted_proxy_count           = 1
  rate_limit_redis_required                = true
  rate_limit_redis_failure_policy          = "fail_closed"
  rate_limit_redis_multi_az                = true
  rate_limit_redis_snapshot_retention_days = 1
}

run "redis_is_private_and_tls_enabled" {
  command = plan

  assert {
    condition     = aws_elasticache_replication_group.rate_limit.transit_encryption_enabled
    error_message = "Rate-limit Redis must require TLS in transit."
  }

  assert {
    condition     = aws_elasticache_replication_group.rate_limit.at_rest_encryption_enabled
    error_message = "Rate-limit Redis must encrypt data at rest."
  }

  assert {
    condition     = aws_elasticache_replication_group.rate_limit.port == 6379
    error_message = "Rate-limit Redis must use port 6379."
  }

  assert {
    condition     = aws_elasticache_replication_group.rate_limit.num_cache_clusters == 2
    error_message = "Multi-AZ Redis must contain a primary and replica."
  }

  assert {
    condition     = aws_elasticache_replication_group.rate_limit.automatic_failover_enabled
    error_message = "Multi-AZ Redis must enable automatic failover."
  }
}

run "redis_uses_private_application_subnets" {
  command = plan

  assert {
    condition     = aws_elasticache_subnet_group.rate_limit.name == "${var.project_name}-rate-limit"
    error_message = "Redis subnet group must use a stable project-specific name."
  }

  assert {
    condition     = aws_elasticache_replication_group.rate_limit.subnet_group_name == aws_elasticache_subnet_group.rate_limit.name
    error_message = "Redis must be attached to its private subnet group."
  }
}

run "redis_ingress_is_backend_only" {
  command = plan

  assert {
    condition     = anytrue([for rule in aws_security_group.rate_limit.ingress : rule.from_port == 6379 && rule.to_port == 6379])
    error_message = "Redis ingress must be restricted to port 6379."
  }

  assert {
    condition     = length(aws_security_group.rate_limit.ingress) == 1
    error_message = "Redis must expose exactly one ingress rule sourced from backend tasks."
  }
}

run "backend_can_reach_redis" {
  command = plan

  assert {
    condition     = anytrue([for rule in aws_security_group.backend.egress : rule.from_port == 6379 && rule.to_port == 6379 && contains(coalesce(rule.cidr_blocks, []), var.vpc_cidr)])
    error_message = "Backend egress must allow Redis traffic within the VPC CIDR."
  }
}
