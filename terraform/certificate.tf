# ─────────────────────────────────────────────
# ACM Certificate Management
# Creates a certificate with automatic DNS validation via Route 53.
# ─────────────────────────────────────────────

# Determine the primary domain name for the certificate
locals {
  # Use domain_name if provided; fall back to first domain_names entry; else use project name
  cert_domain = (
    var.domain_name != "" 
      ? var.domain_name 
      : length(var.domain_names) > 0 
        ? var.domain_names[0] 
        : "${var.project_name}.local"
  )

  # When the primary domain is an apex domain, also include www by default.
  auto_www_domain = (
    var.domain_name != "" && !startswith(var.domain_name, "www.")
      ? "www.${var.domain_name}"
      : ""
  )
  
  # SANs: include domain_name if different from cert_domain, plus all domain_names
  cert_sans = concat(
    var.domain_name != "" && var.domain_name != local.cert_domain ? [var.domain_name] : [],
    local.auto_www_domain != "" && local.auto_www_domain != local.cert_domain ? [local.auto_www_domain] : [],
    var.domain_names
  )
}

# Create ACM certificate with optional Route 53 DNS validation
resource "aws_acm_certificate" "main" {
  count             = var.create_certificate && var.enable_https ? 1 : 0
  domain_name       = local.cert_domain
  subject_alternative_names = distinct(local.cert_sans)
  validation_method = "DNS"

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
  certificate_arn = (
    var.acm_certificate_arn != "" 
      ? var.acm_certificate_arn 
      : var.create_certificate && var.enable_https 
        ? try(aws_acm_certificate.main[0].arn, "") 
        : ""
  )
}
