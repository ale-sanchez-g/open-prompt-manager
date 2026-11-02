# ─────────────────────────────────────────────
# ElastiCache Redis for distributed rate limiting
# ─────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "rate_limit" {
  name       = "${var.project_name}-rate-limit"
  subnet_ids = aws_subnet.private[*].id

  description = "Private subnets for the rate-limit Redis cluster"

  tags = {
    Name        = "${var.project_name}-rate-limit-cache-subnets"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_elasticache_parameter_group" "rate_limit" {
  name   = "${var.project_name}-rate-limit-redis7"
  family = "redis7"

  description = "Parameter group for the distributed rate-limit Redis cluster"

  tags = {
    Name        = "${var.project_name}-rate-limit-redis7"
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_elasticache_replication_group" "rate_limit" {
  replication_group_id = substr("${var.project_name}-rate-limit", 0, 20)
  description          = "Shared Redis counter store for backend rate limiting"

  engine               = "redis"
  engine_version       = var.rate_limit_redis_engine_version
  node_type            = var.rate_limit_redis_node_type
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.rate_limit.name

  subnet_group_name  = aws_elasticache_subnet_group.rate_limit.name
  security_group_ids = [aws_security_group.rate_limit.id]

  num_cache_clusters         = var.rate_limit_redis_multi_az ? 2 : 1
  automatic_failover_enabled = var.rate_limit_redis_multi_az
  multi_az_enabled           = var.rate_limit_redis_multi_az

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  snapshot_retention_limit = var.rate_limit_redis_snapshot_retention_days
  snapshot_window          = "03:00-04:00"
  maintenance_window       = "sun:04:00-sun:05:00"

  apply_immediately = true

  tags = {
    Name        = "${var.project_name}-rate-limit"
    Project     = var.project_name
    Environment = var.environment
  }
}
