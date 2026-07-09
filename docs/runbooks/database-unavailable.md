# Database Unavailable Runbook

**Severity:** P1 (Critical)  
**Response Time:** 15 minutes  
**Owner:** Primary On-Call / Maintainer — TODO: fill name

---

## Detection Signals

Watch for these indicators that the database has become unavailable:

1. **ALB target health degraded**
   - Backend tasks showing as "unhealthy" in the ALB target group
   - Health check failing on `/api/ready` endpoint
   - ECS tasks showing restart loops

2. **CloudWatch Logs**
   - Errors in `/ecs/open-prompt-manager/backend` logs:
     ```
     sqlalchemy.exc.OperationalError: (psycopg2.OperationalError)
     could not connect to server: Connection timed out / refused
     FATAL: remaining connection slots are reserved
     ```

3. **RDS Metrics**
   - RDS instance status = `Failed`, `Incompatible parameters`, or `Backing up`
   - Network connectivity loss
   - Storage full

4. **User-Facing Symptoms**
   - Login fails: `POST /auth/login` returns 503
   - API endpoints return 503 Service Unavailable
   - Dashboard and prompt list pages fail to load

---

## Triage Steps

### Step 1: Establish AWS CLI Context

```bash
export AWS_REGION="ap-southeast-2"           # or your region
export PROJECT_NAME="open-prompt-manager"
export ENVIRONMENT="prod"
export CLUSTER_NAME="${PROJECT_NAME}-cluster"
export ALB_TARGET_GROUP="arn:aws:elasticloadbalancing:${AWS_REGION}:ACCOUNT_ID:targetgroup/${PROJECT_NAME}-backend-tg/*"
```

### Step 2: Check RDS Status

```bash
# Get RDS instance details
aws rds describe-db-instances \
  --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Engine:Engine,State:PendingModifiedValues}'

# If status is "available", the instance is healthy. Otherwise, check:
# - "failed" — Storage full or compute failure
# - "backing-up" — Backup in progress (temporary, wait 5-10 min)
# - "incompatible-parameters" — Parameter group mismatch (needs immediate intervention)

# Check RDS events for recent problems
aws rds describe-events \
  --source-identifier "${PROJECT_NAME}-${ENVIRONMENT}" \
  --source-type db-instance \
  --max-records 20 \
  --region "${AWS_REGION}" \
  --query 'Events[*].[Timestamp,Message]'
```

### Step 3: Verify Network Connectivity

```bash
# Ensure RDS security group allows backend ECS traffic on port 5432
BACKEND_SG=$(aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=${PROJECT_NAME}-backend-sg" \
  --region "${AWS_REGION}" \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

RDS_SG=$(aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=${PROJECT_NAME}-rds-sg" \
  --region "${AWS_REGION}" \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Check RDS security group rules
aws ec2 describe-security-groups \
  --group-ids "${RDS_SG}" \
  --region "${AWS_REGION}" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`5432`]' \
  --output table

# Look for an inbound rule allowing traffic from ${BACKEND_SG} on port 5432
```

### Step 4: Check RDS Metrics

```bash
# High CPU (>80%)
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value="${PROJECT_NAME}-${ENVIRONMENT}" \
  --start-time $(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average \
  --region "${AWS_REGION}"

# Storage used
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name FreeStorageSpace \
  --dimensions Name=DBInstanceIdentifier,Value="${PROJECT_NAME}-${ENVIRONMENT}" \
  --start-time $(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average \
  --region "${AWS_REGION}"

# Database connections
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value="${PROJECT_NAME}-${ENVIRONMENT}" \
  --start-time $(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average \
  --region "${AWS_REGION}"
```

### Step 5: Check Backend Task Health

```bash
# Describe the backend service
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].{RunningCount:runningCount,DesiredCount:desiredCount,Status:status,Failures:failures}'

# List backend tasks
aws ecs list-tasks \
  --cluster "${CLUSTER_NAME}" \
  --service-name "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --output text

# Inspect a failing task (get task ARN from above)
aws ecs describe-tasks \
  --cluster "${CLUSTER_NAME}" \
  --tasks <TASK_ARN> \
  --region "${AWS_REGION}" \
  --query 'tasks[0].{LastStatus:lastStatus,StoppedReason:stoppedReason,Containers:containers[0].{ExitCode:exitCode,Reason:reason}}'
```

### Step 6: Check Recent Backend Logs

```bash
# View last 100 lines of backend logs
aws logs tail "/ecs/${PROJECT_NAME}/backend" \
  --max-items 100 \
  --region "${AWS_REGION}"

# Search for database connection errors in the last hour
aws logs filter-log-events \
  --log-group-name "/ecs/${PROJECT_NAME}/backend" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "connection refused OR OperationalError OR 5432" \
  --region "${AWS_REGION}" \
  --query 'events[*].[timestamp,message]'
```

---

## Mitigation

### If RDS is healthy but backend tasks keep crashing:

**Most likely cause:** Secrets Manager DATABASE_URL is corrupted or stale.

```bash
# Verify the secret exists and is accessible
aws secretsmanager get-secret-value \
  --secret-id "${PROJECT_NAME}/${ENVIRONMENT}/database-url" \
  --region "${AWS_REGION}" \
  --query SecretString

# If the URL is malformed or points to the wrong host, update it
# (WARNING: Only do this if you understand the current RDS endpoint)
aws rds describe-db-instances \
  --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].{Endpoint:Endpoint.Address,Port:Endpoint.Port}'

# Then manually construct and update the secret:
aws secretsmanager update-secret \
  --secret-id "${PROJECT_NAME}/${ENVIRONMENT}/database-url" \
  --secret-string "postgresql://postgres:PASSWORD@ENDPOINT:5432/opm" \
  --region "${AWS_REGION}"

# Force a fresh backend task deployment (see deploy-rollback.md)
```

### If RDS storage is full:

**Emergency step (temporary relief):**
```bash
# Modify the RDS instance to increase allocated storage
# WARNING: This triggers a maintenance window and may cause brief downtime
aws rds modify-db-instance \
  --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}" \
  --allocated-storage 200 \
  --apply-immediately \
  --region "${AWS_REGION}"

# Then identify and clean up old data
# See mitigation section for long-term fix
```

### If RDS CPU is critically high (>90%):

```bash
# Check for slow queries or locks
# Connect to the database directly (if you have access) and run:
# SELECT * FROM pg_stat_activity WHERE state != 'idle';
# SELECT * FROM pg_locks;

# Alternative: Restart the RDS instance (will cause ~30s downtime)
aws rds reboot-db-instance \
  --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}" \
  --region "${AWS_REGION}"
```

### If RDS is in "incompatible-parameters" state:

```bash
# This means the parameter group is out of sync with the engine version
# Check the actual parameter group
aws rds describe-db-instances \
  --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].DBParameterGroups'

# If the status is "incompatible", you may need to reboot or apply pending changes
aws rds modify-db-instance \
  --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}" \
  --apply-immediately \
  --region "${AWS_REGION}"
```

---

## Rollback

If the database issue is caused by a recent infrastructure change:

1. **Check Terraform plan logs** (stored in `terraform/.terraform.plans/`)
2. **Identify the problematic resource** (e.g., security group rule change)
3. **Revert the Terraform change** or apply a fix

```bash
# Do NOT manually delete or modify RDS; use Terraform
# Reverting infrastructure changes:
cd terraform
git revert <COMMIT_SHA>
terraform plan -out=rollback.tfplan
terraform apply rollback.tfplan
```

If the database itself is corrupted or unrecoverable:

1. **Restore from the latest backup**
   ```bash
   # List available backups
   aws rds describe-db-snapshots \
     --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}" \
     --region "${AWS_REGION}" \
     --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]'
   
   # Restore to a new instance
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}-restored" \
     --db-snapshot-identifier <SNAPSHOT_ID> \
     --region "${AWS_REGION}"
   
   # Update Terraform state to use the new instance
   # See deploy-rollback.md for full deployment procedure
   ```

---

## Escalation Path

1. **Immediate (0-5 min):** Try triage steps 1-4 above
2. **At 5 minutes:** If the cause is unclear, escalate to **Database Administrator**
3. **At 10 minutes:** If no resolution, escalate to **AWS Support** (open a case) and notify **Incident Commander**
4. **At 15 minutes:** If the database is completely lost and backups are corrupted, declare a **P1 incident** and activate the full incident response team

---

## Owner

**Primary On-Call / Maintainer:** — TODO: fill name  
**Backup / Secondary:** — TODO: fill name  
**Database Administrator:** — TODO: fill name  
**Incident Commander:** — TODO: fill name

---

## Related Documentation

- [RDS Failover Runbook](./rds-failover.md) — if failover is needed
- [Deploy & Rollback Runbook](./deploy-rollback.md) — to redeploy fresh backend tasks
- [README.md](./README.md) — severity definitions and quick reference
- AWS RDS Troubleshooting: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Troubleshooting.html

---

## Lessons Learned (Post-Incident)

After this runbook is exercised, document:
- **What triggered the incident?**
- **What steps were most useful?**
- **What steps were unclear or slow?**
- **Should we automate any triage steps?**
- **Should we add new alarms or metrics?**

Update this runbook and notify the team of changes.
