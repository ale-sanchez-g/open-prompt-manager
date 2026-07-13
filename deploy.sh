#!/usr/bin/env bash
# deploy.sh – Full deployment script for Open Prompt Manager on AWS
# Usage:
#   ./deploy.sh                                                    # deploy with defaults (HTTP only)
#   ./deploy.sh --region eu-west-1                               # override region
#   ./deploy.sh --env staging                                    # override environment
#   ./deploy.sh --https --domain example.com                     # enable HTTPS with certificate
#   ./deploy.sh --https --domain example.com --domain www.example.com  # multiple domains
#   ./deploy.sh --https --domain example.com --route53           # HTTPS + Route 53 DNS management
#   ./deploy.sh --http-cidr 203.0.113.0/24                        # allow plaintext HTTP from a trusted range
#   ./deploy.sh --destroy                                         # tear down all infrastructure
#
# Note: the ALB security group blocks internet HTTP (port 80) unless trusted
# ranges are supplied via --http-cidr (0.0.0.0/0 is rejected). Without
# --https, provide at least one --http-cidr or the app will be unreachable.
set -euo pipefail

# ─────────────────────────────────────────────
# Defaults (override via flags)
# ─────────────────────────────────────────────
AWS_REGION="ap-southeast-2"
ENVIRONMENT="prod"
PROJECT_NAME="open-prompt-manager"
DESTROY=false
ENABLE_HTTPS=false
CREATE_CERTIFICATE=false
CREATE_ROUTE53_ZONE=false
ACM_CERTIFICATE_ARN=""
ROUTE53_ZONE_ID=""
PRIMARY_DOMAIN=""
DOMAIN_NAMES=()
HTTP_INGRESS_CIDRS=()
JWT_SECRET=""
DISABLE_OTEL=false
MIRROR_OTEL_IMAGE=false

load_or_generate_jwt_secret() {
  local secret_name="${PROJECT_NAME}/${ENVIRONMENT}/jwt-secret"
  local existing_secret_arn=""

  existing_secret_arn=$(aws secretsmanager describe-secret \
    --secret-id "${secret_name}" \
    --region "${AWS_REGION}" \
    --query ARN \
    --output text 2>/dev/null || true)

  if [[ -n "${existing_secret_arn}" && "${existing_secret_arn}" != "None" ]]; then
    local deleted_date
    deleted_date=$(aws secretsmanager describe-secret \
      --secret-id "${existing_secret_arn}" \
      --region "${AWS_REGION}" \
      --query DeletedDate \
      --output text 2>/dev/null || true)

    if [[ -n "${deleted_date}" && "${deleted_date}" != "None" ]]; then
      warn "Secret '${secret_name}' is scheduled for deletion — force-deleting now..."
      aws secretsmanager delete-secret \
        --secret-id "${existing_secret_arn}" \
        --force-delete-without-recovery \
        --region "${AWS_REGION}" >/dev/null
    else
      JWT_SECRET=$(aws secretsmanager get-secret-value \
        --secret-id "${existing_secret_arn}" \
        --region "${AWS_REGION}" \
        --query SecretString \
        --output text 2>/dev/null || true)

      [[ -n "${JWT_SECRET}" && "${JWT_SECRET}" != "None" ]] || fail "Existing JWT secret was found but could not be read from Secrets Manager."
      ok "Loaded existing JWT secret from Secrets Manager."
      return 0
    fi
  fi

  command -v openssl &>/dev/null || fail "'openssl' is not installed or not in PATH"
  JWT_SECRET=$(openssl rand -hex 32)
  ok "Generated new JWT secret for first-time deployment."
}

# ─────────────────────────────────────────────
# Usage / help
# ─────────────────────────────────────────────
KNOWN_FLAGS=(--region --env --project --domain --https --http-cidr --route53 --destroy --migrate --disable-otel-collector --mirror-otel-image --help)

usage() {
  cat <<'EOF'
deploy.sh – Full deployment script for Open Prompt Manager on AWS

Usage:
  ./deploy.sh [options]

Options:
  --region <region>         AWS region to deploy into (default: ap-southeast-2)
  --env <name>              Environment name (default: prod)
  --project <name>          Project name (default: open-prompt-manager)
  --domain <domain>         Enable HTTPS and request/attach an ACM cert for <domain>.
                            Repeat to add multiple domains (SANs).
  --https                   Enable HTTPS (implied by --domain)
  --http-cidr <cidr>        Allow plaintext HTTP (port 80) from a trusted CIDR range.
                            Repeat for multiple ranges. 0.0.0.0/0 is rejected.
  --route53                 Manage DNS for the domain in Route 53
  --destroy                 Tear down all infrastructure
  --migrate                 Run database migrations
  --disable-otel-collector  Deploy with the OTel Collector sidecar disabled.
                            Use this as an immediate mitigation in private-egress
                            environments where public.ecr.aws is unreachable.
                            Sets otel_collector_enabled=false in Terraform.
  --mirror-otel-image       Pull the pinned OTel Collector image from public ECR,
                            push it into a private ECR mirror repository, and deploy
                            using the private URI. Requires internet access once to
                            seed the mirror; subsequent deploys use only private ECR.
                            Enables otel_collector_ecr_mirror_enabled=true in Terraform.
  --help, -h                Show this help and exit

Examples:
  ./deploy.sh --region eu-west-1
  ./deploy.sh --https --domain example.com --route53
  ./deploy.sh --http-cidr 203.0.113.0/24
  ./deploy.sh --destroy
  ./deploy.sh --disable-otel-collector                     # immediate private-egress fix
  ./deploy.sh --mirror-otel-image                          # permanent private-egress fix

Note: the ALB security group blocks internet HTTP (port 80) unless trusted
ranges are supplied via --http-cidr (0.0.0.0/0 is rejected). Without --https,
provide at least one --http-cidr or the app will be unreachable.
EOF
}

# Suggest the closest known flag for an unrecognized option (Levenshtein distance).
suggest_flag() {
  local input="$1" best="" best_dist=99 flag dist
  for flag in "${KNOWN_FLAGS[@]}"; do
    dist=$(awk -v a="$input" -v b="$flag" '
      BEGIN {
        la = length(a); lb = length(b);
        for (i = 0; i <= la; i++) d[i,0] = i;
        for (j = 0; j <= lb; j++) d[0,j] = j;
        for (i = 1; i <= la; i++)
          for (j = 1; j <= lb; j++) {
            c = (substr(a,i,1) == substr(b,j,1)) ? 0 : 1;
            m = d[i-1,j] + 1;
            n = d[i,j-1] + 1;
            o = d[i-1,j-1] + c;
            m = (n < m) ? n : m;
            m = (o < m) ? o : m;
            d[i,j] = m;
          }
        print d[la,lb];
      }')
    if (( dist < best_dist )); then
      best_dist=$dist
      best=$flag
    fi
  done
  # Only suggest when the guess is reasonably close.
  if (( best_dist <= 3 )); then
    echo "$best"
  fi
}

# ─────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)   AWS_REGION="$2";    shift 2 ;;
    --env)      ENVIRONMENT="$2";   shift 2 ;;
    --project)  PROJECT_NAME="$2";  shift 2 ;;
    --domain)   DOMAIN_NAMES+=("$2"); PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-$2}"; ENABLE_HTTPS=true; CREATE_CERTIFICATE=true; shift 2 ;;
    --https)    ENABLE_HTTPS=true;  shift   ;;
    --http-cidr) HTTP_INGRESS_CIDRS+=("$2"); shift 2 ;;
    --route53)  CREATE_ROUTE53_ZONE=true; shift ;;
    --destroy)  DESTROY=true;       shift   ;;
    --migrate)  MIGRATE=true;       shift   ;;
    --disable-otel-collector) DISABLE_OTEL=true; shift ;;
    --mirror-otel-image)      MIRROR_OTEL_IMAGE=true; shift ;;
    --help|-h)  usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      suggestion="$(suggest_flag "$1")"
      [[ -n "$suggestion" ]] && echo "Did you mean '${suggestion}'?" >&2
      echo "Run './deploy.sh --help' to see all available options." >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/terraform"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"
TF_WORKSPACE="${PROJECT_NAME}-${ENVIRONMENT}-${AWS_REGION}"
PLAN_DIR="${TERRAFORM_DIR}/.terraform.plans"
PLAN_FILE="${PLAN_DIR}/${TF_WORKSPACE}.tfplan"

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
log()  { echo ""; echo "▶  $*"; }
ok()   { echo "   ✓  $*"; }
warn() { echo "   ⚠  $*"; }
fail() { echo "   ✗  $*" >&2; exit 1; }

get_delegated_public_zone_id() {
  [[ -n "${PRIMARY_DOMAIN}" ]] || return 0

  local delegated_ns
  delegated_ns=$(dig +short NS "${PRIMARY_DOMAIN}" 2>/dev/null | sed 's/\.$//' | sort)

  local zone_ids
  zone_ids=$(aws route53 list-hosted-zones-by-name \
    --dns-name "${PRIMARY_DOMAIN}" \
    --query "HostedZones[?Name=='${PRIMARY_DOMAIN}.'].Id" \
    --output text 2>/dev/null)

  [[ -n "${zone_ids}" ]] || return 0

  local fallback_zone_id=""
  local raw_zone_id
  for raw_zone_id in ${zone_ids}; do
    local zone_id
    zone_id=${raw_zone_id#/hostedzone/}

    if [[ -z "${fallback_zone_id}" ]]; then
      fallback_zone_id="${zone_id}"
    fi

    local zone_ns
    zone_ns=$(aws route53 get-hosted-zone \
      --id "${zone_id}" \
      --query 'DelegationSet.NameServers' \
      --output text 2>/dev/null | tr '\t' '\n' | sed 's/\.$//' | sort)

    if [[ -n "${delegated_ns}" && -n "${zone_ns}" && "${delegated_ns}" == "${zone_ns}" ]]; then
      echo "${zone_id}"
      return 0
    fi
  done

  # No exact nameserver match found (for example, resolver cache or newly delegated domain).
  # Reuse an existing zone anyway to avoid creating duplicate zones with the same name.
  if [[ -n "${fallback_zone_id}" ]]; then
    echo "${fallback_zone_id}"
  fi
}

wait_for_acm_certificate_issued() {
  local certificate_arn="$1"
  local timeout_seconds=300
  local poll_interval_seconds=15
  local elapsed=0
  local current_status=""

  log "Waiting up to 5 minutes for ACM certificate validation..."

  while (( elapsed < timeout_seconds )); do
    current_status=$(aws acm describe-certificate \
      --certificate-arn "${certificate_arn}" \
      --region "${AWS_REGION}" \
      --query 'Certificate.Status' \
      --output text)

    if [[ "${current_status}" == "ISSUED" ]]; then
      ok "ACM certificate is now ISSUED."
      return 0
    fi

    warn "ACM status is '${current_status}' (${elapsed}s/${timeout_seconds}s elapsed)."
    sleep "${poll_interval_seconds}"
    elapsed=$((elapsed + poll_interval_seconds))
  done

  return 1
}

upsert_acm_validation_records() {
  local certificate_arn="$1"

  [[ -n "${PRIMARY_DOMAIN}" ]] || return 0

  local zone_id
  zone_id="${ROUTE53_ZONE_ID}"
  if [[ -z "${zone_id}" ]]; then
    zone_id=$(aws route53 list-hosted-zones-by-name \
      --dns-name "${PRIMARY_DOMAIN}" \
      --query "HostedZones[?Name=='${PRIMARY_DOMAIN}.' && Config.PrivateZone==\`false\`].Id | [0]" \
      --output text 2>/dev/null | sed 's|/hostedzone/||')
  fi

  if [[ -z "${zone_id}" || "${zone_id}" == "None" ]]; then
    warn "No public Route 53 hosted zone found for ${PRIMARY_DOMAIN}; skipping ACM DNS record auto-creation."
    return 0
  fi

  local validation_rows
  validation_rows=$(aws acm describe-certificate \
    --certificate-arn "${certificate_arn}" \
    --region "${AWS_REGION}" \
    --query 'Certificate.DomainValidationOptions[?ResourceRecord!=null].[ResourceRecord.Name,ResourceRecord.Type,ResourceRecord.Value]' \
    --output text)

  if [[ -z "${validation_rows}" || "${validation_rows}" == "None" ]]; then
    warn "ACM validation records are not ready yet; retry deploy.sh in a minute."
    return 0
  fi

  while read -r record_name record_type record_value; do
    [[ -n "${record_name}" && -n "${record_type}" && -n "${record_value}" ]] || continue

    local change_file
    change_file=$(mktemp)
    cat > "${change_file}" <<EOF
{
  "Comment": "UPSERT ACM validation record for ${PRIMARY_DOMAIN}",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${record_name}",
        "Type": "${record_type}",
        "TTL": 60,
        "ResourceRecords": [
          {
            "Value": "${record_value}"
          }
        ]
      }
    }
  ]
}
EOF

    aws route53 change-resource-record-sets \
      --hosted-zone-id "${zone_id}" \
      --change-batch "file://${change_file}" >/dev/null
    rm -f "${change_file}"
    ok "Upserted ACM DNS validation record: ${record_name}"
  done <<< "${validation_rows}"
}

build_domain_names_arg() {
  if [[ ${#DOMAIN_NAMES[@]} -eq 0 ]]; then
    echo '[]'
    return
  fi

  local domain_names_json
  domain_names_json=$(printf '"%s",' "${DOMAIN_NAMES[@]}")
  echo "[${domain_names_json%,}]"
}

build_http_cidrs_arg() {
  if [[ ${#HTTP_INGRESS_CIDRS[@]} -eq 0 ]]; then
    echo '[]'
    return
  fi

  local cidrs_json
  cidrs_json=$(printf '"%s",' "${HTTP_INGRESS_CIDRS[@]}")
  echo "[${cidrs_json%,}]"
}

prepare_terraform_workspace() {
  terraform init -input=false -reconfigure
  terraform workspace select "${TF_WORKSPACE}" >/dev/null 2>&1 \
    || terraform workspace new "${TF_WORKSPACE}" >/dev/null
  # Create directory for plan files
  mkdir -p "${PLAN_DIR}"
  ok "Terraform workspace selected: ${TF_WORKSPACE}"
}

ensure_ecr_repo_in_state() {
  local tf_address="$1"
  local repo_name="$2"

  if terraform state show "${tf_address}" >/dev/null 2>&1; then
    return 0
  fi

  warn "Attempting Terraform import for '${repo_name}'..."
  if terraform import \
      -var="aws_region=${AWS_REGION}" \
      -var="environment=${ENVIRONMENT}" \
      -var="project_name=${PROJECT_NAME}" \
      "${tf_address}" "${repo_name}" >/dev/null 2>&1; then
    ok "Imported ${tf_address}"
  else
    warn "Import skipped for '${repo_name}' (likely not created yet). Terraform will create it."
  fi
}

ensure_iam_role_in_state() {
  local tf_address="$1"
  local role_name="$2"

  if terraform state show "${tf_address}" >/dev/null 2>&1; then
    return 0
  fi

  if aws iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
    warn "IAM role '${role_name}' already exists; importing into Terraform state..."
    terraform import \
      -var="aws_region=${AWS_REGION}" \
      -var="environment=${ENVIRONMENT}" \
      -var="project_name=${PROJECT_NAME}" \
      "${tf_address}" "${role_name}" >/dev/null
    ok "Imported ${tf_address}"
  fi
}

ensure_acm_certificate_is_issued() {
  if [[ "${ENABLE_HTTPS}" != "true" || "${CREATE_CERTIFICATE}" != "true" ]]; then
    return 0
  fi

  log "Step 5 – Ensuring ACM certificate is issued before full deploy..."

  terraform plan -out="${PLAN_FILE}.cert" \
    -target=aws_acm_certificate.main \
    -target=aws_lb_listener.http \
    -var="aws_region=${AWS_REGION}" \
    -var="environment=${ENVIRONMENT}" \
    -var="project_name=${PROJECT_NAME}" \
    -var="jwt_secret=${JWT_SECRET}" \
    -var="enable_https=${ENABLE_HTTPS}" \
    -var="create_certificate=${CREATE_CERTIFICATE}" \
    -var="domain_name=${PRIMARY_DOMAIN}" \
    -var="domain_names=${DOMAIN_NAMES_ARG}" \
    -var="route53_zone_id=${ROUTE53_ZONE_ID}" \
    -var="create_route53_zone=${CREATE_ROUTE53_ZONE}" 2>&1 | tee "${PLAN_FILE}.cert.log"

  terraform apply -auto-approve "${PLAN_FILE}.cert" 2>&1 | tee -a "${PLAN_FILE}.cert.log"

  local certificate_arn
  certificate_arn=$(terraform state show 'aws_acm_certificate.main[0]' 2>/dev/null | awk '/^[[:space:]]*arn[[:space:]]*=/{print $3; exit}')
  certificate_arn=${certificate_arn//\"/}
  [[ -n "${certificate_arn}" ]] || fail "Could not read ACM certificate ARN from Terraform state."

  local certificate_status
  certificate_status=$(aws acm describe-certificate \
    --certificate-arn "${certificate_arn}" \
    --region "${AWS_REGION}" \
    --query 'Certificate.Status' \
    --output text)

  if [[ "${certificate_status}" != "ISSUED" ]]; then
    if [[ "${CREATE_ROUTE53_ZONE}" == "true" || -n "${ROUTE53_ZONE_ID}" ]]; then
      log "Attempting Route 53 ACM DNS validation record auto-creation..."
      upsert_acm_validation_records "${certificate_arn}"

      if ! wait_for_acm_certificate_issued "${certificate_arn}"; then
        certificate_status=$(aws acm describe-certificate \
          --certificate-arn "${certificate_arn}" \
          --region "${AWS_REGION}" \
          --query 'Certificate.Status' \
          --output text)

        warn "Paused due to ACM validation timeout (5 minutes)."
        warn "Try again in 10 minutes to continue deployment."
        echo ""
        echo "Validation details:"
        aws acm describe-certificate \
          --certificate-arn "${certificate_arn}" \
          --region "${AWS_REGION}" \
          --query 'Certificate.DomainValidationOptions[].{Domain:DomainName,Status:ValidationStatus,RecordName:ResourceRecord.Name,RecordType:ResourceRecord.Type,RecordValue:ResourceRecord.Value}' \
          --output table || true
        fail "Certificate is not ISSUED yet (current status: ${certificate_status})."
      fi

      certificate_status="ISSUED"
    fi

    if [[ "${certificate_status}" != "ISSUED" ]]; then
      warn "ACM certificate status is '${certificate_status}'."
      warn "Validate the domain and rerun deploy.sh to continue with ALB listener and ECS services."
      echo ""
      echo "Validation details:"
      aws acm describe-certificate \
        --certificate-arn "${certificate_arn}" \
        --region "${AWS_REGION}" \
        --query 'Certificate.DomainValidationOptions[].{Domain:DomainName,Status:ValidationStatus,RecordName:ResourceRecord.Name,RecordType:ResourceRecord.Type,RecordValue:ResourceRecord.Value}' \
        --output table || true
      fail "Certificate is not ISSUED yet (current status: ${certificate_status})."
    fi
  fi

  ok "ACM certificate is issued: ${certificate_arn}"
}

# ─────────────────────────────────────────────
# 0. Pre-flight checks
# ─────────────────────────────────────────────
log "Checking prerequisites..."

for cmd in aws terraform docker; do
  command -v "$cmd" &>/dev/null || fail "'$cmd' is not installed or not in PATH"
  ok "$cmd found"
done

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
  || fail "AWS credentials are not configured. Run 'aws configure' first."
ok "AWS credentials valid (account: ${AWS_ACCOUNT_ID})"

load_or_generate_jwt_secret

DEPLOY_TAG=$(git -C "${SCRIPT_DIR}" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
ok "Deploy image tag: ${DEPLOY_TAG}"

DOMAIN_NAMES_ARG=$(build_domain_names_arg)
HTTP_CIDRS_ARG=$(build_http_cidrs_arg)

if [[ "${DESTROY}" != "true" && "${ENABLE_HTTPS}" != "true" && ${#HTTP_INGRESS_CIDRS[@]} -eq 0 ]]; then
  warn "HTTPS is disabled and no --http-cidr was provided."
  warn "The ALB security group blocks internet HTTP (port 80) by default, so the app will NOT be reachable."
  warn "Re-run with --https --domain <domain>, or pass --http-cidr <trusted-range> (0.0.0.0/0 is rejected)."
fi

if [[ "${CREATE_ROUTE53_ZONE}" == "true" && -n "${PRIMARY_DOMAIN}" ]]; then
  ROUTE53_ZONE_ID=$(get_delegated_public_zone_id)
  if [[ -n "${ROUTE53_ZONE_ID}" ]]; then
    warn "Found existing hosted zone for ${PRIMARY_DOMAIN}; reusing zone ${ROUTE53_ZONE_ID} instead of creating a new one."
    CREATE_ROUTE53_ZONE=false
  fi
fi

# ─────────────────────────────────────────────
# Resolve OTel Terraform variable values
# ─────────────────────────────────────────────
OTEL_ENABLED_VAR="true"
OTEL_MIRROR_VAR="false"
if [[ "${DISABLE_OTEL}" == "true" ]]; then
  OTEL_ENABLED_VAR="false"
  warn "OTel Collector sidecar disabled via --disable-otel-collector."
  warn "This is the immediate mitigation for private-egress environments."
  warn "Re-enable with --mirror-otel-image once the private ECR mirror is populated."
fi
if [[ "${MIRROR_OTEL_IMAGE}" == "true" ]]; then
  OTEL_MIRROR_VAR="true"
fi
if [[ "${DISABLE_OTEL}" == "true" && "${MIRROR_OTEL_IMAGE}" == "true" ]]; then
  fail "--disable-otel-collector and --mirror-otel-image are mutually exclusive."
fi

# ─────────────────────────────────────────────
# Destroy path
# ─────────────────────────────────────────────
if [[ "$DESTROY" == "true" ]]; then
  log "Destroying all infrastructure..."
  cd "${TERRAFORM_DIR}"
  prepare_terraform_workspace
  terraform destroy -auto-approve \
    -var="aws_region=${AWS_REGION}" \
    -var="environment=${ENVIRONMENT}" \
    -var="project_name=${PROJECT_NAME}" \
    -var="jwt_secret=${JWT_SECRET}" \
    -var="enable_https=${ENABLE_HTTPS}" \
    -var="create_certificate=${CREATE_CERTIFICATE}" \
    -var="acm_certificate_arn=${ACM_CERTIFICATE_ARN}" \
    -var="domain_name=${PRIMARY_DOMAIN}" \
    -var="domain_names=${DOMAIN_NAMES_ARG}" \
    -var="alb_http_ingress_cidrs=${HTTP_CIDRS_ARG}" \
    -var="route53_zone_id=${ROUTE53_ZONE_ID}" \
    -var="create_route53_zone=${CREATE_ROUTE53_ZONE}" \
    -var="otel_collector_enabled=${OTEL_ENABLED_VAR}" \
    -var="otel_collector_ecr_mirror_enabled=${OTEL_MIRROR_VAR}"
  ok "Infrastructure destroyed."
  exit 0
fi

# ─────────────────────────────────────────────
# 1. Bootstrap ECR repositories
# ─────────────────────────────────────────────
log "Step 1/6 – Bootstrapping ECR repositories..."
cd "${TERRAFORM_DIR}"
prepare_terraform_workspace

ensure_ecr_repo_in_state "aws_ecr_repository.backend" "${PROJECT_NAME}-backend"
ensure_ecr_repo_in_state "aws_ecr_repository.frontend" "${PROJECT_NAME}-frontend"

# Extra Terraform targets needed for the OTEL ECR mirror repository.
OTEL_ECR_TARGET_ARGS=()
if [[ "${OTEL_MIRROR_VAR}" == "true" ]]; then
  OTEL_ECR_TARGET_ARGS+=("-target=aws_ecr_repository.otel_collector[0]" "-target=aws_ecr_lifecycle_policy.otel_collector[0]")
fi

log "Planning ECR repository changes with Terraform..."
terraform plan -out="${PLAN_FILE}.ecr" \
  -target=aws_ecr_repository.backend \
  -target=aws_ecr_repository.frontend \
  -target=aws_lb_listener.http \
  "${OTEL_ECR_TARGET_ARGS[@]+"${OTEL_ECR_TARGET_ARGS[@]}"}" \
  -var="aws_region=${AWS_REGION}" \
  -var="environment=${ENVIRONMENT}" \
  -var="project_name=${PROJECT_NAME}" \
  -var="jwt_secret=${JWT_SECRET}" \
  -var="otel_collector_enabled=${OTEL_ENABLED_VAR}" \
  -var="otel_collector_ecr_mirror_enabled=${OTEL_MIRROR_VAR}" 2>&1 | tee "${PLAN_FILE}.ecr.log"

log "Applying ECR repository changes with Terraform..."
terraform apply -auto-approve "${PLAN_FILE}.ecr"
ok "ECR repositories ready."

BACKEND_REPO=$(terraform output -raw backend_ecr_repository_url)
FRONTEND_REPO=$(terraform output -raw frontend_ecr_repository_url)

# Capture the OTEL mirror repository URL when mirroring is enabled.
OTEL_ECR_REPO=""
if [[ "${OTEL_MIRROR_VAR}" == "true" ]]; then
  OTEL_ECR_REPO=$(terraform output -raw otel_collector_ecr_repository_url 2>/dev/null || true)
  if [[ -z "${OTEL_ECR_REPO}" ]]; then
    fail "Could not retrieve otel_collector_ecr_repository_url output from Terraform. Ensure the plan applied successfully."
  fi
  ok "OTel Collector ECR mirror repository: ${OTEL_ECR_REPO}"
fi

# ─────────────────────────────────────────────
# 2. Authenticate Docker to ECR
# ─────────────────────────────────────────────
log "Step 2/6 – Authenticating Docker to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin \
      "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ok "Docker authenticated to ECR."

# ─────────────────────────────────────────────
# 2b. Mirror OTel Collector image to private ECR (if requested)
# ─────────────────────────────────────────────
# Pinned public image digest – keep in sync with var.otel_collector_image in otel.tf.
OTEL_PUBLIC_IMAGE="public.ecr.aws/aws-observability/aws-otel-collector@sha256:a465f606684ab1ac3c5221c8bffe783b0120c8bd5318e1bf63c90f2cf56af835"

if [[ "${MIRROR_OTEL_IMAGE}" == "true" ]]; then
  log "Step 2b – Mirroring OTel Collector image to private ECR..."
  log "  Source : ${OTEL_PUBLIC_IMAGE}"
  log "  Target : ${OTEL_ECR_REPO}"

  # Pull from public ECR (no auth required for public.ecr.aws pulls).
  docker pull "${OTEL_PUBLIC_IMAGE}"

  # Tag for private ECR.  We use the tag 'latest' for the push operation;
  # Terraform addresses the image by content digest so the tag is only a
  # human-readable alias in the private registry.
  docker tag "${OTEL_PUBLIC_IMAGE}" "${OTEL_ECR_REPO}:latest"
  docker push "${OTEL_ECR_REPO}:latest"
  ok "OTel Collector image mirrored to ${OTEL_ECR_REPO}:latest"
  ok "ECS tasks will pull by digest via the private VPC endpoint."
fi

# ─────────────────────────────────────────────
# 3. Build and push Docker images
# ─────────────────────────────────────────────
log "Step 3/6 – Building and pushing backend image (linux/amd64)..."
docker buildx build --platform linux/amd64 \
  -t "${BACKEND_REPO}:${DEPLOY_TAG}" \
  -t "${BACKEND_REPO}:latest" "${BACKEND_DIR}" --push
ok "Backend images pushed: ${BACKEND_REPO}:${DEPLOY_TAG}, ${BACKEND_REPO}:latest"

log "           Building and pushing frontend image (linux/amd64)..."
docker buildx build --platform linux/amd64 \
  -t "${FRONTEND_REPO}:${DEPLOY_TAG}" \
  -t "${FRONTEND_REPO}:latest" "${FRONTEND_DIR}" --push
ok "Frontend images pushed: ${FRONTEND_REPO}:${DEPLOY_TAG}, ${FRONTEND_REPO}:latest"

BACKEND_IMAGE_URI="${BACKEND_REPO}:${DEPLOY_TAG}"
FRONTEND_IMAGE_URI="${FRONTEND_REPO}:${DEPLOY_TAG}"

# ─────────────────────────────────────────────
# 4. Clean up any stale Secrets Manager secrets
# ─────────────────────────────────────────────
log "Step 4/6 – Checking for stale Secrets Manager secrets..."
SECRET_NAME="${PROJECT_NAME}/${ENVIRONMENT}/database-url"
SECRET_STATUS=$(aws secretsmanager describe-secret \
  --secret-id "${SECRET_NAME}" \
  --region "${AWS_REGION}" \
  --query 'DeletedDate' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [[ "$SECRET_STATUS" != "None" && "$SECRET_STATUS" != "NOT_FOUND" ]]; then
  warn "Secret '${SECRET_NAME}' is scheduled for deletion — force-deleting now..."
  aws secretsmanager delete-secret \
    --secret-id "${SECRET_NAME}" \
    --force-delete-without-recovery \
    --region "${AWS_REGION}" > /dev/null
  ok "Stale secret removed."
else
  ok "No stale secrets found."
fi

# ─────────────────────────────────────────────
# 5. Plan full Terraform configuration
# ─────────────────────────────────────────────
ensure_acm_certificate_is_issued

log "Step 6 – Planning full Terraform configuration..."
cd "${TERRAFORM_DIR}"
prepare_terraform_workspace

ensure_iam_role_in_state "aws_iam_role.ecs_task_execution" "${PROJECT_NAME}-ecs-task-execution-role"
ensure_iam_role_in_state "aws_iam_role.ecs_task" "${PROJECT_NAME}-ecs-task-role"

log "Generating Terraform plan: ${PLAN_FILE}"
terraform plan -out="${PLAN_FILE}" \
  -var="aws_region=${AWS_REGION}" \
  -var="environment=${ENVIRONMENT}" \
  -var="project_name=${PROJECT_NAME}" \
  -var="jwt_secret=${JWT_SECRET}" \
  -var="backend_image=${BACKEND_IMAGE_URI}" \
  -var="frontend_image=${FRONTEND_IMAGE_URI}" \
  -var="enable_https=${ENABLE_HTTPS}" \
  -var="create_certificate=${CREATE_CERTIFICATE}" \
  -var="acm_certificate_arn=${ACM_CERTIFICATE_ARN}" \
  -var="domain_name=${PRIMARY_DOMAIN}" \
  -var="domain_names=${DOMAIN_NAMES_ARG}" \
  -var="alb_http_ingress_cidrs=${HTTP_CIDRS_ARG}" \
  -var="route53_zone_id=${ROUTE53_ZONE_ID}" \
  -var="create_route53_zone=${CREATE_ROUTE53_ZONE}" \
  -var="otel_collector_enabled=${OTEL_ENABLED_VAR}" \
  -var="otel_collector_ecr_mirror_enabled=${OTEL_MIRROR_VAR}" 2>&1 | tee "${PLAN_FILE}.log"

ok "Plan saved to: ${PLAN_FILE}"
ok "Plan log saved to: ${PLAN_FILE}.log"
ok "Backend deploy image: ${BACKEND_IMAGE_URI}"
ok "Frontend deploy image: ${FRONTEND_IMAGE_URI}"
echo ""
echo "Review the plan before applying:"
echo "  cat ${PLAN_FILE}.log"
echo ""
read -p "Continue with apply? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  ok "Apply cancelled. Plan saved for later use."
  ok "To apply later, run: cd ${TERRAFORM_DIR} && terraform apply ${PLAN_FILE}"
  exit 0
fi

# ─────────────────────────────────────────────
# 7. Apply full Terraform configuration
# ─────────────────────────────────────────────
log "Step 7 – Applying Terraform configuration..."
terraform apply -auto-approve "${PLAN_FILE}" 2>&1 | tee -a "${PLAN_FILE}.log"

# ─────────────────────────────────────────────
# 8. Upgrade the database schema - migration
# Run idempotent, additive migrations as one-off ECS tasks against RDS using
# the backend task definition that Terraform just rolled out (which contains
# the latest migration modules, DATABASE_URL secret, and private networking).
# Safe to run on every deploy: each migration no-ops when already applied.
# FORCE_NEW_DEPLOYMENT replaces backend tasks once the schema is upgraded so the
# steady-state tasks always run against a migrated database.
# ─────────────────────────────────────────────
if [[ "${MIGRATE:-false}" != "true" ]]; then
  log "Step 8 – Skipping database schema upgrade (migrations) because --migrate flag was not provided."
else
  log "Step 8 – Upgrading database schema (running migrations)..."
  MIGRATION_CLUSTER_NAME="$(terraform output -raw ecs_cluster_name)"
  if PROJECT_NAME="${PROJECT_NAME}" \
    AWS_REGION="${AWS_REGION}" \
    CLUSTER_NAME="${MIGRATION_CLUSTER_NAME}" \
    FORCE_NEW_DEPLOYMENT=true \
    "${SCRIPT_DIR}/scripts/migration/run_aws_migration.sh" \
      migrations.add_agent_updated_at \
      migrations.add_user_role; then
    ok "Database schema is up to date."
  else
    fail "Database migration failed. The infrastructure is deployed but the schema upgrade did not complete. Inspect CloudWatch logs (/ecs/${PROJECT_NAME}/backend) and re-run: AWS_REGION=${AWS_REGION} ${SCRIPT_DIR}/scripts/migration/run_aws_migration.sh migrations.add_user_role"
  fi
 fi 

# ─────────────────────────────────────────────
# Done – print outputs
# ─────────────────────────────────────────────
APP_URL=$(terraform output -raw application_url)

echo ""
echo "════════════════════════════════════════════════════"
echo "  Deployment complete!"
echo "════════════════════════════════════════════════════"
echo "  Application : ${APP_URL}"
if [[ "$ENABLE_HTTPS" == "true" ]]; then
  echo "  Protocol    : HTTPS (TLS 1.2+)"
  if [[ ${#DOMAIN_NAMES[@]} -gt 0 ]]; then
    echo "  Domains     : ${DOMAIN_NAMES[@]}"
  fi
fi
if [[ "$CREATE_ROUTE53_ZONE" == "true" || -n "${ROUTE53_ZONE_ID}" ]]; then
  NAMESERVERS=$(terraform output -raw route53_nameservers 2>/dev/null || echo "")
  if [[ -n "$NAMESERVERS" ]]; then
    echo ""
    if [[ "$CREATE_ROUTE53_ZONE" == "true" ]]; then
      echo "  Route 53 Hosted Zone created!"
      echo "  Update your registrar's nameservers to:"
    else
      echo "  Route 53 Hosted Zone reused: ${ROUTE53_ZONE_ID}"
      echo "  Current nameservers:"
    fi
    for ns in ${NAMESERVERS//,/ }; do
      echo "    - $ns"
    done
  fi
fi
echo "════════════════════════════════════════════════════"
echo ""
echo "  ECS tasks may take 1-2 minutes to become healthy."
echo ""
if [[ "${ENABLE_HTTPS}" != "true" && ${#HTTP_INGRESS_CIDRS[@]} -eq 0 ]]; then
  echo "  ⚠  Internet HTTP (port 80) is blocked by the ALB security group."
  echo "     The URL above will not respond until you re-deploy with --https"
  echo "     or allow trusted ranges via --http-cidr."
  echo ""
else
  echo "  Verify health:"
  echo "    curl ${APP_URL}/api/health"
  echo ""
fi

