#!/usr/bin/env bash
# deploy.sh – Full deployment script for Open Prompt Manager on AWS
# Usage:
#   ./deploy.sh                        # deploy with defaults
#   ./deploy.sh --region eu-west-1     # override region
#   ./deploy.sh --env staging          # override environment
#   ./deploy.sh --destroy              # tear down all infrastructure
set -euo pipefail

# ─────────────────────────────────────────────
# Defaults (override via flags)
# ─────────────────────────────────────────────
AWS_REGION="us-east-1"
ENVIRONMENT="prod"
PROJECT_NAME="open-prompt-manager"
DESTROY=false

# ─────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)   AWS_REGION="$2";    shift 2 ;;
    --env)      ENVIRONMENT="$2";   shift 2 ;;
    --project)  PROJECT_NAME="$2";  shift 2 ;;
    --destroy)  DESTROY=true;       shift   ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/terraform"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
log()  { echo ""; echo "▶  $*"; }
ok()   { echo "   ✓  $*"; }
warn() { echo "   ⚠  $*"; }
fail() { echo "   ✗  $*" >&2; exit 1; }

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

# ─────────────────────────────────────────────
# Destroy path
# ─────────────────────────────────────────────
if [[ "$DESTROY" == "true" ]]; then
  log "Destroying all infrastructure..."
  cd "${TERRAFORM_DIR}"
  terraform init -input=false -reconfigure
  terraform destroy -auto-approve \
    -var="aws_region=${AWS_REGION}" \
    -var="environment=${ENVIRONMENT}" \
    -var="project_name=${PROJECT_NAME}"
  ok "Infrastructure destroyed."
  exit 0
fi

# ─────────────────────────────────────────────
# 1. Bootstrap ECR repositories
# ─────────────────────────────────────────────
log "Step 1/5 – Bootstrapping ECR repositories..."
cd "${TERRAFORM_DIR}"
terraform init -input=false -reconfigure
terraform apply -auto-approve \
  -target=aws_ecr_repository.backend \
  -target=aws_ecr_repository.frontend \
  -var="aws_region=${AWS_REGION}" \
  -var="environment=${ENVIRONMENT}" \
  -var="project_name=${PROJECT_NAME}"
ok "ECR repositories ready."

BACKEND_REPO=$(terraform output -raw backend_ecr_repository_url)
FRONTEND_REPO=$(terraform output -raw frontend_ecr_repository_url)

# ─────────────────────────────────────────────
# 2. Authenticate Docker to ECR
# ─────────────────────────────────────────────
log "Step 2/5 – Authenticating Docker to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin \
      "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ok "Docker authenticated to ECR."

# ─────────────────────────────────────────────
# 3. Build and push Docker images
# ─────────────────────────────────────────────
log "Step 3/5 – Building and pushing backend image (linux/amd64)..."
docker buildx build --platform linux/amd64 \
  -t "${BACKEND_REPO}:latest" "${BACKEND_DIR}" --push
ok "Backend image pushed: ${BACKEND_REPO}:latest"

log "           Building and pushing frontend image (linux/amd64)..."
docker buildx build --platform linux/amd64 \
  -t "${FRONTEND_REPO}:latest" "${FRONTEND_DIR}" --push
ok "Frontend image pushed: ${FRONTEND_REPO}:latest"

# ─────────────────────────────────────────────
# 4. Clean up any stale Secrets Manager secrets
#    (AWS holds deleted secrets for 7-30 days by default; a name clash will
#    block the apply. We force-delete only if one is scheduled for deletion.)
# ─────────────────────────────────────────────
log "Step 4/5 – Checking for stale Secrets Manager secrets..."
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
# 5. Full Terraform apply
# ─────────────────────────────────────────────
log "Step 5/5 – Applying full Terraform configuration..."
cd "${TERRAFORM_DIR}"
terraform apply -auto-approve \
  -var="aws_region=${AWS_REGION}" \
  -var="environment=${ENVIRONMENT}" \
  -var="project_name=${PROJECT_NAME}"

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
