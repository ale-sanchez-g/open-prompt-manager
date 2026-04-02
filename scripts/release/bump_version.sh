#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <major|minor|patch>" >&2
  exit 1
fi

BUMP_TYPE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
VERSION_FILE="${ROOT_DIR}/.version"

if [[ ! -f "${VERSION_FILE}" ]]; then
  echo "Missing ${VERSION_FILE}" >&2
  exit 1
fi

CURRENT_VERSION="$(tr -d '[:space:]' < "${VERSION_FILE}")"

if [[ ! "${CURRENT_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid current version: ${CURRENT_VERSION}" >&2
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT_VERSION}"

case "${BUMP_TYPE}" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "Invalid bump type: ${BUMP_TYPE}. Use major, minor, or patch." >&2
    exit 1
    ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
VERSION_TMP="${VERSION_FILE}.$$".tmp
printf '%s\n' "${NEW_VERSION}" > "${VERSION_TMP}"

"${SCRIPT_DIR}/sync_versions.sh" "${NEW_VERSION}"
mv "${VERSION_TMP}" "${VERSION_FILE}"

echo "Bumped ${CURRENT_VERSION} -> ${NEW_VERSION}"
echo "${NEW_VERSION}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "new_version=${NEW_VERSION}"
  } >> "${GITHUB_OUTPUT}"
fi
