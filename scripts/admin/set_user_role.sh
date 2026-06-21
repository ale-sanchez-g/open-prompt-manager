#!/usr/bin/env bash
# set_user_role.sh — promote/demote an application user on AWS.
#
# Runs `scripts.set_user_role` as a one-off ECS Fargate task using the backend
# service's existing task definition (same image, secrets, and private
# networking), so it reaches RDS from inside the VPC. The change is idempotent.
#
# Requires the `backend/scripts/set_user_role.py` module to be present in the
# deployed backend image (i.e. built & pushed after this script was added).
#
# Usage:
#   AWS_REGION=ap-southeast-2 ./set_user_role.sh <email> [role]
#
# Examples:
#   AWS_REGION=ap-southeast-2 ./set_user_role.sh admin@opm.io admin
#   AWS_REGION=ap-southeast-2 ./set_user_role.sh someone@opm.io user
#
# Environment variables:
#   AWS_REGION      Required (or AWS_DEFAULT_REGION).
#   PROJECT_NAME    Default: open-prompt-manager
#   CLUSTER_NAME    Default: ${PROJECT_NAME}-cluster
#   SERVICE_NAME    Default: ${PROJECT_NAME}-backend
#   CONTAINER_NAME  Default: backend

set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-open-prompt-manager}"
CLUSTER_NAME="${CLUSTER_NAME:-${PROJECT_NAME}-cluster}"
SERVICE_NAME="${SERVICE_NAME:-${PROJECT_NAME}-backend}"
CONTAINER_NAME="${CONTAINER_NAME:-backend}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
LOG_GROUP="${LOG_GROUP:-/ecs/${PROJECT_NAME}/backend}"

if [[ "$#" -lt 1 || "$#" -gt 2 ]]; then
	echo "Usage: $0 <email> [role]   (role defaults to admin)" >&2
	exit 1
fi

EMAIL="$1"
ROLE="${2:-admin}"

if [[ -z "$AWS_REGION" ]]; then
	echo "AWS_REGION or AWS_DEFAULT_REGION must be set" >&2
	exit 1
fi

for required_command in aws python3; do
	if ! command -v "$required_command" >/dev/null 2>&1; then
		echo "Missing required command: $required_command" >&2
		exit 1
	fi
done

describe_service() {
	local service_attribute_query="$1"

	aws ecs describe-services \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--services "$SERVICE_NAME" \
		--query "$service_attribute_query" \
		--output text
}

echo "Inspecting ECS backend service configuration..."
TASK_DEFINITION_ARN="$(describe_service 'services[0].taskDefinition')"
SUBNETS_RAW="$(describe_service 'services[0].networkConfiguration.awsvpcConfiguration.subnets')"
SECURITY_GROUPS_RAW="$(describe_service 'services[0].networkConfiguration.awsvpcConfiguration.securityGroups')"
ASSIGN_PUBLIC_IP_RAW="$(describe_service 'services[0].networkConfiguration.awsvpcConfiguration.assignPublicIp')"

for value in "$TASK_DEFINITION_ARN:task definition" "$SUBNETS_RAW:subnets" "$SECURITY_GROUPS_RAW:security groups"; do
	if [[ -z "${value%%:*}" || "${value%%:*}" == "None" ]]; then
		echo "Could not resolve ${value##*:} for service $SERVICE_NAME" >&2
		exit 1
	fi
done

NETWORK_CONFIGURATION="$(
	SUBNETS_RAW="$SUBNETS_RAW" SECURITY_GROUPS_RAW="$SECURITY_GROUPS_RAW" \
	ASSIGN_PUBLIC_IP_RAW="$ASSIGN_PUBLIC_IP_RAW" python3 - <<'PY'
import json, os
assign = os.environ.get('ASSIGN_PUBLIC_IP_RAW', 'DISABLED')
if assign in {'None', ''}:
    assign = 'DISABLED'
print(json.dumps({'awsvpcConfiguration': {
    'subnets': os.environ['SUBNETS_RAW'].split(),
    'securityGroups': os.environ['SECURITY_GROUPS_RAW'].split(),
    'assignPublicIp': assign,
}}))
PY
)"

OVERRIDES="$(
	CONTAINER_NAME="$CONTAINER_NAME" EMAIL="$EMAIL" ROLE="$ROLE" python3 - <<'PY'
import json, os
print(json.dumps({'containerOverrides': [{
    'name': os.environ['CONTAINER_NAME'],
    'command': ['python3', '-m', 'scripts.set_user_role', os.environ['EMAIL'], os.environ['ROLE']],
}]}))
PY
)"

echo "Setting role '${ROLE}' for '${EMAIL}' via one-off task (${TASK_DEFINITION_ARN})..."
RUN_OUTPUT="$(
	aws ecs run-task --region "$AWS_REGION" --cluster "$CLUSTER_NAME" \
		--launch-type FARGATE --task-definition "$TASK_DEFINITION_ARN" \
		--network-configuration "$NETWORK_CONFIGURATION" --overrides "$OVERRIDES" \
		--count 1 --output json
)"

TASK_ARN="$(RUN_OUTPUT="$RUN_OUTPUT" python3 - <<'PY'
import json, os, sys
payload = json.loads(os.environ['RUN_OUTPUT'])
if payload.get('failures'):
    print(payload['failures'][0].get('reason', 'ECS run-task failure'), file=sys.stderr)
    sys.exit(1)
tasks = payload.get('tasks') or []
if not tasks:
    print('ECS run-task returned no tasks', file=sys.stderr)
    sys.exit(1)
print(tasks[0]['taskArn'])
PY
)"

TASK_ID="${TASK_ARN##*/}"
echo "Waiting for task to stop: ${TASK_ID}"
aws ecs wait tasks-stopped --region "$AWS_REGION" --cluster "$CLUSTER_NAME" --tasks "$TASK_ARN"

EXIT_CODE="$(aws ecs describe-tasks --region "$AWS_REGION" --cluster "$CLUSTER_NAME" \
	--tasks "$TASK_ARN" \
	--query "tasks[0].containers[?name=='$CONTAINER_NAME'].exitCode | [0]" --output text)"

echo "--- task output ---"
aws logs get-log-events --region "$AWS_REGION" --log-group-name "$LOG_GROUP" \
	--log-stream-name "${CONTAINER_NAME}/${CONTAINER_NAME}/${TASK_ID}" \
	--start-from-head --query 'events[].message' --output text || true
echo "-------------------"

if [[ "$EXIT_CODE" != "0" ]]; then
	echo "Failed: task exited with code ${EXIT_CODE}" >&2
	exit 1
fi

echo "Done: '${EMAIL}' role set to '${ROLE}'"
