# ALB 5xx Error Spike Runbook

**Severity:** P1 (Critical)  
**Response Time:** 15 minutes  
**Owner:** Platform Engineer / SRE — TODO: fill name

---

## Overview

The Application Load Balancer (ALB) returns 5xx errors when:
- Backend tasks are unhealthy or unresponsive
- Backend tasks are crashing or restarting
- Backend tasks are completely unavailable

This runbook helps you quickly diagnose whether the issue is with:
1. Infrastructure (ECS, ALB, networking)
2. Application code (bad deploy, unhandled exception)
3. External dependencies (database, secrets, rate limiting)

---

## Detection Signals

1. **ALB Metrics**
   - CloudWatch alarm: "HTTPCode_Target_5XX > 100 in 5 minutes" (planned, see issue #331)
   - ALB target group shows backend tasks as "unhealthy"
   - Health check failures on `/api/ready` endpoint

2. **User Reports**
   - "I'm getting 500 errors on all API requests"
   - "The dashboard won't load"
   - "Login is broken"

3. **CloudWatch Logs**
   - No logs from backend service (tasks may be crashing)
   - Errors in `/ecs/open-prompt-manager/backend`:
     ```
     Internal Server Error
     Exception
     CRITICAL
     ERROR
     ```

4. **ECS Metrics**
   - Backend service `runningCount` < `desiredCount` (tasks are crashing)
   - High memory or CPU usage on remaining tasks

---

## Triage Steps

### Step 1: Establish AWS CLI Context

```bash
export AWS_REGION="ap-southeast-2"           # or your region
export PROJECT_NAME="open-prompt-manager"
export ENVIRONMENT="prod"
export CLUSTER_NAME="${PROJECT_NAME}-cluster"
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

### Step 2: Check ALB Target Group Health

```bash
# Get the backend target group ARN
BACKEND_TG_ARN=$(aws elbv2 describe-target-groups \
  --names "${PROJECT_NAME}-backend-tg" \
  --region "${AWS_REGION}" \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

# Check target health
aws elbv2 describe-target-health \
  --target-group-arn "${BACKEND_TG_ARN}" \
  --region "${AWS_REGION}" \
  --query 'TargetHealthDescriptions[*].[Target.Id,TargetHealth.State,TargetHealth.ReasonCode,TargetHealth.Description]' \
  --output table

# Interpretation:
# - "healthy" — task is running and responsive
# - "unhealthy" — task failed health check (reasons: "Target.ResponseCodeMismatch", "Elb.RegistrationInProgress", "Target.Timeout")
# - "initial" — task just registered; waiting for first health check
# - "draining" — task is being removed from the target group (during deploy or scale-down)
# - "unused" — target group has never registered this target
```

### Step 3: Check ECS Service Status

```bash
# Describe the backend service
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --output table \
  --query 'services[0].[serviceName,status,runningCount,desiredCount]'

# If runningCount is 0, all tasks have crashed
# If runningCount < desiredCount, tasks are failing or restarting

# Check deployment status
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].deployments[*].[taskDefinition,status,runningCount,desiredCount,createdAt]' \
  --output table
```

### Step 4: List Running Backend Tasks

```bash
# Get all backend tasks
TASKS=$(aws ecs list-tasks \
  --cluster "${CLUSTER_NAME}" \
  --service-name "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'taskArns' \
  --output text)

echo "Backend tasks:"
echo "${TASKS}"

# If no tasks, the service has no running tasks (critical)
if [[ -z "${TASKS}" ]]; then
  echo "ERROR: No running backend tasks! Service is completely down."
  # Jump to "Immediate Recovery" section
fi

# Describe each task
aws ecs describe-tasks \
  --cluster "${CLUSTER_NAME}" \
  --tasks ${TASKS} \
  --region "${AWS_REGION}" \
  --query 'tasks[*].[taskArn,lastStatus,stoppedCode,stoppedReason,containers[0].exitCode]' \
  --output table
```

### Step 5: Check Recent Backend Logs

```bash
# Tail logs for the last 100 messages
aws logs tail "/ecs/${PROJECT_NAME}/backend" \
  --max-items 100 \
  --region "${AWS_REGION}"

# Search for errors and exceptions
aws logs filter-log-events \
  --log-group-name "/ecs/${PROJECT_NAME}/backend" \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --filter-pattern "ERROR OR Exception OR Traceback OR 500" \
  --region "${AWS_REGION}" \
  --query 'events[*].[timestamp,message]' \
  --output text | head -50

# Look for patterns:
# - Database connection errors (see database-unavailable.md)
# - JWT errors (see auth-outage.md)
# - Application exceptions (code bug)
# - Out of memory or resource errors
```

### Step 6: Check Backend Task Memory & CPU

```bash
# Get detailed task metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value="${PROJECT_NAME}-backend-service" \
              Name=ClusterName,Value="${CLUSTER_NAME}" \
  --start-time $(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum \
  --region "${AWS_REGION}" \
  --output table

# Memory (requires container insights to be enabled, which it is)
aws cloudwatch get-metric-statistics \
  --namespace ECS/ContainerInsights \
  --metric-name MemoryUtilized \
  --dimensions Name=ServiceName,Value="${PROJECT_NAME}-backend-service" \
              Name=ClusterName,Value="${CLUSTER_NAME}" \
  --start-time $(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum \
  --region "${AWS_REGION}" \
  --output table
```

### Step 7: Check ALB Access Logs for 5xx Details

```bash
# Get the S3 bucket where ALB logs are stored
ALB_LOG_BUCKET=$(aws elbv2 describe-load-balancers \
  --names "${PROJECT_NAME}-alb" \
  --region "${AWS_REGION}" \
  --query 'LoadBalancers[0].LoadBalancerAttributes[?Key==`access_logs.s3.bucket`].Value' \
  --output text)

# If bucket is not configured, skip this step

# List recent log files (ALB logs are created every 5 minutes)
aws s3 ls "s3://${ALB_LOG_BUCKET}/${PROJECT_NAME}/" \
  --recursive \
  --human-readable | tail -20

# Download and analyze the latest logs
LATEST_LOG=$(aws s3 ls "s3://${ALB_LOG_BUCKET}/${PROJECT_NAME}/" \
  --recursive \
  --human-readable | tail -1 | awk '{print $NF}')

aws s3 cp "s3://${ALB_LOG_BUCKET}/${LATEST_LOG}" /tmp/alb.log

# Count 5xx errors
grep "500\|502\|503\|504" /tmp/alb.log | wc -l

# Show a sample
grep "500\|502\|503\|504" /tmp/alb.log | head -10
```

---

## Mitigation

### Scenario A: All Tasks Are Crashed (runningCount = 0)

**Likely cause:** Bad code deployment or critical infrastructure issue

**Recovery steps:**

```bash
# 1. Scale up one task to see what the error is
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --desired-count 1 \
  --region "${AWS_REGION}"

# 2. Wait 30 seconds for the task to start
sleep 30

# 3. Check logs
aws logs tail "/ecs/${PROJECT_NAME}/backend" \
  --follow \
  --region "${AWS_REGION}"

# 4. If the task crashes immediately, there's a code or infrastructure issue
# - Check the task definition for the issue (see deploy-rollback.md)
# - Check database connectivity (see database-unavailable.md)
# - Check secrets (JWT_SECRET, DATABASE_URL)

# 5. If the error is a bad deployment, rollback (see deploy-rollback.md)
#    Otherwise, investigate the root cause and fix

# 6. Once fixed, scale back up to desired count
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --desired-count 2 \
  --region "${AWS_REGION}"
```

### Scenario B: Some Tasks Are Unhealthy (runningCount < desiredCount)

**Likely cause:** Intermittent crashes, memory leak, or slow startup

**Recovery steps:**

```bash
# 1. Check if the issue is scaling-related (too many tasks for available resources)
# Get ECS cluster capacity
aws ecs describe-clusters \
  --clusters "${CLUSTER_NAME}" \
  --region "${AWS_REGION}" \
  --query 'clusters[0].{Name:clusterName,RegisteredContainerInstancesCount:registeredContainerInstancesCount,ActiveServicesCount:activeServicesCount}'

# 2. Check container instance resources
aws ecs list-container-instances \
  --cluster "${CLUSTER_NAME}" \
  --region "${AWS_REGION}" \
  --output text

# 3. If tasks are crashing due to memory pressure, increase task memory or reduce desired count
# Update the task definition (in Terraform):
cd terraform
terraform plan -out=increase_memory.tfplan \
  -var="backend_memory=2048"  # or 1536, depending on current value
terraform apply increase_memory.tfplan

# 4. If crashes are due to a code issue, investigate logs and rollback (see deploy-rollback.md)

# 5. If crashes are transient, force a restart
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --force-new-deployment \
  --region "${AWS_REGION}"
```

### Scenario C: All Tasks Are Healthy but Still Returning 5xx

**Likely cause:** Application code bug, external dependency timeout, or bad config

**Recovery steps:**

```bash
# 1. Check task logs for specific errors
aws logs tail "/ecs/${PROJECT_NAME}/backend" \
  --filter-pattern "500 OR Exception OR Traceback" \
  --follow \
  --region "${AWS_REGION}"

# 2. If the error is consistent, it's a code issue → rollback (see deploy-rollback.md)

# 3. If the error is intermittent, it's likely an external dependency issue:
#    - Database: See database-unavailable.md
#    - Auth: See auth-outage.md
#    - Rate limiting: Check if legitimate requests are being rate-limited

# 4. Test the backend directly (from the ALB)
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names "${PROJECT_NAME}-alb" \
  --region "${AWS_REGION}" \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

curl http://${ALB_DNS}/api/health
# Should return: {"status":"ok","version":"..."}

# 5. If the direct test fails, the issue is in the backend service or network
#    Check security groups and routing rules
```

### Scenario D: Health Check Timeout

**Likely cause:** Backend is slow or under heavy load

**Recovery steps:**

```bash
# 1. Check if the backend is simply slow
# ALB health check endpoint: /api/ready
# Timeout: 5 seconds
# Interval: 30 seconds
# Unhealthy threshold: 3 consecutive failures

# 2. If the backend is under heavy load, scale up
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --desired-count 3 \
  --region "${AWS_REGION}"

# 3. Increase task resources (CPU/memory)
cd terraform
terraform plan -out=scale_up.tfplan \
  -var="backend_cpu=1024" \
  -var="backend_memory=2048"
terraform apply scale_up.tfplan

# 4. Check if there are slow queries in the database
# See database-unavailable.md for query performance diagnostics

# 5. If the health check is too strict, adjust the thresholds (temporary)
# Edit ALB target group settings:
aws elbv2 modify-target-group \
  --target-group-arn "${BACKEND_TG_ARN}" \
  --health-check-timeout-seconds 10 \
  --health-check-interval-seconds 45 \
  --region "${AWS_REGION}"
```

---

## Long-Term Mitigation

1. **Add CloudWatch alarms**
   - HTTPCode_Target_5XX > 100 in 5 minutes → Page on-call
   - TargetResponseTime > 2 seconds → Alert
   - UnHealthyHostCount > 0 → Alert

2. **Improve observability**
   - Add distributed tracing (AWS X-Ray)
   - Add custom metrics for business logic
   - Create dashboards for error rates by endpoint

3. **Improve reliability**
   - Add retries and circuit breakers
   - Implement graceful degradation
   - Use canary deployments to catch regressions

4. **Capacity planning**
   - Monitor task count and scaling trends
   - Right-size task CPU/memory
   - Consider auto-scaling based on metrics

---

## Escalation Path

1. **0-3 min:** Check ALB target health and ECS task status
2. **3-10 min:** Diagnose the root cause (code, infra, external dependency)
3. **10-15 min:** Apply mitigation (rollback, restart, scale up)
4. **15+ min:** If no resolution, escalate to **Incident Commander**

---

## Owner

**Platform Engineer / SRE:** — TODO: fill name  
**Backend Engineer:** — TODO: fill name  
**Incident Commander:** — TODO: fill name

---

## Related Documentation

- [Deploy & Rollback Runbook](./deploy-rollback.md) — for code issues
- [Database Unavailable Runbook](./database-unavailable.md) — for database issues
- [Auth Outage Runbook](./auth-outage-credential-stuffing.md) — for auth issues
- [README.md#Quick-Start](../../README.md#Quick-Start) — application overview
- AWS ALB Troubleshooting: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/

---

## Testing This Runbook

Before an incident:

1. **Simulate task crash:** Stop a backend task manually and verify ALB detects unhealthiness
2. **Simulate slow response:** Add a delay to the health check endpoint and measure timeout
3. **Load test:** Run `ab` or `wrk` against the ALB and observe 5xx error handling
4. **Verify metrics:** Confirm CloudWatch metrics are being collected correctly

---

## Lessons Learned (Post-Incident)

After this runbook is exercised, document:
- **What triggered the 5xx spike?**
- **How quickly was it detected?**
- **What was the fastest mitigation?**
- **Should we improve monitoring or alerting?**
- **Should we increase task resources or add auto-scaling?**

Update this runbook and notify the team of changes.
