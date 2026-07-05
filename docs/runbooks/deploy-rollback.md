# Deploy & Rollback Runbook

**Severity:** P1 (Critical)  
**Response Time:** 15 minutes  
**Owner:** Platform Engineer / DevOps — TODO: fill name

---

## Overview

Open Prompt Manager uses a **tag-based deployment model**:
- Push a git tag matching `v*.*.*` (e.g., `v1.2.3`)
- GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically:
  1. Builds backend and frontend Docker images
  2. Pushes images to ECR with tag `v1.2.3` (and `latest`)
  3. Runs `terraform apply` with those image URIs
  4. ECS pulls the new images and rolls out fresh tasks

**To rollback:** Simply redeploy the previous tag, which will roll out the previous images.

---

## Detection Signals

Watch for these indicators that a deployment has introduced a bug:

1. **Immediate post-deployment issues**
   - ALB target group showing backend as "unhealthy"
   - High error rate on all endpoints (5xx errors)
   - Backend tasks in restart loop

2. **Application errors**
   - Feature that worked before no longer works
   - New error messages or exceptions in logs
   - Authentication broken, API returning 500s

3. **Metrics & Logs**
   - Error logs in `/ecs/open-prompt-manager/backend` indicating a code-level issue (not infrastructure)
   - High latency or memory usage after deploy
   - Database migration failed (if migrations were part of the deploy)

4. **User reports**
   - "Feature X stopped working after the deploy"
   - "I'm getting 500 errors"

---

## Triage Steps

### Step 1: Establish AWS CLI Context

```bash
export AWS_REGION="ap-southeast-2"           # or your region
export PROJECT_NAME="open-prompt-manager"
export ENVIRONMENT="prod"
export CLUSTER_NAME="${PROJECT_NAME}-cluster"
```

### Step 2: Identify the Current Deployment

```bash
# Get the currently running backend image URI
aws ecs describe-task-definition \
  --task-definition "${PROJECT_NAME}-backend:1" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition.containerDefinitions[0].image'

# Example output: 123456789.dkr.ecr.ap-southeast-2.amazonaws.com/open-prompt-manager-backend:v1.2.3

# Extract the tag (e.g., v1.2.3)
CURRENT_TAG="v1.2.3"
echo "Currently deployed: ${CURRENT_TAG}"
```

### Step 3: Check Deployment Status

```bash
# View the backend service
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].{RunningCount:runningCount,DesiredCount:desiredCount,Status:status,Failures:failures}' \
  --output table

# If runningCount < desiredCount, tasks are still rolling out or crashing
# Wait 3-5 minutes for tasks to stabilize before deciding to rollback

# View recent task events
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].events[:10]' \
  --output text
```

### Step 4: Check Recent Logs

```bash
# Tail backend logs for errors
aws logs tail "/ecs/${PROJECT_NAME}/backend" \
  --follow \
  --max-items 50 \
  --region "${AWS_REGION}"

# Search for panic/exception messages
aws logs filter-log-events \
  --log-group-name "/ecs/${PROJECT_NAME}/backend" \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --filter-pattern "ERROR OR Exception OR CRITICAL" \
  --region "${AWS_REGION}" \
  --query 'events[*].[timestamp,message]' \
  --output text
```

### Step 5: Identify the Previous Working Tag

```bash
# List recent release tags on the repo
git tag --list 'v*' --sort=-version:refname | head -5

# Or use GitHub API (if you have the gh CLI)
gh release list --limit 5

# Example: If v1.2.3 is broken, the previous version is likely v1.2.2
PREVIOUS_TAG="v1.2.2"
echo "Previous tag: ${PREVIOUS_TAG}"
```

---

## Mitigation: Fast Rollback (< 5 minutes)

### Option A: Redeploy the Previous Tag (Recommended)

This is the fastest, safest rollback method. It reuses the previously-built images from ECR.

```bash
# 1. Identify the previous tag (from Step 5 above)
PREVIOUS_TAG="v1.2.2"

# 2. Push the tag to GitHub to trigger the deploy workflow
git tag ${PREVIOUS_TAG} $(git rev-parse ${PREVIOUS_TAG}^{commit})
git push origin ${PREVIOUS_TAG}

# 3. Monitor the GitHub Actions workflow
#    Open: https://github.com/ale-sanchez-g/open-prompt-manager/actions
#    Wait for the deploy job to complete (5-10 minutes)

# 4. Verify the rollback in AWS
aws ecs describe-task-definition \
  --task-definition "${PROJECT_NAME}-backend:1" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition.containerDefinitions[0].image'

# Should now show the ${PREVIOUS_TAG} image
```

### Option B: Manual Terraform Rollback (If Tags Disabled)

If the GitHub Actions workflow is unavailable:

```bash
# 1. Manually update backend and frontend images in terraform variables
cd terraform

# Get the previous image URIs from ECR
BACKEND_ECR="123456789.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}-backend"
FRONTEND_ECR="123456789.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}-frontend"
PREVIOUS_TAG="v1.2.2"

BACKEND_IMAGE="${BACKEND_ECR}:${PREVIOUS_TAG}"
FRONTEND_IMAGE="${FRONTEND_ECR}:${PREVIOUS_TAG}"

# 2. Verify the previous images exist in ECR
aws ecr list-images \
  --repository-name "${PROJECT_NAME}-backend" \
  --region "${AWS_REGION}" \
  --query 'imageIds[?imageTag==`'${PREVIOUS_TAG}'`]'

# 3. Apply Terraform with the previous images
terraform plan -out=rollback.tfplan \
  -var="aws_region=${AWS_REGION}" \
  -var="project_name=${PROJECT_NAME}" \
  -var="environment=${ENVIRONMENT}" \
  -var="backend_image=${BACKEND_IMAGE}" \
  -var="frontend_image=${FRONTEND_IMAGE}"

terraform apply rollback.tfplan

# 4. Monitor the rollback
aws logs tail "/ecs/${PROJECT_NAME}/backend" --follow --region "${AWS_REGION}"
```

### Option C: Quick Task Restart (If Issue is Transient)

If the deployment is healthy but a task needs a restart:

```bash
# Update the service to force a deployment restart (restarts all tasks)
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --force-new-deployment \
  --region "${AWS_REGION}"

# Monitor the rollout
aws logs tail "/ecs/${PROJECT_NAME}/backend" --follow --region "${AWS_REGION}"
```

---

## Full Rollback (Comprehensive Steps)

If the fast rollback doesn't work, perform a full manual rollback:

### Step 1: Stop the Broken Deployment

```bash
# Scale down the backend service to 0 tasks (stops all running tasks)
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --desired-count 0 \
  --region "${AWS_REGION}"

# Wait for tasks to stop (30-60 seconds)
sleep 30

# Verify
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].runningCount'
```

### Step 2: Revert the Task Definition

```bash
# List recent task definitions
aws ecs list-task-definitions \
  --family-prefix "${PROJECT_NAME}-backend" \
  --sort DESC \
  --region "${AWS_REGION}" \
  --query 'taskDefinitionArns[:5]'

# Get the second-most-recent revision (the one before the broken deploy)
PREVIOUS_TASK_DEF=$(aws ecs list-task-definitions \
  --family-prefix "${PROJECT_NAME}-backend" \
  --sort DESC \
  --region "${AWS_REGION}" \
  --query 'taskDefinitionArns[1]' \
  --output text)

echo "Previous task definition: ${PREVIOUS_TASK_DEF}"

# Update the service to use the previous task definition
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --task-definition "${PREVIOUS_TASK_DEF}" \
  --desired-count 2 \
  --region "${AWS_REGION}"

# Wait for new tasks to start
sleep 30
aws logs tail "/ecs/${PROJECT_NAME}/backend" --follow --region "${AWS_REGION}"
```

### Step 3: Verify Rollback

```bash
# Check that new tasks are healthy
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].{RunningCount:runningCount,DesiredCount:desiredCount}'

# Verify ALB target group health
aws elbv2 describe-target-health \
  --target-group-arn "arn:aws:elasticloadbalancing:${AWS_REGION}:ACCOUNT_ID:targetgroup/${PROJECT_NAME}-backend-tg/*" \
  --region "${AWS_REGION}" \
  --query 'TargetHealthDescriptions[*].[Target.Id,TargetHealth.State]' \
  --output table

# Test the application
curl https://<your-domain>/api/health
# Should return: {"status":"ok","version":"<version>"}
```

---

## Long-Term Mitigation

1. **Add pre-deployment tests**
   - Run smoke tests on new images before pushing tags
   - Add health check validations to the GitHub Actions workflow

2. **Implement canary deployments**
   - Deploy to a canary service first
   - Monitor metrics for 5 minutes
   - Promote to production if healthy

3. **Improve observability**
   - Add more detailed metrics and custom alarms
   - Set up distributed tracing (e.g., AWS X-Ray)
   - Create dashboards for deployment status

4. **Runbook updates**
   - Document what went wrong with this deploy
   - Update this runbook with new signals or faster triage steps

---

## Prevention

To avoid deployments with bugs:

1. **Code review** — All changes merged to `main` before tagging
2. **Automated tests** — Run all tests in CI before pushing Docker images
3. **Staging environment** — Deploy to staging first, then promote to production
4. **Blue-green deployments** — Keep old tasks running, switch traffic to new tasks, monitor 5 minutes, then stop old tasks

---

## Escalation Path

1. **0-3 min:** Attempt the fast rollback (Option A or B above)
2. **3-10 min:** If fast rollback doesn't work, perform full rollback (comprehensive steps)
3. **10+ min:** If rollback fails or the app is still broken, escalate to **Incident Commander** and declare P1
4. **15+ min:** If no resolution, activate the full incident response team and investigate the root cause

---

## Owner

**Platform Engineer / DevOps:** — TODO: fill name  
**Backend Engineer (code issues):** — TODO: fill name  
**Incident Commander:** — TODO: fill name

---

## Related Documentation

- [GitHub Actions Deploy Workflow](../../.github/workflows/deploy.yml) — automation details
- [Terraform Configuration](../../terraform/) — infrastructure as code
- [Deploy Script](../../deploy.sh) — manual deployment process
- [README.md#AWS-Terraform-Deployment](../../README.md#AWS-Terraform-Deployment) — deployment guide
- [Postmortem Template](./postmortem-template.md) — post-incident review

---

## Testing This Runbook

Before an incident:

1. **Tag exercise:** Create a test tag (e.g., `v0.0.0-test`) and practice redeploying
2. **Metrics:** Verify that you can pull the current image URI and identify the task definition
3. **Logs:** Confirm you can tail and search backend logs quickly
4. **Rollback time:** Measure how long Option A takes end-to-end; target < 10 minutes total

---

## Lessons Learned (Post-Incident)

After this runbook is exercised, document:
- **What triggered the bad deploy?**
- **How long did rollback take?**
- **What could have prevented the issue?**
- **Should we add automated tests or checks?**
- **Should we update the deployment workflow?**

Update this runbook and notify the team of changes.
