# ADR: Renewal of Checkov SAST Suppressions to 2026-09-30

**Status:** Accepted
**Date:** 2026-07-02
**Register:** [`.sast-exceptions.json`](../.sast-exceptions.json)

---

## Context

The managed SAST suppression register (`.sast-exceptions.json`) now holds 21
Checkov suppressions covering known, documented gaps in the Terraform
infrastructure (HTTPS enforcement, WAF, RDS IAM auth, secret rotation,
restricted egress, DNSSEC, and others). Every entry carries an `expires`
date, and the `IaC SAST (checkov)` CI job hard-fails when any suppression
has expired.

Before the renewal, the register still contained 23 suppressions; the
current count is 21 because PR #313 removes `CKV_AWS_260` and
`CKV_AWS_382` while resolving the underlying findings. All 23 of those
pre-remediation suppressions expired on **2026-06-30**. Since then, every
fresh CI run on every pull request — including dependency bumps that do not
touch infrastructure — fails the Checkov gate, blocking all merges.

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
`expires` date of the remaining suppressions from `2026-06-30` to
**`2026-09-30`** while the remediation plan continues.

PR #313 concurrently removes `CKV_AWS_260` and `CKV_AWS_382` from the
register by fixing the underlying findings. Aside from that reduction, no
suppression is added, broadened, or otherwise changed; the individual
justifications recorded in the register remain accurate.

---

## Consequences

* CI is unblocked: the Checkov gate passes again for pull requests that do
  not introduce new findings, restoring the ability to merge routine
  changes such as dependency updates.
* The risk posture is improved slightly because `CKV_AWS_260` and
  `CKV_AWS_382` are remediated and removed, while the remaining findings
  keep the renewed review date.
* Each suppression must be remediated or consciously renewed again by
  **2026-09-30**, at which point the CI gate will hard-fail once more.
  Landing #312 and #313 ahead of that date shrinks the register by four
  entries in total: `CKV_AWS_161`, `CKV2_AWS_57`, `CKV_AWS_260`, and
  `CKV_AWS_382`.
