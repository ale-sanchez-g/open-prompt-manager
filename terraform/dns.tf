# ─────────────────────────────────────────────
# Route 53 DNS Management
# Create a hosted zone for your domain and point it to the ALB.
# Supports HTTPS certificate validation via DNS.
# ─────────────────────────────────────────────

locals {
  route53_zone_id = (
    var.route53_zone_id != ""
    ? var.route53_zone_id
    : var.create_route53_zone && var.domain_name != ""
    ? aws_route53_zone.main[0].zone_id
    : ""
  )
}

data "aws_route53_zone" "existing" {
  count   = var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
}

# Route 53 Hosted Zone (DNS management for your domain)
resource "aws_route53_zone" "main" {
  count = var.create_route53_zone && var.domain_name != "" && var.route53_zone_id == "" ? 1 : 0
  name  = var.domain_name

  tags = {
    Name        = "${var.project_name}-zone"
    Project     = var.project_name
    Environment = var.environment
  }
}

# A record: Point root domain to ALB
resource "aws_route53_record" "alb" {
  count   = local.route53_zone_id != "" && var.domain_name != "" ? 1 : 0
  zone_id = local.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# CNAME records: Point www and other subdomains to ALB
resource "aws_route53_record" "alb_www" {
  count   = local.route53_zone_id != "" && var.domain_name != "" ? 1 : 0
  zone_id = local.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# ─────────────────────────────────────────────
# ACM Certificate DNS Validation Records
# NOTE: ACM domains_validation_options are a set and not known until apply-time.
# For automatic Route 53 validation, apply in two stages or validate manually.
# Stage 1: terraform apply (creates cert + zone)
# Stage 2: Copy validation records from AWS console or use aws cli:
#   aws route53 list-resource-record-sets --zone-id <zone_id>
# Then manually create the CNAME records in Route 53, or use:
#   terraform apply -target='aws_acm_certificate_validation.main'
# ─────────────────────────────────────────────

# Optional: If you want automatic validation, uncomment and run:
#   terraform apply -target=aws_acm_certificate.main
#   terraform apply  # Full apply after certificate is created
# For now, we skip dynamic validation and let users validate manually or via email.

# Validate certificate via email (default method when Route 53 records not present)
resource "aws_acm_certificate_validation" "main" {
  count           = var.create_certificate && var.enable_https ? 1 : 0
  certificate_arn = aws_acm_certificate.main[0].arn

  # NOTE: Remove timeout_minutes to use email validation (default)
  # For Route 53 DNS validation, manually create records first, then uncomment:
  # validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]

  timeouts {
    create = "5m"
  }
}

# ─────────────────────────────────────────────
# Output the hosted zone nameservers
# Use these to update your registrar's nameserver settings
# ─────────────────────────────────────────────
output "route53_nameservers" {
  description = "Route 53 nameservers for your domain. Update your registrar with these values."
  value = (
    var.route53_zone_id != ""
    ? try(data.aws_route53_zone.existing[0].name_servers, [])
    : var.create_route53_zone
    ? aws_route53_zone.main[0].name_servers
    : []
  )
}

output "route53_zone_id" {
  description = "Route 53 hosted zone ID for manual DNS record management."
  value       = local.route53_zone_id
}
