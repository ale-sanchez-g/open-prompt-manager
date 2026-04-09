#!/usr/bin/env bash
# deploy.sh – Full deployment script for Open Prompt Manager on AWS
# Usage:
#   ./deploy.sh                                                    # deploy with defaults (HTTP only)
#   ./deploy.sh --region eu-west-1                               # override region
#   ./deploy.sh --env staging                                    # override environment
#   ./deploy.sh --https --domain example.com                     # enable HTTPS with certificate
#   ./deploy.sh --https --domain example.com --domain www.example.com  # multiple domains
#   ./deploy.sh --https --domain example.com --route53           # HTTPS + Route 53 DNS management
#   ./deploy.sh --destroy                                         # tear down all infrastructure
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
ROUTE53_ZONE_ID=""
PRIMARY_DOMAIN=""
DOMAIN_NAMES=()

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
    --route53)  CREATE_ROUTE53_ZONE=true; shift ;;
    --destroy)  DESTROY=true;       shift   ;;
    *) echo "Unknown option: $1"; exit 1 ;;
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

  if aws ecr describe-repositories \
    --repository-names "${repo_name}" \
    --region "${AWS_REGION}" >/dev/null 2>&1; then
    warn "ECR repository '${repo_name}' already exists; importing into Terraform state..."
    terraform import \
      -var="aws_region=${AWS_REGION}" \
      -var="environment=${ENVIRONMENT}" \
      -var="project_name=${PROJECT_NAME}" \
      "${tf_address}" "${repo_name}" >/dev/null
    ok "Imported ${tf_address}"
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
    -var="aws_region=${AWS_REGION}" \
    -var="environment=${ENVIRONMENT}" \
    -var="project_name=${PROJECT_NAME}" \
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

DEPLOY_TAG=$(git -C "${SCRIPT_DIR}" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
ok "Deploy image tag: ${DEPLOY_TAG}"

DOMAIN_NAMES_ARG=$(build_domain_names_arg)

if [[ "${CREATE_ROUTE53_ZONE}" == "true" && -n "${PRIMARY_DOMAIN}" ]]; then
  ROUTE53_ZONE_ID=$(get_delegated_public_zone_id)
  if [[ -n "${ROUTE53_ZONE_ID}" ]]; then
    warn "Found existing hosted zone for ${PRIMARY_DOMAIN}; reusing zone ${ROUTE53_ZONE_ID} instead of creating a new one."
    CREATE_ROUTE53_ZONE=false
  fi
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
    -var="enable_https=${ENABLE_HTTPS}" \
    -var="create_certificate=${CREATE_CERTIFICATE}" \
    -var="domain_name=${PRIMARY_DOMAIN}" \
    -var="domain_names=${DOMAIN_NAMES_ARG}" \
    -var="route53_zone_id=${ROUTE53_ZONE_ID}" \
    -var="create_route53_zone=${CREATE_ROUTE53_ZONE}"
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

log "Planning ECR repository changes..."
terraform plan -out="${PLAN_FILE}.ecr" \
  -target=aws_ecr_repository.backend \
  -target=aws_ecr_repository.frontend \
  -var="aws_region=${AWS_REGION}" \
  -var="environment=${ENVIRONMENT}" \
  -var="project_name=${PROJECT_NAME}" 2>&1 | tee "${PLAN_FILE}.ecr.log"

log "Applying ECR repository changes..."
terraform apply -auto-approve "${PLAN_FILE}.ecr"
ok "ECR repositories ready."

BACKEND_REPO=$(terraform output -raw backend_ecr_repository_url)
FRONTEND_REPO=$(terraform output -raw frontend_ecr_repository_url)

# ─────────────────────────────────────────────
# 2. Authenticate Docker to ECR
# ─────────────────────────────────────────────
log "Step 2/6 – Authenticating Docker to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin \
      "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ok "Docker authenticated to ECR."

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
  -var="backend_image=${BACKEND_IMAGE_URI}" \
  -var="frontend_image=${FRONTEND_IMAGE_URI}" \
  -var="enable_https=${ENABLE_HTTPS}" \
  -var="create_certificate=${CREATE_CERTIFICATE}" \
  -var="domain_name=${PRIMARY_DOMAIN}" \
  -var="domain_names=${DOMAIN_NAMES_ARG}" \
  -var="route53_zone_id=${ROUTE53_ZONE_ID}" \
  -var="create_route53_zone=${CREATE_ROUTE53_ZONE}" 2>&1 | tee "${PLAN_FILE}.log"

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
# Done – print outputs
# ─────────────────────────────────────────────
APP_URL=$(terraform output -raw application_url)
MCP_URL=$(terraform output -raw mcp_url)

echo ""
echo "════════════════════════════════════════════════════"
echo "  Deployment complete!"
echo "════════════════════════════════════════════════════"
echo "  Application : ${APP_URL}"
echo "  MCP server  : ${MCP_URL}"
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
echo "  Verify health:"
echo "    curl ${APP_URL}/api/health"
echo ""
echo "  Verify MCP:"
echo "    curl -s -X POST ${MCP_URL} \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}}}'"
echo ""
