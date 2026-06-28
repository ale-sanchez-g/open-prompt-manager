# ADR: Secrets Manager Rotation and RDS IAM Database Authentication

**Status:** Accepted
**Date:** 2026-06-28
**Issue:** [#202 Week 7: Secrets rotation and DB IAM auth enhancement](https://github.com/ale-sanchez-g/open-prompt-manager/issues/202)
**Checks resolved:** `CKV2_AWS_57` (Secrets Manager automatic rotation), `CKV_AWS_161` (RDS IAM authentication)

---

## Context

The AWS deployment stores two secrets in Secrets Manager — the backend
`JWT_SECRET` and the PostgreSQL `DATABASE_URL` — and authenticates to RDS with a
static master-user password embedded in `DATABASE_URL`. Two SAST suppressions
were carried in `.sast-exceptions.json` against this design:

* `CKV_AWS_161` — RDS IAM database authentication was not enabled.
* `CKV2_AWS_57` — no Secrets Manager secret had automatic rotation configured.

This is Week 7 of the 12-week SAST remediation plan. The goal is to strengthen
credential security with automated rotation and an additional IAM-based access
path to the database, then retire both suppressions.

A material constraint shaped the design: the application
(`backend/app/database/base.py`) reads `DATABASE_URL` **once at process start**
and hands it to a long-lived SQLAlchemy connection pool. The secret value is a
single libpq/SQLAlchemy connection string, **not** the structured
`{username, password, host, port, dbname, engine}` JSON document that the
AWS-provided rotation templates expect.

---

## Decision

### 1. Enable IAM database authentication (CKV_AWS_161)

Set `iam_database_authentication_enabled = true` on `aws_db_instance.main`.

This is **additive and non-breaking**: the master user continues to
authenticate with its Secrets Manager password (the application path is
unchanged), while IAM principals granted `rds-db:connect` can additionally
obtain short-lived (15-minute) authentication tokens. It establishes the
credential-less access path that the application can adopt later to remove its
dependence on a static, rotating password.

### 2. Automatic rotation of `DATABASE_URL` (CKV2_AWS_57)

A **custom, in-VPC rotation Lambda** rotates the RDS master-user password and
rewrites the `DATABASE_URL` secret **in place**, preserving the single
connection-string contract so no application or ECS task-definition change is
required.

| Component | Resource |
|-----------|----------|
| Rotation function | `aws_lambda_function.db_rotation` (`terraform/lambda/db_rotation/`) |
| Schedule | `aws_secretsmanager_secret_rotation.db_url`, every `var.db_secret_rotation_days` (default 30) |
| Networking | Private subnets + dedicated `aws_security_group.db_rotation`; RDS SG ingress added from it |
| Invocation | `aws_lambda_permission.db_rotation` — only `secretsmanager.amazonaws.com`, scoped to the secret ARN |
| Execution role | `aws_iam_role.db_rotation` — least-privilege secret + KMS + VPC + X-Ray + DLQ access |
| KMS | Rotation role granted `Decrypt`/`GenerateDataKey` on the secrets CMK (`kms.tf`) |
| Resilience | `aws_sqs_queue.db_rotation_dlq` dead-letter queue, Active X-Ray tracing, capped reserved concurrency |

The function implements the standard four-step single-user rotation contract
(`createSecret` → `setSecret` → `testSecret` → `finishSecret`). Because the
secret is a URL rather than structured JSON, the handler parses the URL,
generates a new password via `GetRandomPassword`, `ALTER USER`s the role, tests
the pending credentials, and promotes the new version. The pure URL parse/build
helpers are unit-tested in `test_rotation_helpers.py`.

The only runtime dependency is `pg8000`, a pure-Python PostgreSQL driver, which
packages cleanly with no native build step. `terraform/lambda/db_rotation/build.sh`
vendors it; `deploy.sh` and the GitHub Actions deploy workflow run it before
`terraform apply`.

### 3. JWT secret rotation — deliberately deferred

The `JWT_SECRET` is **not** put under automatic rotation. Rotating the JWT
signing key invalidates every active access and refresh token, forcing all
users to re-authenticate. Safe rotation requires application support for an
overlapping (current + previous) signing-key verification window, which is an
application change outside the scope of this infrastructure issue.

The broad register suppression for `CKV2_AWS_57` is removed. In its place,
`aws_secretsmanager_secret.jwt_secret` carries a narrowly-scoped inline
`checkov:skip=CKV2_AWS_57` with this justification. This is a finer-grained,
code-reviewed control than a global skip: rotation is now *enforced* on every
other secret, and only the one resource with a genuine functional conflict is
annotated, in the code, next to the resource it applies to.

---

## Alternatives Considered

### AWS-managed rotation function (Serverless Application Repository)

`SecretsManagerRDSPostgreSQLRotationSingleUser` is AWS-maintained and avoids
shipping our own code. It was **not chosen** because it requires the secret in
structured JSON form. Adopting it would have meant restructuring the secret and
changing both the application (to assemble its URL from components) and the ECS
task definition — a larger, app-coupled change than this infrastructure issue
intends, and one that still carries the connection-pool staleness trade-off
below.

### Multi-user (alternating) rotation strategy

The alternating-users strategy gives near-zero-downtime rotation. It was **not
chosen now** because it requires bootstrapping a second database role
(a DB-side operation outside Terraform's RDS resource) and structured-secret
support. It is the recommended follow-up if rotation frequency increases.

### Structured `db_credentials` secret + application refactor

Splitting credentials into a structured secret and having the app assemble the
URL was rejected for this issue to keep the blast radius small and avoid an
unvalidated runtime-contract change. It remains the natural companion to the
multi-user strategy.

---

## Consequences

### Positive

* `CKV_AWS_161` and `CKV2_AWS_57` both pass with the register suppressions
  removed; `terraform fmt`, `validate`, and `test` and the Checkov fail-policy
  gate remain green.
* The database master password rotates automatically every 30 days with no
  application or ECS change.
* IAM authentication is available as a defence-in-depth access path and as the
  foundation for retiring static-password dependence.
* Rotation runs in private subnets with least-privilege IAM, a dead-letter
  queue, and tracing.

### Negative / Trade-offs

* **Connection-pool staleness (single-user strategy).** When the password
  rotates, ECS tasks still holding pooled connections that were opened with the
  previous credentials will fail on reconnect until they are recycled, because
  they cache the `DATABASE_URL` captured at task start. Mitigations:
  * Run rotation during a maintenance window and force a fresh ECS deployment
    afterwards (`aws ecs update-service --force-new-deployment`), or
  * Migrate the application to IAM authentication (now enabled) so it no longer
    depends on the static password — the strategic fix.
* **Custom code to maintain.** The rotation handler is project-owned rather than
  AWS-managed. It is small, dependency-light, and unit-tested, but it is code we
  own.
* **JWT rotation still outstanding** — tracked as a follow-up requiring an
  app-level signing-key overlap window.

### Follow-ups

1. Application support for IAM-token database authentication (removes static
   password dependence; pairs with this change).
2. Overlapping JWT signing-key window, then enable rotation on `JWT_SECRET` and
   remove its inline skip.
3. Evaluate the multi-user rotation strategy if cadence tightens.

---

## Implementation

| File | Change |
|------|--------|
| `terraform/rds.tf` | `iam_database_authentication_enabled = true`; inline `CKV2_AWS_57` skip + justification on `jwt_secret` |
| `terraform/rotation.tf` | New: archive packaging, rotation Lambda, DLQ, log group, invoke permission, `aws_secretsmanager_secret_rotation` |
| `terraform/lambda/db_rotation/` | New: rotation handler, `requirements.txt`, `build.sh`, unit tests, README |
| `terraform/iam.tf` | New: Lambda assume-role doc, rotation execution role + least-privilege policy + VPC managed policy |
| `terraform/security_groups.tf` | New: rotation SG; RDS SG ingress from the rotation SG |
| `terraform/kms.tf` | Secrets CMK policy: allow the rotation role to decrypt/re-encrypt |
| `terraform/variables.tf` | New: `db_secret_rotation_days` (validated 1–365) |
| `terraform/versions.tf` | Added `hashicorp/archive` provider |
| `terraform/tests/rds.tftest.hcl` | Assertions: IAM auth enabled, rotation configured + cadence override |
| `terraform/tests/rotation.tftest.hcl` | New: Lambda runtime/hardening, DLQ encryption, endpoint, invoke scope, SG wiring |
| `.sast-exceptions.json` | Removed `CKV_AWS_161` and `CKV2_AWS_57` register suppressions |
| `deploy.sh` / `.github/workflows/deploy.yml` | Build the rotation Lambda package before `terraform apply` |
| `.gitignore` | Ignore vendored Lambda deps and built zips |
| `README.md`, `terraform/install.md`, `migration/2026-jun-28-mig-003.md` | Documentation and operational runbook |
