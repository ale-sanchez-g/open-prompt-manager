# Incident Response Runbooks

This directory contains runbooks for diagnosing and responding to critical incidents in the Open Prompt Manager production deployment on AWS ECS Fargate.

**Runbooks are living documents.** After each incident, update the relevant runbook with lessons learned and improved triage steps.

## Severity Definitions

| Level | Response Time | Impact | Example |
|-------|---------------|--------|---------|
| **P1 (Critical)** | 15 min | Users cannot authenticate or access the app; data loss risk | Database unavailable, auth service down, ALB 5xx spike (>20% errors) |
| **P2 (High)** | 30 min | Users experience significant degradation; non-critical features fail | RDS failover in progress, slow query spike affecting dashboard |
| **P3 (Medium)** | 4 hours | Minor features fail; users not affected | CloudWatch storage full, log rotation needed, memory pressure |
| **P4 (Low)** | Next business day | Informational; no user impact | Unused resources, cost optimization opportunities |

---

## Runbook Index

| Runbook | Severity | Ownership |
|---------|----------|-----------|
| [database-unavailable.md](./database-unavailable.md) | P1 | Primary On-Call / Maintainer — TODO: fill name |
| [deploy-rollback.md](./deploy-rollback.md) | P1 | Platform Engineer / DevOps — TODO: fill name |
| [auth-outage-credential-stuffing.md](./auth-outage-credential-stuffing.md) | P1 | Security Lead / Platform Team — TODO: fill name |
| [alb-5xx-spike.md](./alb-5xx-spike.md) | P1 | Platform Engineer / SRE — TODO: fill name |
| [rds-failover.md](./rds-failover.md) | P1 | Database Administrator / Maintainer — TODO: fill name |
| [on-call-escalation-policy.md](./on-call-escalation-policy.md) | — | Engineering Lead / Incident Commander — TODO: fill name |
| [postmortem-template.md](./postmortem-template.md) | — | Incident Commander — TODO: fill name |

---

## Quick Reference

### Health Checks

```bash
# Application health
curl https://<your-domain>/api/health

# Database readiness
curl https://<your-domain>/api/ready
```

### Key AWS Resources

| Resource | Identifier |
|----------|-----------|
| **ECS Cluster** | `open-prompt-manager-cluster` |
| **Backend Service** | `open-prompt-manager-backend-service` |
| **Frontend Service** | `open-prompt-manager-frontend-service` |
| **RDS Instance** | `open-prompt-manager-prod` (or `open-prompt-manager-{env}`) |
| **ALB** | `open-prompt-manager-alb` |
| **CloudWatch Logs** | `/ecs/open-prompt-manager/{backend,frontend}` |
| **Secrets Manager** | `open-prompt-manager/{prod}/jwt-secret`, `open-prompt-manager/{prod}/database-url` |
| **ECR Repos** | `open-prompt-manager-backend`, `open-prompt-manager-frontend` |

### Key Commands

**AWS Region & Project Setup:**
```bash
export AWS_REGION="ap-southeast-2"           # or your region
export PROJECT_NAME="open-prompt-manager"    # or custom project name
export ENVIRONMENT="prod"                    # or dev/staging
export CLUSTER_NAME="${PROJECT_NAME}-cluster"
```

**Describe a service:**
```bash
aws ecs describe-services --cluster "$CLUSTER_NAME" --services "${PROJECT_NAME}-backend-service"
```

**View recent task logs:**
```bash
aws logs tail "/ecs/${PROJECT_NAME}/backend" --follow
```

**List task definitions:**
```bash
aws ecs list-task-definitions --family-prefix "${PROJECT_NAME}-backend" --sort DESC
```

**Get RDS endpoint and status:**
```bash
aws rds describe-db-instances --db-instance-identifier "${PROJECT_NAME}-${ENVIRONMENT}"
```

---

## On-Call Responsibilities

1. **Be reachable** — Respond to alerts within the SLA for your severity level (P1: 15 min)
2. **Triage quickly** — Use the detection signals in each runbook to identify the issue
3. **Execute steps as written** — Runbooks are tested; follow them exactly
4. **Escalate early** — If you're unsure, escalate immediately (see [on-call-escalation-policy.md](./on-call-escalation-policy.md))
5. **Document actions** — Log every command, decision, and discovery in the incident channel
6. **Follow postmortem process** — After resolution, open a postmortem (see [postmortem-template.md](./postmortem-template.md))

---

## Monitoring & Alerting

CloudWatch alarms are configured to fire on:
- Backend task failure or unhealthy ECS tasks
- RDS CPU, storage, or connection spike
- ALB 5xx errors
- Elevated authentication failure rates

Alarm names are planned (see issue #331). Once deployed, runbooks will cross-reference specific alarm ARNs and SNS topic names.

---

## Related Documentation

- **Deployment:** See [README.md#AWS-Terraform-Deployment](../README.md#AWS-Terraform-Deployment) and [deploy.sh](../../deploy.sh) for deployment process
- **Infrastructure:** See [terraform/](../../terraform/) for Terraform configuration
- **Migration Runbooks:** See [migration/](../../migration/) for database schema upgrade procedures
- **Architecture Decision Records:** See [docs/adr-*.md](../) for design decisions

---

## Ownership & Escalation

| Role | Contact | Backup | On-Call |
|------|---------|--------|---------|
| **Primary On-Call** | — TODO | — TODO | 24/7 |
| **Platform Engineer (DevOps)** | — TODO | — TODO | Deployment & Infrastructure |
| **Security Lead** | — TODO | — TODO | Auth & Credential Issues |
| **Database Administrator** | — TODO | — TODO | RDS & Data Integrity |
| **Incident Commander** | — TODO | — TODO | Escalation & Postmortem |

**To contact on-call:** — TODO: fill with Slack channel, PagerDuty link, phone tree, etc.

---

## Runbook Maintenance

Review and update these runbooks:
- **After every incident** — Document what worked, what didn't, and what changed
- **Quarterly** — Verify all AWS CLI commands still work, check for service migrations
- **On infrastructure changes** — When resource names, IDs, or deployment process changes
- **When adding features** — If new services are added, consider new incident scenarios

**Last reviewed:** — TODO: fill date
**Next review due:** — TODO: fill date

---

## Test Playbook

Before relying on these runbooks in production:

1. **Lab environment** — Practice each runbook in a non-prod ECS/RDS stack
2. **Tabletop exercise** — Run through a scenario with the team
3. **Game day** — Conduct a chaos engineering drill with intentional failures
4. **Feedback loop** — Collect notes and update runbooks based on what was unclear or wrong

See [on-call-escalation-policy.md](./on-call-escalation-policy.md) for scheduling a game day.
