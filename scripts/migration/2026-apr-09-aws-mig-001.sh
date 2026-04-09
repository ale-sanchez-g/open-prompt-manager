#!/usr/bin/env bash

set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-open-prompt-manager}"
CLUSTER_NAME="${CLUSTER_NAME:-${PROJECT_NAME}-cluster}"
SERVICE_NAME="${SERVICE_NAME:-${PROJECT_NAME}-backend}"
CONTAINER_NAME="${CONTAINER_NAME:-backend}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
FORCE_NEW_DEPLOYMENT="${FORCE_NEW_DEPLOYMENT:-false}"

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

echo "Inspecting ECS backend service configuration..."

TASK_DEFINITION_ARN="$({
	aws ecs describe-services \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--services "$SERVICE_NAME" \
		--query 'services[0].taskDefinition' \
		--output text
})"

if [[ -z "$TASK_DEFINITION_ARN" || "$TASK_DEFINITION_ARN" == "None" ]]; then
	echo "Could not resolve task definition for service $SERVICE_NAME in cluster $CLUSTER_NAME" >&2
	exit 1
fi

SUBNETS_RAW="$({
	aws ecs describe-services \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--services "$SERVICE_NAME" \
		--query 'services[0].networkConfiguration.awsvpcConfiguration.subnets' \
		--output text
})"

SECURITY_GROUPS_RAW="$({
	aws ecs describe-services \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--services "$SERVICE_NAME" \
		--query 'services[0].networkConfiguration.awsvpcConfiguration.securityGroups' \
		--output text
})"

ASSIGN_PUBLIC_IP_RAW="$({
	aws ecs describe-services \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--services "$SERVICE_NAME" \
		--query 'services[0].networkConfiguration.awsvpcConfiguration.assignPublicIp' \
		--output text
})"

if [[ -z "$SUBNETS_RAW" || "$SUBNETS_RAW" == "None" ]]; then
	echo "Could not resolve service subnets" >&2
	exit 1
fi

if [[ -z "$SECURITY_GROUPS_RAW" || "$SECURITY_GROUPS_RAW" == "None" ]]; then
	echo "Could not resolve service security groups" >&2
	exit 1
fi

NETWORK_CONFIGURATION="$({
	SUBNETS_RAW="$SUBNETS_RAW" \
	SECURITY_GROUPS_RAW="$SECURITY_GROUPS_RAW" \
	ASSIGN_PUBLIC_IP_RAW="$ASSIGN_PUBLIC_IP_RAW" \
	python3 - <<'PY'
import json
import os

subnets = os.environ['SUBNETS_RAW'].split()
security_groups = os.environ['SECURITY_GROUPS_RAW'].split()
assign_public_ip = os.environ.get('ASSIGN_PUBLIC_IP_RAW', 'DISABLED')

if assign_public_ip in {'None', ''}:
		assign_public_ip = 'DISABLED'

print(json.dumps({
		'awsvpcConfiguration': {
				'subnets': subnets,
				'securityGroups': security_groups,
				'assignPublicIp': assign_public_ip,
		}
}))
PY
})"

OVERRIDES='{"containerOverrides":[{"name":"backend","command":["python","-m","migrations.add_agent_updated_at"]}]}'

echo "Running one-off migration task with task definition: $TASK_DEFINITION_ARN"

RUN_TASK_OUTPUT="$({
	aws ecs run-task \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--launch-type FARGATE \
		--task-definition "$TASK_DEFINITION_ARN" \
		--network-configuration "$NETWORK_CONFIGURATION" \
		--overrides "$OVERRIDES" \
		--count 1 \
		--output json
})"

RUN_TASK_ARN="$({
	RUN_TASK_OUTPUT="$RUN_TASK_OUTPUT" python3 - <<'PY'
import json
import os
import sys

payload = json.loads(os.environ['RUN_TASK_OUTPUT'])
failures = payload.get('failures', [])
if failures:
		print(failures[0].get('reason', 'Unknown ECS run-task failure'), file=sys.stderr)
		sys.exit(1)

tasks = payload.get('tasks', [])
if not tasks:
		print('ECS run-task returned no tasks', file=sys.stderr)
		sys.exit(1)

print(tasks[0]['taskArn'])
PY
})"

echo "Waiting for migration task to stop: $RUN_TASK_ARN"

aws ecs wait tasks-stopped \
	--region "$AWS_REGION" \
	--cluster "$CLUSTER_NAME" \
	--tasks "$RUN_TASK_ARN"

TASK_EXIT_CODE="$({
	aws ecs describe-tasks \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--tasks "$RUN_TASK_ARN" \
		--query "tasks[0].containers[?name=='$CONTAINER_NAME'].exitCode | [0]" \
		--output text
})"

TASK_STOPPED_REASON="$({
	aws ecs describe-tasks \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--tasks "$RUN_TASK_ARN" \
		--query 'tasks[0].stoppedReason' \
		--output text
})"

if [[ "$TASK_EXIT_CODE" != "0" ]]; then
	echo "Migration task failed with exit code $TASK_EXIT_CODE" >&2
	echo "Stopped reason: $TASK_STOPPED_REASON" >&2
	echo "Inspect backend logs in CloudWatch: /ecs/${PROJECT_NAME}/backend" >&2
	exit 1
fi

echo "Migration task completed successfully"

if [[ "$FORCE_NEW_DEPLOYMENT" == "true" ]]; then
	echo "Forcing a new ECS deployment for $SERVICE_NAME"
	aws ecs update-service \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--service "$SERVICE_NAME" \
		--force-new-deployment >/dev/null

	aws ecs wait services-stable \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--services "$SERVICE_NAME"

	echo "Service is stable after forced deployment"
fi

echo "Done"
