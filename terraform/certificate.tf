# ─────────────────────────────────────────────
# ACM Certificate Management
# Creates a certificate with automatic DNS validation via Route 53.
# ─────────────────────────────────────────────

# Determine the primary domain name for the certificate
locals {
  # Step 1: fallback when domain_name is not set
  _cert_domain_fallback = length(var.domain_names) > 0 ? var.domain_names[0] : "${var.project_name}.local"

  # Step 2: primary cert domain – flat (no nested ternary)
  cert_domain = var.domain_name != "" ? var.domain_name : local._cert_domain_fallback

  # Step 3: www variant – use regex instead of startswith() for broader parser compat
  _domain_needs_www = var.domain_name != "" ? !can(regex("^www\\.", var.domain_name)) : false
  auto_www_domain   = local._domain_needs_www ? "www.${var.domain_name}" : ""

  # Step 4: SANs – build incrementally to avoid complex inline expressions
  _san_domain_name = var.domain_name != "" && var.domain_name != local.cert_domain ? [var.domain_name] : []
  _san_www         = local.auto_www_domain != "" && local.auto_www_domain != local.cert_domain ? [local.auto_www_domain] : []
  cert_sans        = concat(local._san_domain_name, local._san_www, var.domain_names)
}

# Create ACM certificate with optional Route 53 DNS validation
resource "aws_acm_certificate" "main" {
  count                     = var.create_certificate && var.enable_https ? 1 : 0
  domain_name               = local.cert_domain
  subject_alternative_names = distinct(local.cert_sans)
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.project_name}-certificate"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Local value to determine which certificate ARN to use
locals {
  # Flat two-step to avoid nested ternary (python-hcl2 parser compat)
  _generated_cert_arn = var.create_certificate && var.enable_https ? try(aws_acm_certificate.main[0].arn, "") : ""
  certificate_arn     = var.acm_certificate_arn != "" ? var.acm_certificate_arn : local._generated_cert_arn
}
