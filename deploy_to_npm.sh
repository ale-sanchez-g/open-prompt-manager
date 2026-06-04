#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}"
PACKAGE_DIR="${ROOT_DIR}/mcp-package-node"
VERSION_FILE="${ROOT_DIR}/.version"
DEFAULT_BUMP_TYPE='patch'

BUMP_TYPE="${DEFAULT_BUMP_TYPE}"
SKIP_BUMP='false'
SKIP_TESTS='false'
DRY_RUN='false'
ALLOW_DIRTY='false'

usage() {
  cat <<'EOF'
Usage: ./.deploy_to_npm.sh [options]

Publishes the mcp-package-node package (open-prompt-manager-mcp) to npm.

Options:
  --bump <patch|minor|major>  Version bump type (default: patch)
  --skip-bump                 Do not bump versions before publishing
  --skip-tests                Skip npm test before publishing
  --dry-run                   Run all checks and npm pack --dry-run, but do not publish
  --allow-dirty               Allow publishing with uncommitted git changes
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
    --bump)
      [[ $# -ge 2 ]] || fail '--bump requires an argument'
      BUMP_TYPE="$2"
      shift 2
      ;;
    --skip-bump)
      SKIP_BUMP='true'
      shift
      ;;
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
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

if [[ "${SKIP_BUMP}" == 'false' ]]; then
  case "${BUMP_TYPE}" in
    patch|minor|major) ;;
    *) fail 'Invalid --bump value. Use patch, minor, or major.' ;;
  esac
fi

require_cmd git
require_cmd node
require_cmd npm

[[ -d "${PACKAGE_DIR}" ]] || fail "Package directory not found: ${PACKAGE_DIR}"
[[ -f "${VERSION_FILE}" ]] || fail "Version file not found: ${VERSION_FILE}"

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

if [[ "${SKIP_BUMP}" == 'false' ]]; then
  log "Bumping monorepo version with type: ${BUMP_TYPE}"
  "${ROOT_DIR}/scripts/release/bump_version.sh" "${BUMP_TYPE}"
else
  log 'Skipping version bump'
fi

NEW_VERSION="$(tr -d '[:space:]' < "${VERSION_FILE}")"
log "Target version: ${NEW_VERSION}"

log 'Installing dependencies in mcp-package-node'
npm --prefix "${PACKAGE_DIR}" ci

if [[ "${SKIP_TESTS}" == 'false' ]]; then
  log 'Running package tests'
  npm --prefix "${PACKAGE_DIR}" test
else
  log 'Skipping tests'
fi

log 'Previewing publish payload (npm pack --dry-run)'
npm --prefix "${PACKAGE_DIR}" pack --dry-run

if [[ "${DRY_RUN}" == 'true' ]]; then
  log 'Dry run complete. Skipping npm publish.'
  exit 0
fi

log 'Publishing package to npm'
npm --prefix "${PACKAGE_DIR}" publish

log "Publish complete: open-prompt-manager-mcp@${NEW_VERSION}"