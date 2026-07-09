# Auth Outage & Credential Stuffing Runbook

**Severity:** P1 (Critical)  
**Response Time:** 15 minutes  
**Owner:** Security Lead / Platform Team — TODO: fill name

---

## Overview

This runbook covers two scenarios:

1. **Auth Service Outage** — `/auth/*` endpoints returning 500 or 503; users cannot login
2. **Credential Stuffing / Brute Force Attack** — Rapid-fire failed login attempts; rate-limit alerts firing

Both require quick triage and mitigation to restore service and prevent data loss.

---

## Detection Signals

### Auth Service Outage

1. **ALB errors**
   - POST `/auth/login` returns 500 or 503
   - POST `/auth/register` returns 500
   - POST `/auth/refresh` returns 500

2. **CloudWatch Logs**
   - Backend logs in `/ecs/open-prompt-manager/backend` show:
     ```
     sqlalchemy.exc.OperationalError: could not connect to server
     KeyError: JWT_SECRET
     JWTError: Token validation failed
     ```

3. **Monitoring**
   - CloudWatch alarm: "Auth request error rate > 10%" (planned, see issue #331)
   - ALB target group shows backend unhealthy

### Credential Stuffing / Brute Force

1. **Rate Limit Metrics**
   - Rapid spike in 429 (Too Many Requests) responses
   - Custom metric: `AuthBruteForceAttempts` rising sharply
   - CloudWatch alarm: "Auth requests > 1000/min per IP" (planned, see issue #331)

2. **User Reports**
   - "I can't login"
   - "I'm getting rate-limited"
   - Multiple users from different locations reporting simultaneous failures

3. **CloudWatch Logs**
   - Pattern: Many failed logins from the same IP or different IPs
     ```
     POST /auth/login - 401 (invalid credentials)
     POST /auth/login - 429 (rate limit exceeded)
     ```

4. **WAF Metrics (if enabled)**
   - Spike in requests matching "suspicious login patterns"

---

## Triage Steps

### Step 1: Establish AWS CLI Context

```bash
export AWS_REGION="ap-southeast-2"           # or your region
export PROJECT_NAME="open-prompt-manager"
export ENVIRONMENT="prod"
export CLUSTER_NAME="${PROJECT_NAME}-cluster"
```

### Step 2: Verify Auth Service is Running

```bash
# Check backend service status
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].{RunningCount:runningCount,DesiredCount:desiredCount,Status:status}'

# If runningCount < desiredCount, tasks are crashing
# Check task definition for JWT_SECRET injection
aws ecs describe-task-definition \
  --task-definition "${PROJECT_NAME}-backend:1" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition.containerDefinitions[0].secrets'

# Should include JWT_SECRET from Secrets Manager
```

### Step 3: Check JWT_SECRET in Secrets Manager

```bash
# Verify the secret exists and is accessible
aws secretsmanager get-secret-value \
  --secret-id "${PROJECT_NAME}/${ENVIRONMENT}/jwt-secret" \
  --region "${AWS_REGION}" \
  --query SecretString

# If empty or malformed, this is the auth outage cause
# Verify the ECS task execution role has permission to read it
aws iam get-role-policy \
  --role-name "${PROJECT_NAME}-ecs-task-execution-role" \
  --policy-name "read-secrets" \
  --region "${AWS_REGION}"
```

### Step 4: Monitor Auth Request Logs

```bash
# Tail backend logs for auth errors
aws logs tail "/ecs/${PROJECT_NAME}/backend" \
  --log-stream-names "backend/ecs/backend" \
  --follow \
  --region "${AWS_REGION}" \
  --filter-pattern "login OR register OR auth OR JWT"

# Count failed login attempts by IP (if logs include client IP)
aws logs filter-log-events \
  --log-group-name "/ecs/${PROJECT_NAME}/backend" \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --filter-pattern "401 OR 429 OR rate.limit" \
  --region "${AWS_REGION}" \
  --query 'events[*].message' \
  | grep -oE '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' \
  | sort | uniq -c | sort -rn
```

### Step 5: Check Rate Limiting Configuration

```bash
# Verify rate limiting is enabled and configured correctly
aws ecs describe-task-definition \
  --task-definition "${PROJECT_NAME}-backend:1" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition.containerDefinitions[0].environment[?name==`RATE_LIMIT_ENABLED`]'

# Check rate limit values
aws ecs describe-task-definition \
  --task-definition "${PROJECT_NAME}-backend:1" \
  --region "${AWS_REGION}" \
  --query 'taskDefinition.containerDefinitions[0].environment[] | [?contains(name, `RATE_LIMIT`)]'

# Default values:
# - RATE_LIMIT_ENABLED: true
# - RATE_LIMIT_PER_MINUTE: 200 (API requests)
# - RATE_LIMIT_AUTH_PER_MINUTE: 60 (auth requests)
```

### Step 6: Identify Source of Attack (if applicable)

```bash
# Get the ALB access logs from S3
ALB_LOG_BUCKET="${PROJECT_NAME}-alb-logs"

# List recent log files
aws s3 ls "s3://${ALB_LOG_BUCKET}/${PROJECT_NAME}/" \
  --recursive \
  --human-readable \
  --summarize | tail -20

# Download and search recent logs for POST /auth/login
aws s3 cp "s3://${ALB_LOG_BUCKET}/${PROJECT_NAME}/2024/07/05/..." . \
  --recursive

# Extract client IPs from logs
grep "POST.*auth.*login" *.log | awk '{print $3}' | sort | uniq -c | sort -rn | head -20
```

---

## Mitigation

### For Auth Service Outage

#### 1. Restart Backend Tasks (Transient Fix)

```bash
# Force a new deployment (restarts all tasks)
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --force-new-deployment \
  --region "${AWS_REGION}"

# Monitor logs
aws logs tail "/ecs/${PROJECT_NAME}/backend" --follow --region "${AWS_REGION}"

# Test auth endpoint
curl -X POST https://<your-domain>/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# Should return either 401 (invalid credentials) or a valid JWT
```

#### 2. Restore JWT_SECRET (if corrupted)

```bash
# Check if the secret is scheduled for deletion
aws secretsmanager describe-secret \
  --secret-id "${PROJECT_NAME}/${ENVIRONMENT}/jwt-secret" \
  --region "${AWS_REGION}" \
  --query '{Status:DeletedDate,ARN:ARN}'

# If it is, cancel the deletion
aws secretsmanager restore-secret \
  --secret-id "${PROJECT_NAME}/${ENVIRONMENT}/jwt-secret" \
  --region "${AWS_REGION}"

# If the secret is malformed, regenerate it
# WARNING: This will invalidate all existing refresh tokens
openssl rand -hex 32 > /tmp/new_jwt_secret.txt
NEW_SECRET=$(cat /tmp/new_jwt_secret.txt)

aws secretsmanager update-secret \
  --secret-id "${PROJECT_NAME}/${ENVIRONMENT}/jwt-secret" \
  --secret-string "${NEW_SECRET}" \
  --region "${AWS_REGION}"

# Force task restart to pick up new secret
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --force-new-deployment \
  --region "${AWS_REGION}"

# Notify users: All existing sessions will be invalidated; they need to login again
```

#### 3. Check Database (if auth queries are failing)

```bash
# See database-unavailable.md for full database diagnostics
aws rds describe-db-instances \
  --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}" \
  --region "${AWS_REGION}" \
  --query 'DBInstances[0].DBInstanceStatus'
```

### For Credential Stuffing / Brute Force Attack

#### 1. Identify and Block Attacking IPs

```bash
# Extract top attacking IPs from ALB logs (from Step 6 above)
ATTACKING_IPS=(
  "203.0.113.1"
  "192.0.2.5"
  "198.51.100.9"
)

# Option A: Temporarily increase rate limit strictness
# (requires task redeploy; see below for code)

# Option B: Block IPs at the ALB security group level (immediate)
ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=${PROJECT_NAME}-alb-sg" \
  --region "${AWS_REGION}" \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Create a temporary deny rule for each attacking IP
for IP in "${ATTACKING_IPS[@]}"; do
  aws ec2 revoke-security-group-ingress \
    --group-id "${ALB_SG}" \
    --cidr "${IP}/32" \
    --protocol tcp \
    --port 443 \
    --region "${AWS_REGION}" 2>/dev/null || true

  aws ec2 revoke-security-group-ingress \
    --group-id "${ALB_SG}" \
    --cidr "${IP}/32" \
    --protocol tcp \
    --port 80 \
    --region "${AWS_REGION}" 2>/dev/null || true
done

echo "Blocked ${#ATTACKING_IPS[@]} attacking IPs at the ALB security group"

# Note: These blocks are temporary (manual). For persistent blocks, use AWS WAF.
```

#### 2. Increase Rate Limit Strictness (Temporary)

```bash
# Update ECS task definition with stricter rate limits
# WARNING: This is temporary; revert after the attack stops

cd terraform

# Override rate limit variables (add to terraform plan)
terraform plan -out=strict_limits.tfplan \
  -var="aws_region=${AWS_REGION}" \
  -var="project_name=${PROJECT_NAME}" \
  -var="environment=${ENVIRONMENT}" \
  -var="rate_limit_auth_per_minute=20" \
  -var="rate_limit_per_minute=100"

terraform apply strict_limits.tfplan

# Monitor for legitimate user complaints
# If good users are being rate-limited, relax the limits back
```

#### 3. Enable AWS WAF (Long-term)

```bash
# WAF can detect and block credential stuffing patterns
# This is a planned enhancement; add IP reputation lists, rate-based rules

# For now, document the attack in the incident log and schedule WAF implementation
```

#### 4. Notify Users (if data integrity is at risk)

```bash
# If the attack is large-scale or successful, notify affected users:
# - Email users: "We detected unusual login activity. If you didn't login recently, change your password."
# - Invalidate suspicious sessions: DELETE FROM auth.refresh_tokens WHERE created_at < NOW() - INTERVAL '1 hour'
# - Force re-authentication on the frontend

# This is a manual step; no AWS CLI command available
```

#### 5. Unlock a Legitimate User Caught by the Lockout

The backend also self-defends against credential stuffing with a per-account
login lockout (`LOGIN_LOCKOUT_THRESHOLD` failed attempts within
`LOGIN_LOCKOUT_WINDOW_SECONDS` — defaults 5 / 15 minutes; see the
[README's Login Lockout & Admin Unlock section](../../README.md#login-lockout--admin-unlock)).
A user who mistypes their password repeatedly (or is themself the target of
an attack) is locked out the same way an attacker would be, and cannot
self-recover — only an admin can clear it, or they can wait out the window.

```bash
# 1. Confirm the user is actually locked out (not some other auth issue):
#    have them (or you, via a scratch curl) attempt login with the correct
#    password — a locked-out account returns 401 even with valid credentials.
curl -s -X POST "${APPLICATION_URL}/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@example.com", "password": "<correct password>"}' | jq .

# 2. As an admin, list users to find the account's id and confirm
#    "is_locked": true:
curl -s "${APPLICATION_URL}/api/admin/users" \
  -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" | jq '.[] | select(.email == "user@example.com")'

# 3. Clear the lockout (does not change the user's password or role):
curl -s -X POST "${APPLICATION_URL}/api/admin/users/<user_id>/unlock" \
  -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" | jq .

# This can also be done from the User Management page in the app (admin
# role required) — locked-out accounts show a "Locked out" badge with an
# inline Unlock button.
```

An `admin.user.unlock` audit event is emitted either way, so repeated
unlock requests for the same account are visible in the audit trail —
useful signal if an admin is unlocking the same user over and over
(possibly still under active attack).

---

## Rollback

If mitigation causes other issues:

1. **Revert rate limit changes**
   ```bash
   cd terraform
   terraform plan -out=revert_limits.tfplan \
     -var="rate_limit_auth_per_minute=60" \
     -var="rate_limit_per_minute=200"
   terraform apply revert_limits.tfplan
   ```

2. **Remove IP blocks**
   ```bash
   ALB_SG="..."
   for IP in "${ATTACKING_IPS[@]}"; do
     aws ec2 authorize-security-group-ingress \
       --group-id "${ALB_SG}" \
       --cidr "${IP}/32" \
       --protocol tcp \
       --port 443 \
       --region "${AWS_REGION}"
   done
   ```

3. **Restore previous JWT_SECRET (if changed)**
   ```bash
   # You'll need to have the previous secret value
   # Store it securely (e.g., in a backup or vault)
   aws secretsmanager update-secret \
     --secret-id "${PROJECT_NAME}/${ENVIRONMENT}/jwt-secret" \
     --secret-string "${PREVIOUS_SECRET}" \
     --region "${AWS_REGION}"
   ```

---

## Prevention

To reduce credential stuffing attacks:

1. **Implement MFA** — Require multi-factor authentication for user accounts
2. **Use CAPTCHA** — Add CAPTCHA to login forms
3. **Monitor failed logins** — Track failed login patterns and alert on anomalies
4. ~~Implement account lockout~~ — **Done**: per-account login lockout is enforced after `LOGIN_LOCKOUT_THRESHOLD` failed attempts (see Step 5 above for admin unlock)
5. **Enable AWS WAF** — Deploy WAF rules to detect and block brute-force patterns
6. **Use AWS Secrets Manager rotation** — Automatically rotate JWT_SECRET periodically
7. **Scan for compromised credentials** — Use AWS Secrets Manager password rotation or third-party tools

---

## Escalation Path

1. **0-5 min:** Perform triage (Steps 1-6)
2. **5-10 min:** Apply fast mitigation (restart tasks, block IPs)
3. **10-15 min:** If the attack continues, escalate to **Security Lead**
4. **15+ min:** If a data breach is suspected, declare P1 and activate the full incident response team

---

## Owner

**Security Lead / Platform Team:** — TODO: fill name  
**Backend Engineer:** — TODO: fill name  
**Incident Commander:** — TODO: fill name

---

## Related Documentation

- [README.md#Authentication](../../README.md#Authentication) — auth implementation details
- [Deploy & Rollback Runbook](./deploy-rollback.md) — to redeploy if needed
- [Database Unavailable Runbook](./database-unavailable.md) — if auth database is down
- [Postmortem Template](./postmortem-template.md) — post-incident review
- AWS WAF Documentation: https://docs.aws.amazon.com/waf/

---

## Testing This Runbook

Before an incident:

1. **Simulate brute force:** Use a tool like `hydra` against the login endpoint in a non-prod environment
2. **Test rate limiting:** Verify that legitimate login attempts succeed but rapid attempts are blocked
3. **Test IP blocking:** Verify that ALB security group rules can be updated quickly
4. **Test JWT regeneration:** Verify that users can login again after JWT_SECRET changes

---

## Lessons Learned (Post-Incident)

After this runbook is exercised, document:
- **How was the attack detected?**
- **How long until mitigation?**
- **Were legitimate users affected?**
- **Should we implement WAF or MFA?**
- **What authentication improvements should we make?**

Update this runbook and notify the team of changes.
