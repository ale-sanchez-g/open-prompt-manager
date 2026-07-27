# Issue #365 — OTel sidecar CannotPullContainerError in private-egress ECS

https://github.com/ale-sanchez-g/open-prompt-manager/issues/365

## Root cause

`terraform/otel.tf` pins `otel_collector_image` to
`public.ecr.aws/aws-observability/aws-otel-collector@sha256:...` — the ECR
**Public Gallery**, not the account's private ECR. PR #313 locked the backend
security group's egress down to VPC-CIDR:443 (interface endpoints), the S3
gateway-endpoint prefix list, RDS, and DNS only. The `ecr.api`/`ecr.dkr`
interface endpoints only proxy private ECR, so new task placements that need
to pull the sidecar image from `public.ecr.aws` time out
(`CannotPullContainerError`). Already-running tasks are unaffected since they
don't re-pull.

## Plan

### Phase 1 — parallelizable

These three have no dependency on each other and can be done in parallel:

- **A. Terraform: private ECR mirror repo**
  Add an `aws_ecr_repository` (+ lifecycle policy, KMS encryption to match
  `ecr.tf` conventions) in `terraform/otel.tf` or `terraform/ecr.tf` to hold
  the mirrored `aws-otel-collector` image.
- **B. CI guard**
  Add a CI check (e.g. a step in the existing pipeline) that fails if
  `otel_collector_image` resolves to a `public.ecr.aws` reference, so this
  class of regression can't reoccur.
- **C. Docs/runbook**
  Document the mirror-update workflow (how to re-mirror on upstream OTel
  collector releases, how to bump the pinned digest) — likely in
  `operations/` or wherever existing deploy runbooks live.

### Phase 2 — sequential (depends on Phase 1A being applied)

1. `terraform apply` to create the new private ECR repository.
2. Mirror the image: `docker pull` the public digest, retag, `docker push` to
   the new private repo. One-off script, run locally or via CI with AWS
   creds.
3. Update `otel_collector_image` default in `terraform/otel.tf` to the new
   private ECR URI, pinned by the digest of the pushed image.

### Phase 3 — verification (depends on Phase 2)

1. `terraform plan`/`apply` in the target environment with
   `otel_collector_enabled = true`.
2. Force a new ECS deployment, confirm the service stabilizes with no
   `CannotPullContainerError` events.
3. Confirm existing `--disable-otel-collector` mitigation is no longer needed.
4. Update issue #365 with results and close.

## Acceptance criteria (from issue)

- Backend ECS service deploys with `otel_collector_enabled=true` and no pull
  failures in the private-only egress setup.
- No `CannotPullContainerError` related to the OTel sidecar in ECS events.
- `terraform plan`/`apply` in prod keeps OTel enabled using the private ECR
  image.
- Deployment docs include the mirror + update steps.
