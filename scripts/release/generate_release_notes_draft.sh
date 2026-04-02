#!/usr/bin/env bash
set -euo pipefail

PREVIOUS_TAG="${1:-}"
OUTPUT_FILE="${2:-release_notes_draft.md}"

if [[ -n "${PREVIOUS_TAG}" ]]; then
  RANGE="${PREVIOUS_TAG}..HEAD"
else
  RANGE="HEAD"
fi

{
  echo "# Release Notes Draft"
  echo
  echo "## Summary"
  if [[ -n "${PREVIOUS_TAG}" ]]; then
    echo "Changes since ${PREVIOUS_TAG}."
  else
    echo "Initial tagged release for this repository."
  fi
  echo
  echo "## Features"
  git log "${RANGE}" --pretty=format:'- %s (%h)' --grep='^feat' --regexp-ignore-case || true
  echo
  echo
  echo "## Fixes"
  git log "${RANGE}" --pretty=format:'- %s (%h)' --grep='^fix' --regexp-ignore-case || true
  echo
  echo
  echo "## Docs"
  git log "${RANGE}" --pretty=format:'- %s (%h)' --grep='^docs' --regexp-ignore-case || true
  echo
  echo
  echo "## Chores and Refactors"
  git log "${RANGE}" --pretty=format:'- %s (%h)' --grep='^(chore|refactor)' --extended-regexp --regexp-ignore-case || true
  echo
  echo
  echo "## All Commits"
  git log "${RANGE}" --pretty=format:'- %s (%h)' || true
} > "${OUTPUT_FILE}"
