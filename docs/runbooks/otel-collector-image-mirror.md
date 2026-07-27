# OTel Collector Image Mirror Runbook

**Severity:** — (Maintenance / P4)  
**Response Time:** Next business day (planned maintenance — not an incident procedure)  
**Owner:** Platform Engineer / DevOps — TODO: fill name

---

## Overview

The backend ECS task runs the **AWS Distro for OpenTelemetry (ADOT) Collector** as a sidecar container. Upstream, that image is published to the **ECR Public Gallery** at `public.ecr.aws/aws-observability/aws-otel-collector`. The backend's VPC has **private egress only**: the security group allows outbound traffic to the VPC CIDR on 443 (interface endpoints), the S3 gateway-endpoint prefix list, RDS, and DNS. The `ecr.api` and `ecr.dkr` interface endpoints proxy **private ECR only** — they do not reach the public gallery. So any new ECS task placement that needs to pull the sidecar image times out with `CannotPullContainerError`, while already-running tasks keep working because they never re-pull. This was [issue #365](https://github.com/ale-sanchez-g/open-prompt-manager/issues/365).

The fix is a **mirror**: a private ECR repository, `${PROJECT_NAME}-otel-collector` (Terraform resource `aws_ecr_repository.otel_collector_mirror` in [terraform/otel.tf](../../terraform/otel.tf)), holds a copy of the upstream image. The `otel_collector_image` variable points at that private repository, pinned by digest, so the pull stays inside the VPC.

**The mirror is not automated.** Copying the image is a manual step, performed by an operator with AWS credentials. This runbook is that procedure.

---

## When to Run This

Run the mirror procedure when any of the following is true:

1. **Upstream ADOT Collector release** — a new version is published that you want to adopt (security fixes, new processors/exporters, a bug affecting the sidecar). Check [aws-observability/aws-otel-collector releases](https://github.com/aws-observability/aws-otel-collector/releases).
2. **The pinned digest is deprecated or removed upstream** — rare, but if the upstream image index is deleted you lose the ability to re-mirror from that digest. The private mirror keeps serving ECS regardless; you would need to pin a newer upstream digest to move forward.
3. **The mirror repository is recreated** — e.g. after a `terraform destroy`/`apply` cycle in a new environment. The repository is created empty; nothing pulls until an image is pushed into it.
4. **Standing on a stale digest** — review at least quarterly alongside the other runbooks (see [README.md — Runbook Maintenance](./README.md#runbook-maintenance)).

**Do not** run this to "fix" a live incident before reading [Failure Modes](#failure-modes) below — a `CannotPullContainerError` after the mirror exists usually means an IAM or endpoint problem, not a missing image.

---

## Prerequisites

- AWS credentials with `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, and `ecr:DescribeImages` on the mirror repository.
- Docker with `buildx` available locally (`docker buildx version`).
- The mirror repository already exists — `terraform apply` has created `aws_ecr_repository.otel_collector_mirror`.
- Write access to the repo to open a PR updating `terraform/otel.tf`.

### Establish AWS CLI Context

```bash
export AWS_REGION="ap-southeast-2"           # or your region
export PROJECT_NAME="open-prompt-manager"
export ENVIRONMENT="prod"
export CLUSTER_NAME="${PROJECT_NAME}-cluster"

export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export MIRROR_REPO="${PROJECT_NAME}-otel-collector"
export MIRROR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${MIRROR_REPO}"

echo "Mirroring into: ${MIRROR_URI}"
```

You can also read the repository URL straight out of Terraform:

```bash
cd terraform && terraform output -raw otel_collector_mirror_ecr_repository_url
```

---

## Two Constraints to Know Before You Start

**1. The mirror repository is `IMMUTABLE`.** Unlike the backend/frontend repositories, tags in `${PROJECT_NAME}-otel-collector` cannot be overwritten. Every mirror push must use a **new, unique tag** — use the upstream release version (e.g. `v0.43.0`). Pushing `latest` a second time will fail with `ImageTagAlreadyExistsException`. This is deliberate: the repository only ever holds pinned third-party mirrors, never an app rebuild that reuses a tag.

**2. The upstream image is a multi-arch index.** The Fargate task definition does not set `runtime_platform`, so it runs on the AWS default of **linux/amd64**. If you `docker pull` on an Apple Silicon machine you will get the **arm64** variant, and pushing that produces an image ECS cannot run (`image Manifest does not contain descriptor matching platform`). Use `docker buildx imagetools create` (Option A) to copy the whole index and sidestep this entirely, or pass `--platform linux/amd64` explicitly (Option B).

---

## Procedure

### Step 1: Pick the Upstream Digest

Never mirror a mutable tag. Resolve the tag you want to a digest first, and record it.

```bash
# Resolve the upstream tag to an image index digest
UPSTREAM_TAG="v0.43.0"    # the upstream release you intend to adopt
docker buildx imagetools inspect \
  "public.ecr.aws/aws-observability/aws-otel-collector:${UPSTREAM_TAG}"

# Note the top-level "Digest:" line, e.g. sha256:a465f6...
export UPSTREAM_DIGEST="sha256:<paste digest here>"
export UPSTREAM_REF="public.ecr.aws/aws-observability/aws-otel-collector@${UPSTREAM_DIGEST}"

echo "Mirroring ${UPSTREAM_REF}"
```

Read the [upstream release notes](https://github.com/aws-observability/aws-otel-collector/releases) for the version you picked before continuing — config-schema changes in the Collector can break the rendered `otel_collector_config` in `terraform/otel.tf`.

### Step 2: Authenticate to Private ECR

```bash
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin \
      "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

The public gallery does not require authentication for pulls, so no second login is needed.

### Step 3: Copy the Image

#### Option A: `buildx imagetools` (recommended)

Copies the full multi-arch index registry-to-registry without a local pull, and preserves the manifest digest so the private digest matches the upstream one.

```bash
docker buildx imagetools create \
  --tag "${MIRROR_URI}:${UPSTREAM_TAG}" \
  "${UPSTREAM_REF}"
```

#### Option B: `docker pull` / `tag` / `push` (fallback)

Use when `buildx` is unavailable. This flattens the index to a single platform, so the resulting private digest will **not** match the upstream digest — Step 4 is mandatory.

```bash
docker pull --platform linux/amd64 "${UPSTREAM_REF}"
docker tag "${UPSTREAM_REF}" "${MIRROR_URI}:${UPSTREAM_TAG}"
docker push "${MIRROR_URI}:${UPSTREAM_TAG}"
```

### Step 4: Capture the Digest in the Private Repository

This is the digest that goes into Terraform. Read it back from ECR rather than trusting the local Docker output.

```bash
aws ecr describe-images \
  --repository-name "${MIRROR_REPO}" \
  --image-ids "imageTag=${UPSTREAM_TAG}" \
  --region "${AWS_REGION}" \
  --query 'imageDetails[0].{Digest:imageDigest,Pushed:imagePushedAt,Size:imageSizeInBytes}' \
  --output table

export MIRROR_DIGEST="sha256:<paste imageDigest here>"
echo "${MIRROR_URI}@${MIRROR_DIGEST}"
```

Confirm the scan-on-push result before adopting the image:

```bash
aws ecr describe-image-scan-findings \
  --repository-name "${MIRROR_REPO}" \
  --image-id "imageTag=${UPSTREAM_TAG}" \
  --region "${AWS_REGION}" \
  --query 'imageScanFindings.findingSeverityCounts'
```

### Step 5: Update `otel_collector_image` in Terraform

Edit the `otel_collector_image` variable default in [terraform/otel.tf](../../terraform/otel.tf):

```hcl
variable "otel_collector_image" {
  description = "..."
  type        = string
  default     = "123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/open-prompt-manager-otel-collector@sha256:<MIRROR_DIGEST>"
}
```

Rules:
- **Always pin by digest** (`@sha256:...`), never by tag. A tag reference re-resolves on every task placement; a digest does not.
- **Never point this at `public.ecr.aws`.** CI enforces this — the `Terraform OTel Image Registry Check` step in [.github/workflows/ci.yml](../../.github/workflows/ci.yml) fails the build if the default matches a public registry.
- Update the variable's `description` if the upstream version it tracks has changed, so the next operator knows what is pinned.
- Open this as a normal PR; do not hand-edit Terraform state or the running task definition.

### Step 6: Plan and Apply

```bash
cd terraform

terraform plan -out=otel-mirror.tfplan \
  -var="aws_region=${AWS_REGION}" \
  -var="project_name=${PROJECT_NAME}" \
  -var="environment=${ENVIRONMENT}"

# Expect: aws_ecs_task_definition.backend replaced (new revision),
# aws_ecs_service.backend updated in-place. Nothing else should change.

terraform apply otel-mirror.tfplan
```

If the plan shows changes to resources other than the backend task definition and service, stop and investigate before applying.

### Step 7: Force a New ECS Deployment

`terraform apply` normally rolls the service on its own. Force a deployment if the service did not pick up the new revision, or to re-test a placement:

```bash
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${PROJECT_NAME}-backend-service" \
  --force-new-deployment \
  --region "${AWS_REGION}"
```

---

## Verification

### 1. The service stabilizes

```bash
aws ecs wait services-stable \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}"

aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].{RunningCount:runningCount,DesiredCount:desiredCount,Status:status}' \
  --output table
```

### 2. No `CannotPullContainerError` in service events

This is the acceptance check for #365.

```bash
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].events[:20].[createdAt,message]' \
  --output text | grep -i "CannotPull" && echo "FAILED: pull errors present" \
    || echo "OK: no pull errors in recent events"
```

Also check stopped tasks, which carry the more detailed reason:

```bash
aws ecs list-tasks \
  --cluster "${CLUSTER_NAME}" \
  --service-name "${PROJECT_NAME}-backend-service" \
  --desired-status STOPPED \
  --region "${AWS_REGION}" \
  --query 'taskArns[:5]' --output text \
| xargs -r aws ecs describe-tasks \
    --cluster "${CLUSTER_NAME}" --region "${AWS_REGION}" --tasks \
| grep -iE '"(stoppedReason|reason)"'
```

### 3. The running task uses the private image

```bash
aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${PROJECT_NAME}-backend-service" \
  --region "${AWS_REGION}" \
  --query 'services[0].taskDefinition' --output text \
| xargs -I{} aws ecs describe-task-definition \
    --task-definition {} --region "${AWS_REGION}" \
    --query 'taskDefinition.containerDefinitions[*].{Name:name,Image:image}' \
    --output table

# The otel-collector container's image must be the ${MIRROR_URI}@sha256:... URI,
# not public.ecr.aws.
```

### 4. The collector is actually running

```bash
aws logs tail "/ecs/${PROJECT_NAME}/otel-collector" \
  --since 10m --region "${AWS_REGION}"

# Expect Collector startup lines ("Everything is ready. Begin running and processing data.")
# and no repeated crash/restart loop.
```

---

## Failure Modes

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `ImageTagAlreadyExistsException` on push | Repository is `IMMUTABLE` and the tag already exists | Push under a new tag (use the upstream version string) |
| `CannotPullContainerError` still, after mirroring | Task **execution** role lacks `ecr:BatchGetImage` on the mirror repo, or the `ecr.dkr`/`ecr.api`/S3 endpoints are missing | Check `aws_iam_role.ecs_task_execution` policies and [terraform/vpc_endpoints.tf](../../terraform/vpc_endpoints.tf) |
| `image Manifest does not contain descriptor matching platform` | An arm64-only image was pushed from an Apple Silicon machine | Re-mirror with Option A, or Option B with `--platform linux/amd64` |
| Collector container starts then exits non-zero | Upstream config-schema change incompatible with the rendered `otel_collector_config` | Check the collector log group; reconcile the config with the new release's notes |
| Pull works but layers time out | S3 gateway endpoint missing (ECR layers are served from S3) | Verify the S3 prefix-list egress rule on the backend security group |

**Emergency mitigation:** if the collector blocks a deployment and cannot be fixed quickly, set `otel_collector_enabled = false` and apply. The sidecar is dropped from the task definition and the backend deploys without telemetry. Treat this as temporary and re-open the mirror work.

---

## Rollback

The previous mirrored image is still in ECR (the lifecycle policy retains the last 10 images), so rollback is a Terraform revert:

```bash
# List what is available in the mirror repo
aws ecr describe-images \
  --repository-name "${MIRROR_REPO}" \
  --region "${AWS_REGION}" \
  --query 'sort_by(imageDetails,&imagePushedAt)[*].{Tags:imageTags,Digest:imageDigest,Pushed:imagePushedAt}' \
  --output table
```

Revert the `otel_collector_image` default to the previous digest, then `terraform plan`/`apply` as in Step 6. Do not delete the bad image from ECR until the rollback is confirmed stable.

---

## Related Documentation

- [Issue #365](https://github.com/ale-sanchez-g/open-prompt-manager/issues/365) — original bug and acceptance criteria
- [terraform/otel.tf](../../terraform/otel.tf) — collector sidecar, mirror repository, `otel_collector_image`
- [terraform/vpc_endpoints.tf](../../terraform/vpc_endpoints.tf) — the ECR/S3 endpoints that make private pulls work
- [terraform/security_groups.tf](../../terraform/security_groups.tf) — the private-egress rules that caused the original failure
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — CI guard against a public-registry default
- [deploy-rollback.md](./deploy-rollback.md) — general deployment and rollback procedure
- [aws-otel-collector releases](https://github.com/aws-observability/aws-otel-collector/releases) — upstream release notes

---

## Owner

**Platform Engineer / DevOps:** — TODO: fill name  
**Observability Owner:** — TODO: fill name

---

## Change Log

Record every mirror update here so the pinned-digest history is auditable.

| Date | Upstream version | Upstream digest | Mirror digest | Operator |
|------|------------------|-----------------|---------------|----------|
| — TODO | — TODO | — TODO | — TODO | — TODO |
