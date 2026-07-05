# RDS Failover Runbook

**Severity:** P1 (Critical) or P2 (High)  
**Response Time:** 15-30 minutes (depends on failover type)  
**Owner:** Database Administrator / Maintainer — TODO: fill name

---

## Overview

RDS Multi-AZ failover occurs when:
1. **Automatic failover** — AWS detects primary failure and promotes standby replica
2. **Manual failover** — DBA initiates a failover for maintenance or troubleshooting
3. **Complete failure** — Both primary and standby are down (rare; requires backup restore)

This runbook helps you monitor, understand, and recover from failover events.

---

## Detection Signals

### Automatic Failover in Progress

1. **RDS Status**
   ```
   DBInstanceStatus: "failing-over"
   DBInstanceStatus: "rebooting" (after failover)
   ```

2. **CloudWatch Metrics**
   - Brief spike in database connections (existing clients reconnecting)
   - Brief spike in queries per second
   - Short period of 5xx errors on the backend (5-30 seconds)

3. **CloudWatch Events**
   - Event: "RDS DB instance has failed over to its standby instance"
   - Event: "RDS DB instance status is now 'rebooting'"

4. **Application Logs**
   - Backend logs show brief database connection errors:
     ```
     sqlalchemy.exc.OperationalError: connection lost during query
     ```
   - Followed by recovery as new connections are established

5. **User Reports**
   - "The app was slow for a few seconds"
   - "I got an error but it went away"

### Manual Failover

Same signals, but initiated by a database administrator (planned downtime).

### Complete Failure

- RDS instance status = "failed" or "incompatible-parameters"
- No automatic recovery to standby
- Requires manual restore from backup

---

## Triage Steps

### Step 1: Establish AWS CLI Context

```bash
export AWS_REGION="ap-southeast-2"           # or your region
export PROJECT_NAME="open-prompt-manager"
export ENVIRONMENT="prod"
export DB_INSTANCE="${PROJECT_NAME}-${ENVIRONMENT}"
```

### Step 2: Check RDS Status

```bash
# Get detailed RDS instance information
aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].[DBInstanceStatus,MultiAZ,AvailabilityZone,Engine,EngineVersion]' \
  --output text

# Interpretation:
# - "available" — instance is healthy
# - "rebooting" — failover or maintenance in progress (5-10 minutes)
# - "failing-over" — automatic failover in progress (1-2 minutes)
# - "failed" — instance is down; requires manual intervention
# - "backing-up" — backup in progress; normal operation continues
# - "storage-full" — storage limit reached; requires expansion

# Check Multi-AZ status
aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].MultiAZ'

# Should return "true" for production deployments
```

### Step 3: Check Standby Instance

```bash
# Get standby instance details
aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].[DBInstanceStatus,AvailabilityZone,SecondaryAvailabilityZone,LatestRestorableTime]' \
  --output text

# Look for:
# - AvailabilityZone: primary AZ (e.g., ap-southeast-2a)
# - SecondaryAvailabilityZone: standby AZ (e.g., ap-southeast-2b)
```

### Step 4: Check RDS Events

```bash
# Get recent RDS events to see if failover occurred
aws rds describe-events \
  --source-identifier "${DB_INSTANCE}" \
  --source-type db-instance \
  --max-records 30 \
  --region "${AWS_REGION}" \
  --query 'Events[*].[Timestamp,Message,SourceType]' \
  --output text | head -20

# Look for messages like:
# - "DB instance has failed over to its standby instance"
# - "DB instance automatic failover is starting"
# - "DB instance status is now 'available'"
```

### Step 5: Check Backend Recovery

```bash
# Monitor backend task restarts (tasks may have reconnected after failover)
aws ecs describe-services \
  --cluster "${PROJECT_NAME}-cluster" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].{RunningCount:runningCount,DesiredCount:desiredCount}' \
  --output text

# Check backend logs for any connection errors during failover
aws logs filter-log-events \
  --log-group-name "/ecs/${PROJECT_NAME}/backend" \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --filter-pattern "OperationalError OR connection refused OR reconnect" \
  --region "${AWS_REGION}" \
  --query 'events[*].[timestamp,message]' \
  --output text | head -20
```

### Step 6: Verify Database Connectivity

```bash
# If you have direct access to the database (from an EC2 instance or bastion):
psql -h <RDS_ENDPOINT> -U postgres -d opm -c "SELECT 1;"

# Or use the AWS CLI to check health
curl https://<your-domain>/api/ready
# Should return: {"status":"ok","version":"..."}
```

### Step 7: Check Replication Lag (if applicable)

```bash
# If you have a read replica, check replication lag
aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].ReplicationLag' \
  --output text

# Should be 0 or very small (< 1 second) after failover
```

---

## Mitigation

### Scenario A: Failover Completed Successfully

**No action needed.** The failover has completed and the application is recovered.

**Post-failover checklist:**

```bash
# 1. Verify application is responsive
curl https://<your-domain>/api/health

# 2. Check that backend tasks are all healthy
aws elbv2 describe-target-health \
  --target-group-arn "arn:aws:elasticloadbalancing:${AWS_REGION}:ACCOUNT_ID:targetgroup/${PROJECT_NAME}-backend-tg/*" \
  --region "${AWS_REGION}" \
  --query 'TargetHealthDescriptions[*].[Target.Id,TargetHealth.State]' \
  --output table

# 3. Monitor metrics for 15 minutes to ensure stability
# - Check CloudWatch CPU, memory, connections for RDS
# - Check ALB 5xx error rate
# - Check backend error logs

# 4. Document the failover in the incident log
```

### Scenario B: Failover in Progress (status = "failing-over" or "rebooting")

**Expected behavior:** Failover typically takes 1-5 minutes.

**Recovery steps:**

```bash
# 1. Wait 3-5 minutes for failover to complete
# Do NOT attempt to force anything; AWS is handling the failover

# 2. Monitor logs during failover
aws logs tail "/ecs/${PROJECT_NAME}/backend" --follow --region "${AWS_REGION}"

# 3. Backend tasks may experience brief errors during failover
# These should be transient and resolve when the database comes back

# 4. If failover doesn't complete within 10 minutes, escalate
if [[ $(date +%s) -gt $((FAILOVER_START_TIME + 600)) ]]; then
  echo "Failover has taken > 10 minutes. Escalating to AWS Support..."
fi

# 5. Once status returns to "available", proceed with post-failover checklist
```

### Scenario C: Failover Failed (status remains "failed")

**Likely causes:**
- Both primary and standby failed simultaneously
- Standby instance is corrupted
- Infrastructure issue in the Availability Zone

**Recovery steps:**

```bash
# 1. Escalate immediately to AWS Support
# Open a critical support case: "RDS instance ${DB_INSTANCE} is in 'failed' state"

# 2. While waiting for support, prepare to restore from backup
# List available automated backups
aws rds describe-db-snapshots \
  --db-instance-identifier "${DB_INSTANCE}" \
  --snapshot-type automated \
  --region "${AWS_REGION}" \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table

# 3. If a recent backup exists, prepare to restore
BACKUP_ID=$(aws rds describe-db-snapshots \
  --db-instance-identifier "${DB_INSTANCE}" \
  --snapshot-type automated \
  --region "${AWS_REGION}" \
  --query 'DBSnapshots[0].DBSnapshotIdentifier' \
  --output text)

# 4. Create a new instance from the backup (do NOT overwrite the failed instance)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "${DB_INSTANCE}-restored-$(date +%s)" \
  --db-snapshot-identifier "${BACKUP_ID}" \
  --region "${AWS_REGION}"

# 5. Update Secrets Manager with the new endpoint
NEW_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE}-restored-..." \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

aws secretsmanager update-secret \
  --secret-id "${PROJECT_NAME}/${ENVIRONMENT}/database-url" \
  --secret-string "postgresql://postgres:PASSWORD@${NEW_ENDPOINT}:5432/opm" \
  --region "${AWS_REGION}"

# 6. Force backend service to redeploy and pick up the new database URL
aws ecs update-service \
  --cluster "${PROJECT_NAME}-cluster" \
  --service "${PROJECT_NAME}-backend-service" \
  --force-new-deployment \
  --region "${AWS_REGION}"

# 7. Monitor recovery
aws logs tail "/ecs/${PROJECT_NAME}/backend" --follow --region "${AWS_REGION}"
```

### Scenario D: Failover Caused Data Loss or Corruption

**If you suspect data loss:**

```bash
# 1. Check RDS event logs for clues
aws rds describe-events \
  --source-identifier "${DB_INSTANCE}" \
  --max-records 50 \
  --region "${AWS_REGION}" \
  --query 'Events[*].[Timestamp,Message]'

# 2. Check application logs for missing data
# - Query recent API responses for data anomalies
# - Check for any error messages indicating data issues

# 3. If data loss is confirmed, restore from backup
# See Scenario C above for restore procedure

# 4. Declare a P1 incident and activate the full incident response team
```

---

## Prevention & Preparation

### Enable Multi-AZ (Already Done)

```bash
# Verify Multi-AZ is enabled
aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].MultiAZ'

# Should return "true"

# If false, enable it (requires brief downtime)
aws rds modify-db-instance \
  --db-instance-identifier "${DB_INSTANCE}" \
  --multi-az \
  --apply-immediately \
  --region "${AWS_REGION}"
```

### Test Automated Backups

```bash
# Verify backup retention is configured
aws rds describe-db-instances \
  --db-instance-identifier "${DB_INSTANCE}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].[BackupRetentionPeriod,LatestRestorableTime]' \
  --output text

# Should show a retention period of at least 7 days

# Test restore procedure quarterly
# See Scenario C for restore steps
```

### Monitor Replication Lag

```bash
# For read replicas (if any), monitor replication lag
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name AuroraBinlogReplicaLag \
  --dimensions Name=DBInstanceIdentifier,Value="${DB_INSTANCE}" \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum \
  --region "${AWS_REGION}"
```

---

## Rollback

If a manual failover was triggered and causes problems:

```bash
# 1. Initiate a second failover to return to the original primary
# WARNING: This causes another 1-5 minutes of downtime

aws rds reboot-db-instance \
  --db-instance-identifier "${DB_INSTANCE}" \
  --force-failover \
  --region "${AWS_REGION}"

# 2. Monitor the failback
aws logs tail "/ecs/${PROJECT_NAME}/backend" --follow --region "${AWS_REGION}"

# 3. Once status returns to "available", verify application health
curl https://<your-domain>/api/health
```

---

## Escalation Path

1. **0-5 min:** Check RDS status and events
2. **5-15 min:** If failover is in progress, monitor and wait
3. **15+ min:** If failover doesn't complete or status is "failed", escalate to **AWS Support** and **Database Administrator**
4. **30+ min:** If data loss is suspected, declare P1 and activate the full incident response team

---

## Owner

**Database Administrator / Maintainer:** — TODO: fill name  
**Platform Engineer:** — TODO: fill name  
**Incident Commander:** — TODO: fill name

---

## Related Documentation

- [Database Unavailable Runbook](./database-unavailable.md) — general database troubleshooting
- [README.md#Database-schema-upgrades](../../README.md#Database-schema-upgrades) — migration procedures
- [Postmortem Template](./postmortem-template.md) — post-incident review
- AWS RDS Multi-AZ: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html
- AWS RDS Failover: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RDS_Monitoring.html

---

## Testing This Runbook

Before an incident:

1. **Test manual failover:** In a staging environment, initiate a manual failover and measure downtime
2. **Test backup restore:** Restore from a backup to a test instance and verify data integrity
3. **Monitor metrics:** Verify that CloudWatch metrics capture failover events
4. **Review events:** Check that RDS events are logged and discoverable

---

## Lessons Learned (Post-Incident)

After this runbook is exercised, document:
- **What triggered the failover?**
- **How long did failover take?**
- **Was data integrity preserved?**
- **How did the application respond?**
- **Should we improve monitoring or alerting?**
- **Should we schedule regular failover drills?**

Update this runbook and notify the team of changes.
