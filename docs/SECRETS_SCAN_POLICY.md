# Secrets Scanning Policy (SPLM Week 1)

This repository enforces secrets scanning in CI via `.github/workflows/security.yml` using `gitleaks`.

## Repository-Level Controls (Implemented)

- Mandatory `Secrets Scan (gitleaks)` job on `push` and `pull_request`.
- Custom config file: `.gitleaks.toml`.
- Optional baseline support via `.gitleaks.baseline.json` (if present).
- SARIF upload to GitHub code scanning for actionable findings in PRs.
- SARIF artifact upload (`gitleaks-report`) for traceability.

## Org-Level Controls (GitHub Admin)

These controls are configured outside this repo in GitHub organization settings:

1. Enable GitHub Advanced Security and secret scanning for the organization/repository.
2. Enable push protection for supported token types.
3. Configure organization-level custom patterns (if needed).
4. Configure bypass governance:
   - Require reason for bypass.
   - Restrict bypass permissions to security owners.
5. Configure alert notifications and ownership routing.
6. Review and tune allowlists/false-positive handling monthly.

## Baseline Usage

If historical findings exist and need temporary suppression while remediating:

1. Generate baseline report locally:

```bash
gitleaks git --config .gitleaks.toml --report-format json --report-path .gitleaks.baseline.json
```

2. Commit `.gitleaks.baseline.json` if you intentionally want CI to ignore pre-existing findings.
3. Remove baseline once historical leaks are remediated.

## Governance Guidance

- Do not add broad allowlists that hide real secrets.
- Prefer file-scoped allowlists for generated artifacts only.
- Rotate credentials immediately if a real leak is detected.
