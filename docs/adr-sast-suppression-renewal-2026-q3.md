# ADR: Renewal of Checkov SAST Suppressions to 2026-09-30

**Status:** Accepted
**Date:** 2026-07-02
**Register:** [`.sast-exceptions.json`](../.sast-exceptions.json)

---

## Context

The managed SAST suppression register (`.sast-exceptions.json`) holds 23
Checkov suppressions covering known, documented gaps in the Terraform
infrastructure (HTTPS enforcement, WAF, RDS IAM auth, secret rotation,
restricted egress, DNSSEC, and others). Every entry carries an `expires`
date, and the `IaC SAST (checkov)` CI job hard-fails when any suppression
has expired.

All 23 suppressions expired on **2026-06-30**. Since then, every fresh CI
run on every pull request — including dependency bumps that do not touch
infrastructure — fails the Checkov gate, blocking all merges.

Remediation work is in flight but not yet mergeable:

* [#312](https://github.com/ale-sanchez-g/open-prompt-manager/pull/312)
  enables RDS IAM authentication and automatic `DATABASE_URL` rotation
  (removes `CKV_AWS_161`, `CKV2_AWS_57`).
* [#313](https://github.com/ale-sanchez-g/open-prompt-manager/pull/313)
  restricts security-group egress and adds VPC endpoints
  (removes `CKV_AWS_260`, `CKV_AWS_382`).

---

## Decision

We accept the documented risks for **three more months** and extend the
`expires` date of all 23 Checkov suppressions from `2026-06-30` to
**`2026-09-30`** while the remediation plan continues.

No suppression is added, removed, or broadened by this change — only the
expiry dates are renewed. The individual justifications recorded in the
register remain accurate and unchanged.

---

## Consequences

* CI is unblocked: the Checkov gate passes again for pull requests that do
  not introduce new findings, restoring the ability to merge routine
  changes such as dependency updates.
* The risk posture is unchanged from what was previously accepted; the
  same findings remain suppressed, now with a renewed review date.
* Each suppression must be remediated or consciously renewed again by
  **2026-09-30**, at which point the CI gate will hard-fail once more.
  Landing #312 and #313 ahead of that date shrinks the register by four
  entries.
