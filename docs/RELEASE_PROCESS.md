# Release Process

This repository supports manually requested releases through the GitHub Actions workflow at `.github/workflows/release.yml`.

## Prerequisites

- Maintainer access to run workflows and push tags on `main`.
- Repository setting that allows GitHub Actions to create and approve commits with `GITHUB_TOKEN`.
- Optional for AI-polished notes:
   - Repository secret: `GEMINI_API_KEY`
  - Optional repository variables:
      - `GEMINI_BASE_URL` (default: `https://generativelanguage.googleapis.com/v1beta/openai`)
      - `GEMINI_MODEL` (default: `gemini-2.0-flash`)

## Manual Release Steps

1. Open Actions in GitHub and run the workflow named Release.
2. Choose inputs:
   - `bump_type`: `patch`, `minor`, or `major`
   - `target_ref`: usually `main`
   - `use_ai_notes`: `true` or `false`
3. The workflow will:
   - Call `scripts/release/build_release_notes.sh` to generate deterministic release notes and optionally polish them with AI.
   - Bump `.version` and synchronize all versioned manifests.
   - Commit release metadata.
   - Tag the commit as `vX.Y.Z`.
   - Publish a GitHub Release.

## Release Scripts

- `scripts/release/build_release_notes.sh <use_ai_notes> <draft_file> <final_file>`
- `scripts/release/generate_release_notes_draft.sh <previous_tag> <output_file>`
- `scripts/release/polish_release_notes_gemini.py <input_file> <output_file>`
- `scripts/release/bump_version.sh <major|minor|patch>`
- `scripts/release/sync_versions.sh <version>`

## Files Updated by Version Sync

- `.version`
- `backend/app/__init__.py`
- `frontend/package.json`
- `mcp-package-node/package.json`
- `mcp-package-python/pyproject.toml`
- `helm/prompt-manager/Chart.yaml`
- `helm/prompt-manager/values.yaml`

## Failure and Fallback Behavior

- If AI note generation is disabled or unavailable, deterministic notes are used.
- If the target tag already exists, the workflow fails safely before pushing.
- If commit push fails due to branch protection, no release is created.

## Rollback

If a bad release is created:

1. Revert the release commit on `main`.
2. Delete the GitHub Release for the incorrect tag.
3. Delete the tag locally and remotely:
   - `git tag -d vX.Y.Z`
   - `git push origin :refs/tags/vX.Y.Z`
4. Run the release workflow again with the correct version bump.
