# On-Call & Escalation Policy

**Version:** 1.0  
**Last Updated:** 2024-07-05  
**Owner:** Engineering Lead / Incident Commander — TODO: fill name

---

## Executive Summary

This policy defines:
- **On-call rotation** — who is responsible each week
- **Escalation path** — when and how to escalate
- **Response SLAs** — expected response times by severity
- **Communication channels** — how to contact on-call
- **Handoff procedures** — how to transition between on-call engineers

---

## On-Call Rotation

### Current Schedule

| Week | Primary On-Call | Secondary / Backup | Incident Commander | Notes |
|------|-----------------|--------------------|--------------------|-------|
| Jul 1-7 | — TODO | — TODO | — TODO | Initial rotation |
| Jul 8-14 | — TODO | — TODO | — TODO | |
| Jul 15-21 | — TODO | — TODO | — TODO | |

**To update this schedule:** — TODO: link to rotation management system (e.g., PagerDuty, Opsgenie)

### Specialization & Backup Roles

| Role | Primary | Backup | Contact Method |
|------|---------|--------|-----------------|
| **On-Call (General)** | — TODO | — TODO | — TODO (Slack, phone, SMS) |
| **Platform Engineer / DevOps** | — TODO | — TODO | — TODO |
| **Security Lead** | — TODO | — TODO | — TODO |
| **Database Administrator** | — TODO | — TODO | — TODO |
| **Backend Engineer** | — TODO | — TODO | — TODO |
| **Incident Commander** | — TODO | — TODO | — TODO |

### Expectations for On-Call

**You are on-call when:**
- You are assigned to the current week's rotation
- You are reachable by phone, Slack, and SMS during business hours (and 24/7 for P1s)
- You can access AWS console and deploy infrastructure changes
- You have read and understand all runbooks

**What you should do:**
1. **Be reachable** — Respond within SLA (see below)
2. **Acknowledge immediately** — When an alert fires, acknowledge it in the alerting system
3. **Triage quickly** — Identify the incident severity and root cause
4. **Escalate early** — Don't hesitate to escalate; escalation is not failure
5. **Document actions** — Log all commands and decisions in the incident channel
6. **Communicate status** — Keep stakeholders updated every 15 minutes
7. **Follow runbooks** — Use the standardized procedures to resolve incidents
8. **Post-incident review** — Participate in the postmortem and update runbooks

**What you should NOT do:**
- Ignore alerts or take more than 30 minutes to respond to a P1
- Make unilateral decisions without consensus (escalate if unsure)
- Bypass change controls or skip runbook steps
- Leave an incident unresolved without a handoff to the next on-call

---

## Incident Severity & Response SLAs

| Severity | Definition | Response SLA | Resolution Target | Examples |
|----------|-----------|--------------|-------------------|----------|
| **P1 (Critical)** | Users cannot access the app; data loss risk | 15 minutes | 1 hour | Database down, auth broken, 20%+ error rate |
| **P2 (High)** | Users experience significant degradation | 30 minutes | 4 hours | RDS failover in progress, memory leak, slow queries |
| **P3 (Medium)** | Minor features fail; most users unaffected | 4 hours | 1 business day | Log storage full, unused resources, minor bugs |
| **P4 (Low)** | Informational; no user impact | Next business day | Next sprint | Documentation improvements, refactoring |

---

## Escalation Path

Follow this escalation path based on incident severity and elapsed time:

### P1 Incident

```
Alarm fires (0 min)
        ↓
Acknowledge in PagerDuty (5 min SLA)
        ↓
Primary On-Call investigates (5 min)
        ↓
[Decision point]
        ├─ Issue identified and fixing (continue)
        │
        ├─ Issue unclear → Escalate to Secondary / Backup (10 min)
        │
        └─ Issue complex → Escalate to Incident Commander + specialization (15 min)
        
[Recovery]
        ├─ Mitigation applied (monitor for 15 min)
        │
        └─ No recovery → Escalate to AWS Support (20 min)
```

### P2 Incident

```
Alarm fires (0 min)
        ↓
Acknowledge in PagerDuty (30 min SLA)
        ↓
On-Call investigates (30 min)
        ↓
[Decision point]
        ├─ Issue identified and fixing (continue)
        │
        └─ No progress by 1 hour → Escalate to specialization
```

### P3 Incident

```
Alarm fires (0 min)
        ↓
Acknowledge in PagerDuty (4 hour SLA)
        ↓
On-Call investigates during business hours
        ↓
Fix during planned maintenance window
```

---

## Communication Channels

### Primary Channels

- **Slack:** `#incidents` channel (all incidents)
- **PagerDuty/Opsgenie:** Automated alerts and escalation — TODO: link
- **Email:** Escalation notifications to leadership
- **Phone:** For critical incidents requiring voice confirmation
- **War room:** Zoom/Slack huddle for complex incidents

### Alert Routing

| Severity | Channel | Route To |
|----------|---------|----------|
| P1 | PagerDuty → SMS + Phone | On-Call engineer |
| P1 (no response 5 min) | PagerDuty → Escalate | Secondary / Backup |
| P1 (no response 10 min) | Manual escalation | Incident Commander |
| P2 | PagerDuty → Slack | On-Call engineer |
| P3 | Slack only | #incidents channel |

### Incident Channel Template

Create a Slack thread for each incident:

```
Title: [P1] Database Unavailable - 2024-07-05 14:30 UTC
Severity: P1
Status: Investigating
Assigned: @alice (On-Call)
Timeline:
  14:30 - Alert fired: "RDS instance failed"
  14:32 - Alice acknowledged alert
  14:35 - Investigation begins; checking RDS status
  14:40 - Root cause identified: storage full
  14:45 - Mitigation: storage expanded from 100GB to 200GB
  15:00 - Status: recovered; monitoring
Impact: 450 users unable to login for 15 minutes
```

---

## Escalation Decision Tree

### When to Escalate to Backup / Secondary

Escalate immediately if:
- You've spent 10 minutes investigating with no clear diagnosis
- The issue requires access you don't have (e.g., database password reset)
- You're unsure whether a proposed fix is safe
- You need a second opinion before making a breaking change

**How to escalate:**
```bash
# In Slack
@backup-on-call This is a P1 incident. I need your help triaging.
I've checked [X, Y, Z] and the next step is [unclear to me].
Can you take a look?

# In PagerDuty
Click "Escalate" to notify the backup on-call immediately
```

### When to Escalate to Incident Commander

Escalate immediately if:
- The incident is not resolving after 15 minutes of mitigation
- You believe a customer notification is needed
- The incident involves data loss or suspected breach
- You need to authorize a breaking change (e.g., restart production database)

**How to escalate:**
```bash
# In Slack
@incident-commander P1 incident not resolving. 
Mitigation attempted: [X, Y, Z]
Status: Database still unavailable
Recommendation: Restore from backup (30 min downtime)
Need approval to proceed.

# In PagerDuty
Escalate to the Incident Commander on-call
```

### When to Open AWS Support Case (P1 Only)

Open a support case if:
- You cannot resolve the incident with available tools
- RDS instance is completely unavailable
- You suspect an AWS infrastructure issue
- You need emergency AWS assistance

**How to open a case:**
```bash
aws support create-case \
  --subject "[URGENT] Database unavailable - open-prompt-manager" \
  --description "RDS instance ${PROJECT_NAME}-${ENVIRONMENT} has been unavailable for 20 minutes. Status: failed. Failover did not complete. Requesting emergency support." \
  --service-code "amazon-rds" \
  --severity-code "urgent" \
  --region "${AWS_REGION}"

# Or open via AWS Console:
# Support → Create case → Urgent → RDS → Describe issue
```

---

## Handoff Procedures

### Start of On-Call (Beginning of Week)

```bash
# 1. Review runbooks
# Read all runbooks in docs/runbooks/

# 2. Check current status
curl https://<your-domain>/api/health
curl https://<your-domain>/api/ready

# 3. Review recent incidents
# Check #incidents channel for last month's incidents
# Run postmortems if any are open

# 4. Verify access
# Confirm you can access:
# - AWS Console (role permissions)
# - PagerDuty / Opsgenie (alerting)
# - Slack (channels: #incidents, #alerts, #deployments)
# - GitHub (to review deploy logs)

# 5. Update on-call schedule
# Notify team: "I'm on-call from [DATE] to [DATE]"
# Share your contact info (if needed)

# 6. Set up monitoring dashboard
# Open CloudWatch dashboards for:
# - Application health
# - RDS metrics
# - ALB metrics
# - Error rates
```

### End of On-Call (End of Week)

```bash
# 1. Handoff to next on-call
# Schedule a 15-minute call with the next on-call engineer
# Walk through:
# - Recent incidents and resolutions
# - Any known issues or degradations
# - Recent infrastructure changes
# - Current resource utilization

# 2. Update incident log
# Document all incidents from the week:
# - Time, severity, root cause, resolution
# - Any runbook updates needed
# - Any follow-up items

# 3. Close any open follow-ups
# Assign follow-up tasks to the appropriate team
# Create GitHub issues if needed

# 4. Availability
# Update your availability status
# You can still help with incidents, but you're no longer primary
```

---

## Game Day (Runbook Testing)

Schedule a game day quarterly to test runbooks and incident response:

### Planning (1 week before)

```bash
# 1. Pick a runbook to test
# e.g., "Database Unavailable" or "Deploy Rollback"

# 2. Notify the team
# "Game day on [DATE] at [TIME]. Testing [RUNBOOK]. Full participation required."

# 3. Prepare a safe test environment
# Use staging RDS instance, not production

# 4. Define the scenario
# "RDS instance becomes unavailable. Measure time to detect, diagnose, mitigate."
```

### Execution (2 hours)

```bash
# 1. Incident commander simulates the failure
# Stops the RDS instance (or introduces a problem)

# 2. On-call engineer follows the runbook
# No cheating; follow the runbook exactly as written
# Time each step

# 3. Observers watch and note issues
# Is the runbook unclear?
# Are there missing steps?
# Are there unnecessary steps?

# 4. Once resolved, document observations
# "The runbook said X but X didn't work. Let's fix it."
```

### Debrief (1 week after)

```bash
# 1. Update runbooks based on observations
# "Step 5 was unclear; let's improve it"

# 2. Discuss improvements
# "Should we automate this?"
# "Do we need a new alarm?"

# 3. Schedule the next game day
# Quarterly, rotating between runbooks
```

---

## Contact Information & Escalation Contacts

### Primary Contacts

| Role | Name | Email | Phone | Slack | Availability |
|------|------|-------|-------|-------|--------------|
| Primary On-Call | — TODO | — TODO | — TODO | — TODO | On-call week |
| Secondary On-Call | — TODO | — TODO | — TODO | — TODO | Backup |
| Incident Commander | — TODO | — TODO | — TODO | — TODO | 24/7 (page if needed) |
| Platform Engineer | — TODO | — TODO | — TODO | — TODO | Business hours |
| Security Lead | — TODO | — TODO | — TODO | — TODO | Business hours + on-demand |
| Database Administrator | — TODO | — TODO | — TODO | — TODO | Business hours + on-demand |

### Escalation Paths

**For P1 incidents:**
1. Page the Primary On-Call (immediate)
2. If no response in 5 minutes, page the Secondary On-Call
3. If no response in 10 minutes, page the Incident Commander
4. If still no progress at 15 minutes, open AWS Support case

**For P2 incidents:**
1. Notify on-call in Slack
2. If no response in 30 minutes, escalate to the specialist (Platform Engineer, DBA, etc.)

---

## Policies & Standards

### Communication Standards

- **Acknowledge alerts** within the SLA (5 min for P1, 30 min for P2)
- **Update the incident channel** every 15 minutes with status
- **Notify stakeholders** of estimated resolution time
- **Be transparent** about what you don't know

### Decision-Making Standards

- **Follow runbooks** as written unless instructed otherwise
- **Escalate early** if you're unsure
- **Document decisions** and their rationale
- **Avoid unilateral changes** to production systems
- **Test fixes** in staging first when possible

### Safety & Guardrails

- **Change control** — All infrastructure changes require two-person approval (reviewer + executor)
- **Backups** — Always verify a backup exists before destructive operations
- **Monitoring** — Monitor for 15 minutes after any mitigation
- **Rollback** — Always have a rollback plan before applying changes

---

## Postmortem Process

After every P1 incident and every significant P2 incident:

1. **Schedule postmortem** within 48 hours (async okay for low-impact incidents)
2. **Invite participants** — engineers who were involved, incident commander, team leads
3. **Use postmortem template** — See [postmortem-template.md](./postmortem-template.md)
4. **Identify action items** — What should we change to prevent this?
5. **Update runbooks** — Document what we learned
6. **Share learnings** — Post summary in #incidents channel

---

## Metrics & Reporting

Track these metrics to improve on-call:

- **Mean Time to Acknowledge (MTTA)** — How long until the on-call engineer responds?
- **Mean Time to Detect (MTTD)** — How long until the incident is detected?
- **Mean Time to Recovery (MTTR)** — How long until the application is restored?
- **Incident frequency** — How many P1s per month?
- **False positive rate** — What percentage of alerts are false alarms?

---

## On-Call Burnout Prevention

- **Limit on-call weeks** — No more than 1 week per month
- **Swap out if burned out** — Contact Incident Commander if you need to swap
- **Automate what you can** — Use runbook automation to reduce manual work
- **Thank your on-call** — Acknowledge the work done during incidents

---

## Review & Updates

This policy is reviewed:
- **After each major incident** — Add learnings to this document
- **Quarterly** — Verify contact info and escalation paths are current
- **Annually** — Reassess SLAs and rotation model

**Last reviewed:** — TODO: fill date  
**Next review due:** — TODO: fill date (3 months from now)

---

## Related Documentation

- [Database Unavailable Runbook](./database-unavailable.md)
- [Deploy & Rollback Runbook](./deploy-rollback.md)
- [Auth Outage Runbook](./auth-outage-credential-stuffing.md)
- [ALB 5xx Spike Runbook](./alb-5xx-spike.md)
- [RDS Failover Runbook](./rds-failover.md)
- [Postmortem Template](./postmortem-template.md)
- [README.md](../../README.md) — application overview
