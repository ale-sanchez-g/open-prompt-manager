#!/usr/bin/env bash
# run_aws_migration.sh — Reusable runner for backend DB schema migrations on AWS.
#
# Runs one or more migration modules as one-off ECS Fargate tasks using a
# migration-only task definition derived from the backend service definition.
# The derived definition keeps only the backend container (same image, secrets,
# and private networking) so optional sidecars that may rely on internet-only
# registries do not block schema upgrades in private-only egress environments.
#
# Usage:
#   AWS_REGION=us-east-1 ./run_aws_migration.sh migrations.add_user_role
#   AWS_REGION=us-east-1 ./run_aws_migration.sh migrations.add_agent_updated_at migrations.add_user_role
#
# Each module is executed via `python3 -m <module>` inside the backend
# container. Migration modules are expected to be idempotent so the runner is
# safe to invoke on every deployment.
#
# Environment variables:
#   AWS_REGION            Required (or AWS_DEFAULT_REGION).
#   PROJECT_NAME          Default: open-prompt-manager
#   CLUSTER_NAME          Default: ${PROJECT_NAME}-cluster
#   SERVICE_NAME          Default: ${PROJECT_NAME}-backend
#   CONTAINER_NAME        Default: backend
#   FORCE_NEW_DEPLOYMENT  Default: false. When true, forces a new backend
#                         deployment and waits for the service to stabilise
#                         after all migrations complete.

set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-open-prompt-manager}"
CLUSTER_NAME="${CLUSTER_NAME:-${PROJECT_NAME}-cluster}"
SERVICE_NAME="${SERVICE_NAME:-${PROJECT_NAME}-backend}"
CONTAINER_NAME="${CONTAINER_NAME:-backend}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
FORCE_NEW_DEPLOYMENT="${FORCE_NEW_DEPLOYMENT:-false}"

if [[ "$#" -lt 1 ]]; then
	echo "Usage: $0 <migration_module> [migration_module ...]" >&2
	echo "Example: $0 migrations.add_user_role" >&2
	exit 1
fi

MIGRATION_MODULES=("$@")

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

echo "Preparing migration-only task definition from service task definition..."

MIGRATION_TASK_DEFINITION_ARN="$({
	BASE_TASK_DEFINITION_ARN="$TASK_DEFINITION_ARN" \
	CONTAINER_NAME="$CONTAINER_NAME" \
	AWS_REGION="$AWS_REGION" \
	python3 - <<'PY'
import json
import os
import subprocess
import sys

base_task_definition_arn = os.environ['BASE_TASK_DEFINITION_ARN']
container_name = os.environ['CONTAINER_NAME']
aws_region = os.environ['AWS_REGION']

describe_cmd = [
	'aws', 'ecs', 'describe-task-definition',
	'--region', aws_region,
	'--task-definition', base_task_definition_arn,
	'--query', 'taskDefinition',
	'--output', 'json',
]

try:
	describe_proc = subprocess.run(describe_cmd, check=True, capture_output=True, text=True)
except subprocess.CalledProcessError as exc:
	sys.stderr.write(exc.stderr or 'Failed to describe task definition\n')
	sys.exit(1)

task_definition = json.loads(describe_proc.stdout)
backend_containers = [c for c in task_definition.get('containerDefinitions', []) if c.get('name') == container_name]

if not backend_containers:
	sys.stderr.write(f"Container '{container_name}' was not found in task definition {base_task_definition_arn}\n")
	sys.exit(1)

register_payload = {
	'family': f"{task_definition['family']}-migration",
	'networkMode': task_definition['networkMode'],
	'containerDefinitions': backend_containers,
	'requiresCompatibilities': task_definition.get('requiresCompatibilities', []),
	'cpu': task_definition.get('cpu'),
	'memory': task_definition.get('memory'),
	'taskRoleArn': task_definition.get('taskRoleArn'),
	'executionRoleArn': task_definition.get('executionRoleArn'),
	'volumes': task_definition.get('volumes', []),
}

if task_definition.get('runtimePlatform'):
	register_payload['runtimePlatform'] = task_definition['runtimePlatform']
if task_definition.get('ephemeralStorage'):
	register_payload['ephemeralStorage'] = task_definition['ephemeralStorage']
if task_definition.get('proxyConfiguration'):
	register_payload['proxyConfiguration'] = task_definition['proxyConfiguration']
if task_definition.get('pidMode'):
	register_payload['pidMode'] = task_definition['pidMode']
if task_definition.get('ipcMode'):
	register_payload['ipcMode'] = task_definition['ipcMode']

# Remove null/empty values that AWS rejects in register-task-definition input.
register_payload = {
	key: value
	for key, value in register_payload.items()
	if value not in (None, '', [])
}

register_cmd = [
	'aws', 'ecs', 'register-task-definition',
	'--region', aws_region,
	'--cli-input-json', json.dumps(register_payload),
	'--query', 'taskDefinition.taskDefinitionArn',
	'--output', 'text',
]

try:
	register_proc = subprocess.run(register_cmd, check=True, capture_output=True, text=True)
except subprocess.CalledProcessError as exc:
	sys.stderr.write(exc.stderr or 'Failed to register migration task definition\n')
	sys.exit(1)

print(register_proc.stdout.strip())
PY
})"

if [[ -z "$MIGRATION_TASK_DEFINITION_ARN" || "$MIGRATION_TASK_DEFINITION_ARN" == "None" ]]; then
	echo "Could not register migration task definition" >&2
	exit 1
fi

echo "Using migration task definition: ${MIGRATION_TASK_DEFINITION_ARN}"

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

run_migration_module() {
	local migration_module="$1"

	local overrides
	overrides="$({
		CONTAINER_NAME="$CONTAINER_NAME" \
		MIGRATION_MODULE="$migration_module" \
		python3 - <<'PY'
import json
import os

container_name = os.environ['CONTAINER_NAME']
migration_module = os.environ['MIGRATION_MODULE']
print(json.dumps({
		'containerOverrides': [{
				'name': container_name,
				'command': ['python3', '-m', migration_module],
		}]
}))
PY
	})"

	echo "Running one-off migration task: ${migration_module} (task definition: ${MIGRATION_TASK_DEFINITION_ARN})"

	local run_task_output
	run_task_output="$({
		aws ecs run-task \
			--region "$AWS_REGION" \
			--cluster "$CLUSTER_NAME" \
			--launch-type FARGATE \
			--task-definition "$MIGRATION_TASK_DEFINITION_ARN" \
			--network-configuration "$NETWORK_CONFIGURATION" \
			--overrides "$overrides" \
			--count 1 \
			--output json
	})"

	local run_task_arn
	run_task_arn="$({
		RUN_TASK_OUTPUT="$run_task_output" python3 - <<'PY'
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

	echo "Waiting for migration task to stop: $run_task_arn"

	aws ecs wait tasks-stopped \
		--region "$AWS_REGION" \
		--cluster "$CLUSTER_NAME" \
		--tasks "$run_task_arn"

	local task_exit_code
	task_exit_code="$({
		aws ecs describe-tasks \
			--region "$AWS_REGION" \
			--cluster "$CLUSTER_NAME" \
			--tasks "$run_task_arn" \
			--query "tasks[0].containers[?name=='$CONTAINER_NAME'].exitCode | [0]" \
			--output text
	})"

	local task_stopped_reason
	task_stopped_reason="$({
		aws ecs describe-tasks \
			--region "$AWS_REGION" \
			--cluster "$CLUSTER_NAME" \
			--tasks "$run_task_arn" \
			--query 'tasks[0].stoppedReason' \
			--output text
	})"

	if [[ "$task_exit_code" != "0" ]]; then
		echo "Migration task '${migration_module}' failed with exit code $task_exit_code" >&2
		echo "Stopped reason: $task_stopped_reason" >&2
		echo "Inspect backend logs in CloudWatch: /ecs/${PROJECT_NAME}/backend" >&2
		exit 1
	fi

	echo "Migration '${migration_module}' completed successfully"
}

for module in "${MIGRATION_MODULES[@]}"; do
	run_migration_module "$module"
done

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
