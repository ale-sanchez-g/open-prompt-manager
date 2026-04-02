#!/usr/bin/env bash
set -euo pipefail

USE_AI_NOTES="${1:-false}"
DRAFT_FILE="${2:-release_notes_draft.md}"
FINAL_FILE="${3:-release_notes.md}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PREVIOUS_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
"${SCRIPT_DIR}/generate_release_notes_draft.sh" "${PREVIOUS_TAG}" "${DRAFT_FILE}"

if [[ "${USE_AI_NOTES}" != "true" ]]; then
  cp "${DRAFT_FILE}" "${FINAL_FILE}"
  exit 0
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY not configured; using deterministic notes."
  cp "${DRAFT_FILE}" "${FINAL_FILE}"
  exit 0
fi

python3 "${SCRIPT_DIR}/polish_release_notes_gemini.py" "${DRAFT_FILE}" "${FINAL_FILE}"
