## SPLM CI Uplift Plan

### Objective
Implement and operationalize all SPLM CI gate components across pre-commit, pre-build, and post-build phases with measurable quality, security, and governance controls.

### Status Legend
- [ ] Not started
- [~] In progress
- [x] Completed

## 1. Stabilize Gate Structure (Week 1)
- [x] Define required gate groups in branch protection: pre-commit, pre-build, post-build.
- [x] Configure required checks so merges are blocked unless all gate checks pass.
- [x] Standardize workflow permissions to least privilege per job.
- [x] Acceptance check: every PR shows clear gate progression and enforced required checks.

## 2. Pre-Commit Gate Uplift (Week 1-2)

### 2.1 Secrets Scan
- [x] Keep current secret scanning and tune allowlist/baseline to reduce false positives.
- [x] Configure optional baseline file and org-level secret scanning policy.
- [x] Acceptance check: scan is mandatory on PRs and findings are actionable.

### 2.2 Linting and Validation
- [x] Add fast lint + format validation for backend, frontend, MCP packages, and Terraform format check.
- [x] Add tool configs and pin tool versions.
- [x] Add shared lint script targets.
- [x] Acceptance check: pipelines fail fast on style/syntax issues before build jobs.

## 3. Pre-Build Gate Uplift (Week 2-4)

### 3.1 Linting
- [x] Split linting by stack with matrix jobs for isolated/faster feedback.
- [x] Acceptance check: lint coverage includes backend, frontend, mcp-package-python, mcp-package-node, and terraform.

### 3.2 Secrets Scan
- [x] Keep existing secret scanning.
- [x] Add PR annotation output for findings.
- [x] Acceptance check: findings are visible in PR summary.

### 3.3 Dependency Scan / SCA
- [ ] Include missing package domains and align severity policy.
- [ ] Fail on high/critical vulnerabilities (with managed exceptions).
- [ ] Add ignore policy with expiry dates.
- [ ] Upload machine-readable reports (for traceability).
- [ ] Acceptance check: all package ecosystems are scanned consistently.

### 3.4 SAST
- [ ] Keep backend SAST and add frontend and IaC static security checks.
- [ ] Define severity thresholds and suppression governance.
- [ ] Acceptance check: SAST covers app + IaC with standardized fail policy.

### 3.5 Code Quality Scan
- [ ] Enforce quality gate with coverage minimum.
- [ ] Add optional duplication/complexity checks.
- [ ] Acceptance check: CI fails when thresholds are breached and reports are attached to PR.

### 3.6 Version Pinning Check
- [ ] Add dependency pin/lock integrity verification.
- [ ] Add drift detection for manifests/lockfiles.
- [ ] Acceptance check: unpinned or drifted dependencies fail CI.

### 3.7 IaC Scan
- [ ] Add Terraform static policy/security checks before plan stage.
- [ ] Configure policy pack and severity gate.
- [ ] Acceptance check: Terraform changes are blocked on findings above threshold.

## 4. Post-Build Gate Uplift (Week 4-6)

### 4.1 Terraform Workflow Chain
- [x] terraform init
- [x] terraform fmt -check
- [x] terraform validate
- [ ] terraform plan in PR context using read-only cloud identity (OIDC)

### 4.2 Cost Estimation
- [ ] Add cost diff output on PR.
- [ ] Add budget breach policy threshold.

### 4.3 Policy Compliance Gate
- [ ] Evaluate plan JSON against policy framework.
- [ ] Configure mandatory policy checks.

### 4.4 Plan Summary Output
- [ ] Publish concise PR summary: adds/changes/destroys + risk flags.

### 4.5 TF Plan Uploaded to Artifact Store
- [ ] Store binary and JSON plan artifacts with retention policy.

### 4.6 TF Plan Reviewed and Approved
- [ ] Enforce infra-owner approval for Terraform paths.
- [ ] Add and configure CODEOWNERS.

## 5. Cross-Cutting Configuration (Parallel, Week 1-6)
- [ ] Secrets/variables inventory (release, cloud identity, scanner/tool credentials).
- [ ] Runner strategy decision (hosted vs self-hosted for plan/cost jobs).
- [ ] Unified failure policy by gate and severity.
- [ ] Unified CI summary per run with pass/fail and top findings.
- [ ] Exception governance process with owner, expiry, and audit trail.

## 6. Execution Sequence
1. Week 1: Branch protection + lint/format quick wins.
2. Week 2: SCA parity and threshold policy.
3. Week 3: SAST + IaC static scans.
4. Week 4: Quality gate hard enforcement (coverage + quality).
5. Week 5: Terraform plan + artifacts + summary.
6. Week 6: Cost + policy gate + CODEOWNERS enforcement.

## 7. Success Metrics
- [ ] PR lead time increase capped (target: <= 15%).
- [ ] Gate reliability > 98% successful reruns without flakiness.
- [ ] 100% ecosystem coverage in SCA/SAST/IaC scans.
- [ ] 100% Terraform PRs include plan summary and owner approval.
- [ ] 100% PRs meet defined coverage/quality thresholds.

## 8. Progress Log
- 2026-04-14: Initial uplift plan documented.
- 2026-04-14: Added pre-commit lint/validation CI gate (Python ruff syntax rules, frontend oxlint, mcp-node oxlint, terraform fmt check).
- 2026-04-14: Implemented secrets-scan uplift with repo-level gitleaks config, optional baseline support (.gitleaks.baseline.json), and SARIF upload for actionable findings in PRs.
- 2026-04-14: Added terraform fmt -check in CI terraform job and formatted terraform files to satisfy the new gate.
- 2026-04-14: Hardened dependabot workflow permissions toward least-privilege model.
- 2026-04-14: Applied branch protection on main via GitHub API with strict required checks, required PR review (1 approval), dismiss stale reviews, conversation resolution, and admin enforcement.
- 2026-04-17: Started Pre-Build Gate Uplift by adding stack-split lint matrix job in CI for backend, frontend, mcp-package-python, mcp-package-node, and terraform.
- 2026-04-17: Added gitleaks PR annotations and sticky PR summary comment so secret findings are visible directly in PR context.

