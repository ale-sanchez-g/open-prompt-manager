#!/usr/bin/env bash
# 2026-jun-20-aws-mig-002.sh — Run the users.role migration (MIG-002) on AWS.
#
# Adds the `users.role` column required for role-based access control by running
# the `migrations.add_user_role` module as a one-off ECS task against the
# backend service's database. See migration/2026-jun-20-mig-002.md for the full
# rollout guide.
#
# Usage:
#   AWS_REGION=us-east-1 ./scripts/migration/2026-jun-20-aws-mig-002.sh
#   AWS_REGION=us-east-1 FORCE_NEW_DEPLOYMENT=true ./scripts/migration/2026-jun-20-aws-mig-002.sh
#
# All configuration is via the same environment variables understood by
# run_aws_migration.sh (PROJECT_NAME, CLUSTER_NAME, SERVICE_NAME,
# CONTAINER_NAME, AWS_REGION, FORCE_NEW_DEPLOYMENT).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "${SCRIPT_DIR}/run_aws_migration.sh" migrations.add_user_role
