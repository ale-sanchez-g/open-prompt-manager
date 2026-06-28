#!/usr/bin/env bash
# Vendor the rotation Lambda's Python dependencies into this directory so that
# Terraform's archive_file packages a self-contained deployment zip.
#
# Run this once before `terraform apply` (and whenever requirements.txt
# changes). It is idempotent and safe to re-run. The deploy.sh pipeline calls
# it automatically (see "Database secret rotation" in the deploy script).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "Installing rotation Lambda dependencies into ${SCRIPT_DIR} ..."
"${PYTHON_BIN}" -m pip install \
  --quiet \
  --upgrade \
  --target "${SCRIPT_DIR}" \
  --requirement "${SCRIPT_DIR}/requirements.txt"

echo "Done. Vendored packages are git-ignored; archive_file will zip them with lambda_function.py."
