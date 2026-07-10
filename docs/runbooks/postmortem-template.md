# Postmortem Template

Use this template for all P1 incidents and significant P2 incidents. Schedule a postmortem within 48 hours of incident resolution.

---

## Incident Summary

**Incident Title:** [Descriptive title]  
**Incident ID:** [YYYY-MM-DD-HHMM] (e.g., 2026-07-05-1430)  
**Severity:** [P1 / P2]  
**Duration:** [HH:MM] (from detection to resolution)  
**Participants:** [Names of incident responders]  
**Incident Commander:** [Name]  
**Postmortem Facilitator:** [Name]  

---

## What Happened

### Timeline

| Time (UTC) | Event |
|-----------|-------|
| 14:30 | [Alert fired / issue detected] |
| 14:32 | [On-call acknowledged alert] |
| 14:35 | [Investigation began] |
| 14:40 | [Root cause identified] |
| 14:45 | [Mitigation applied] |
| 15:00 | [Service recovered] |
| 15:05 | [All-clear given] |

### Summary Narrative

[Write a 3-5 sentence summary of what happened, in chronological order, from the user's perspective]

Example:
> At 14:30 UTC, the RDS instance reached storage capacity and began rejecting all new database connections. The backend service returned 503 errors for approximately 15 minutes. The on-call engineer detected the issue via CloudWatch alarms, confirmed the root cause (storage full), expanded the RDS volume from 100 GB to 200 GB, and the service recovered at 15:05. Approximately 450 users were unable to login during this window.

---

## Impact

### User Impact

- **Duration:** [HH:MM]
- **Affected users:** [Number or percentage]
- **Affected features:** [What couldn't users do?]
- **Customer complaints:** [Yes / No — if yes, summarize feedback]
- **Revenue impact:** [If quantifiable]

### System Impact

- **Services affected:** [List: backend, frontend, database, etc.]
- **Error rate during incident:** [X% 5xx errors]
- **Data loss:** [Yes / No / Unknown]
- **Data corruption:** [Yes / No / Unknown]

---

## Root Cause

### Primary Cause

[What was the fundamental reason for the incident?]

Example:
> The RDS instance was configured with 100 GB of storage, which was insufficient for the growth in usage over the past month. No alert was in place to warn when storage was approaching capacity, so the team was not proactively notified.

### Contributing Factors

[What other factors made the incident worse or harder to recover from?]

Example:
1. No CloudWatch alarm for "RDS storage utilization > 80%"
2. No documentation or runbook for scaling RDS storage
3. Backup retention policy not tested regularly

### Why It Wasn't Caught Earlier

[What failed in our testing, monitoring, or deployment processes?]

Example:
> The staging environment has a smaller database and does not experience the same storage growth. Capacity planning projections predicted 6 months before storage was full, but actual usage was higher than projected.

---

## Detection

### How It Was Detected

- **By:** [Person / Automated alert]
- **Time to detect:** [From occurrence to detection]
- **Detection method:** [CloudWatch alarm, user report, manual check, etc.]

### Alert Quality

- **Was the alert actionable?** [Yes / No]
- **Was the alert timely?** [Yes / No]
- **Was the alert clearly routed?** [Yes / No]

### Improvements

- [ ] Add alert: "RDS storage > 80%"
- [ ] Add alert: "RDS storage growth rate suggests full in X days"
- [ ] Add to dashboard: RDS storage trend

---

## Response

### Triage (Time from alert to identifying root cause)

- **Duration:** [MM:SS]
- **Steps taken:**
  1. [First step of investigation]
  2. [Second step]
  3. [Root cause identified]
- **Blockers:** [Were there any delays in accessing data / systems?]
- **Improvements:** [What would have made triage faster?]

### Mitigation (Time from root cause to recovery)

- **Duration:** [MM:SS]
- **Mitigation applied:** [Specific action taken]
- **Were there any false starts?** [Yes / No — if yes, explain]
- **Did the mitigation work?** [Yes / No / Partially]
- **Time to confirm recovery:** [MM:SS after mitigation applied]

### Escalation

- **Was escalation needed?** [Yes / No]
- **Who was escalated to?** [Name and role]
- **Time to escalation:** [MM:SS after incident started]
- **Did escalation help?** [Yes / No / Somewhat]

---

## Resolution

### How Was It Fixed

[Describe the final fix applied]

Example:
> Modified the RDS instance to increase allocated storage from 100 GB to 200 GB using `aws rds modify-db-instance`. The modification completed in approximately 5 minutes with no downtime (it was applied to the standby first, then failed over).

### Verification

- **How was recovery confirmed?** [Health check, user testing, etc.]
- **Were there any lingering issues?** [Yes / No]
- **Did any other systems need to be checked?** [Yes / No]

### Duration

| Phase | Duration |
|-------|----------|
| Detection | 2 min |
| Triage | 8 min |
| Mitigation | 15 min |
| Recovery | 5 min |
| **Total** | **30 min** |

---

## Runbook & Process Review

### Was a runbook available?

- [ ] Yes, and it was followed exactly
- [ ] Yes, but it was incomplete or unclear
- [ ] Yes, but it wasn't consulted during the incident
- [ ] No, this is a new scenario

### Runbook feedback

- **What was helpful?** [Specific steps or information]
- **What was missing?** [Information or steps needed]
- **What was incorrect?** [Steps that didn't work as written]

### Process feedback

- **Did we escalate appropriately?** [Yes / No]
- **Did we communicate clearly?** [Yes / No]
- **Did we have all the access needed?** [Yes / No]
- **Could we have resolved this faster?** [Yes / No — if yes, how?]

---

## Root Cause Analysis (5 Whys)

Dig deeper into why the incident occurred:

1. **Why did the incident happen?**
   > The RDS instance ran out of storage.

2. **Why did it run out of storage?**
   > Usage grew faster than expected, and no capacity monitoring was in place.

3. **Why wasn't there capacity monitoring?**
   > It wasn't included in the initial CloudWatch alarms setup (issue #331 in progress).

4. **Why wasn't it included?**
   > The infrastructure was deployed before the monitoring strategy was fully planned.

5. **Why was monitoring not planned first?**
   > The original deployment focused on getting the application live quickly, with monitoring as a follow-up.

**Core issue:** Infrastructure deployment prioritized speed over observability.

---

## Action Items

### Immediate (Today)

- [ ] Increase RDS storage to 300 GB (1 day lead time before this recurs)
- [ ] Manual daily check: `aws rds describe-db-instances | grep FreeStorageSpace`
- [ ] Notify team: "RDS storage is now at 70%. Expect to fill again in 3 weeks."

### Short-term (This week)

- [ ] Add CloudWatch alarm: "RDS storage > 80% for 10 minutes"
- [ ] Create CloudWatch dashboard for RDS metrics (storage, CPU, connections)
- [ ] Document RDS scaling procedure in runbooks/database-unavailable.md
- [ ] Test the database-unavailable.md runbook with this scenario

### Medium-term (This month)

- [ ] Implement storage trend analysis: "RDS storage growth rate suggests full in X days"
- [ ] Plan capacity: Calculate storage needed for next 12 months of growth
- [ ] Review other resource limits (CPU, connections, backup storage)
- [ ] Implement alerts for all critical resources

### Long-term (Next quarter)

- [ ] Implement auto-scaling for RDS storage (if available)
- [ ] Plan quarterly capacity reviews (measure growth trends)
- [ ] Schedule game day to test RDS failover and restore procedures
- [ ] Implement dashboard for historical trends and projections

---

## Prevention & Future Prevention

### What We'll Do Differently Next Time

1. [Specific action to prevent recurrence]
2. [Specific action to detect faster]
3. [Specific action to recover faster]

### Lessons Learned

- **Technical lesson:** [What did we learn about how the system works?]
- **Process lesson:** [What did we learn about our incident response?]
- **Organizational lesson:** [What did we learn about how we work together?]

### Changes to Documentation

- [ ] Update [runbook name]: [Specific change]
- [ ] Update [runbook name]: [Specific change]
- [ ] Create new runbook for [scenario]
- [ ] Update on-call escalation policy: [Specific change]

---

## Blameless Post-Mortem Acknowledgments

### Why This Wasn't Anyone's Fault

The incident was caused by:
- Incomplete observability (monitoring not fully implemented)
- Insufficient capacity planning (growth underestimated)
- Process gaps (no regular capacity reviews)

### What We Appreciate

- **[Person name]**: Rapid response and clear communication during the incident
- **[Person name]**: Clear root cause analysis
- **[Person name]**: Good escalation decision
- Team: Excellent collaboration and knowledge sharing

---

## Approval & Signature

| Role | Name | Approval | Date |
|------|------|----------|------|
| **Incident Commander** | [Name] | [ ] | [Date] |
| **Engineering Lead** | [Name] | [ ] | [Date] |
| **Postmortem Facilitator** | [Name] | [ ] | [Date] |

---

## Distribution

**Postmortem reviewed by:**
- [ ] Team: Announce in #incidents channel
- [ ] Leadership: Share with engineering leads
- [ ] Customers (if applicable): Publish public status page update

**Postmortem stored at:**
- GitHub: [Link to PR / commit]
- Docs: [Link to archived postmortem]

---

## Follow-Up

**Check-in dates for action items:**
- **1 week later:** [Who] to verify immediate actions completed
- **1 month later:** [Who] to track progress on medium-term items
- **1 quarter later:** [Who] to close out long-term improvements

**Next incident review meeting:** [Date]

---

## Appendix

### A. Logs & Evidence

[Link to CloudWatch logs, error traces, or other relevant logs]

- CloudWatch Logs: `/ecs/open-prompt-manager/backend` (2026-07-05 14:30-15:05)
- RDS Events: [Link to event history]
- ALB Access Logs: [Link to S3 logs]

### B. Alerts That Fired

- Alert 1: "RDS instance CPU > 80%" at 14:31
- Alert 2: [Description] at [time]

### C. Commands Used for Recovery

```bash
# Resize RDS storage
aws rds modify-db-instance \
  --db-instance-identifier open-prompt-manager-prod \
  --allocated-storage 200 \
  --apply-immediately \
  --region ap-southeast-2

# Restart service
aws ecs update-service \
  --cluster open-prompt-manager-cluster \
  --service open-prompt-manager-backend-service \
  --force-new-deployment \
  --region ap-southeast-2
```

### D. Related Issues & PRs

- GitHub Issue: #[XXX] — Add CloudWatch alarm for RDS storage
- GitHub PR: #[XXX] — Update database-unavailable.md runbook
- Related incident: [Date] — Previous storage capacity issue

---

## Template Notes

- **Keep it blameless:** Focus on systemic issues, not individual mistakes
- **Be specific:** Avoid vague statements; include times, metrics, and names
- **Action items:** Make them concrete and assignable (owner + deadline)
- **Share learning:** Post the summary in #incidents so the team learns
- **Update runbooks:** Every incident should improve the runbooks

---

**Postmortem completed by:** [Name]  
**Date completed:** [YYYY-MM-DD]  
**Postmortem status:** [ ] Draft [ ] Review [ ] Approved [ ] Archived
