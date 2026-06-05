#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}"
PACKAGE_DIR="${ROOT_DIR}/mcp-package-node"
SKIP_TESTS='false'
DRY_RUN='false'
ALLOW_DIRTY='false'
OTP=''

usage() {
  cat <<'EOF'
Usage: ./deploy_to_npm.sh [options]

Publishes the mcp-package-node package (open-prompt-manager-mcp) to npm.

Options:
  --skip-tests                Skip npm test before publishing
  --dry-run                   Run all checks and npm pack --dry-run, but do not publish
  --allow-dirty               Allow publishing with uncommitted git changes
  --otp <code>                One-time password for npm 2FA publish
  --help                      Show this help text
EOF
}

log() {
  printf '[deploy-npm] %s\n' "$*"
}

fail() {
  printf '[deploy-npm] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tests)
      SKIP_TESTS='true'
      shift
      ;;
    --dry-run)
      DRY_RUN='true'
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY='true'
      shift
      ;;
    --otp)
      [[ $# -ge 2 ]] || fail '--otp requires a 6-digit code'
      OTP="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

require_cmd git
require_cmd node
require_cmd npm

[[ -d "${PACKAGE_DIR}" ]] || fail "Package directory not found: ${PACKAGE_DIR}"

if [[ "${ALLOW_DIRTY}" == 'false' ]]; then
  if [[ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
    fail 'Git working tree is not clean. Commit or stash changes first, or use --allow-dirty.'
  fi
fi

if ! npm whoami >/dev/null 2>&1; then
  fail 'npm authentication is required. Run: npm login'
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < 24 )); then
  fail 'Node.js 24+ is required by mcp-package-node (engines.node >=24).'
fi

PACKAGE_NAME="$(npm --prefix "${PACKAGE_DIR}" pkg get name | tr -d '"')"
PACKAGE_VERSION="$(npm --prefix "${PACKAGE_DIR}" pkg get version | tr -d '"')"
log "Package target: ${PACKAGE_NAME}@${PACKAGE_VERSION}"

log 'Installing dependencies in mcp-package-node'
npm --prefix "${PACKAGE_DIR}" ci

if [[ "${SKIP_TESTS}" == 'false' ]]; then
  log 'Running package tests'
  npm --prefix "${PACKAGE_DIR}" test
else
  log 'Skipping tests'
fi

log 'Previewing publish payload (npm pack --dry-run)'
(cd "${PACKAGE_DIR}" && npm pack --dry-run)

if [[ "${DRY_RUN}" == 'true' ]]; then
  log 'Dry run complete. Skipping npm publish.'
  exit 0
fi

log 'Publishing package to npm'
if [[ -n "${OTP}" ]]; then
  (cd "${PACKAGE_DIR}" && npm publish --otp "${OTP}")
else
  (cd "${PACKAGE_DIR}" && npm publish)
fi

log "Publish complete: ${PACKAGE_NAME}@${PACKAGE_VERSION}"