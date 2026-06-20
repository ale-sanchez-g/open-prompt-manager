# Documentation Update Appendix

This appendix records the documentation changes made during the repository review and why each update was necessary.

## Updated Documents

### README.md

- Updated the frontend tech stack to match the current codebase: React 19 and React Router v7.
- Corrected the Quick Start clone path from the old placeholder repository name to the current `open-prompt-manager` repository.
- Updated the frontend local development example to use `npm ci --legacy-peer-deps`, which matches the current installation guidance for this Vite-based frontend.
- Corrected the frontend environment variable from `REACT_APP_API_URL` to `VITE_API_URL`, matching `frontend/src/services/api.js`.
- Refreshed the documented frontend project structure from old `.js` entrypoints to the current `.jsx` files and added the current page modules (`LoginPage`, `RegisterPage`, `AgentDetail`, `ApiDocs`).

### CONTRIBUTING.md

- Corrected the frontend environment variable from `REACT_APP_API_URL` to `VITE_API_URL`.
- Updated the frontend testing section from Jest-era wording to the current Vitest-based setup.
- Replaced the stale frontend test command (`--watchAll=false --ci --coverage`) with the current Vitest coverage command (`npm test -- --coverage`).
- Updated guidance for new frontend routes from `src/App.js` to `src/App.jsx`.
- Updated the project-structure description so `frontend/src/__tests__/` is described as a Vitest and React Testing Library test suite.
- Added a note that the repo still carries a Jest compatibility transform in `frontend/vite.config.js`, but new tests should use Vitest syntax.

### .github/copilot-instructions.md

- Updated route-registration guidance from `src/App.js` to `src/App.jsx`.
- Replaced the stale frontend test command with the current Vitest coverage command.
- Updated the frontend testing description from Jest to Vitest.
- Corrected the exemplar file reference from `frontend/src/App.js` to `frontend/src/App.jsx`.

### .github/pull_request_template.md

- Updated the frontend test checklist example from a Jest-specific command to the current frontend test command used by this repository.

---

## Issue #147 — Backend has no throttling (2026-06-12)

### New Documents

**`docs/adr-rate-limiting.md`**

Architecture Decision Record for the IP-based sliding-window rate limiting
feature.  Documents the chosen algorithm, alternatives considered (slowapi,
Redis, nginx), default limits, trade-offs, and implementation inventory.

### Updated Documents

**`README.md`**

- Added **Rate Limiting** to the Features list.
- Added `RATE_LIMIT_ENABLED`, `RATE_LIMIT_PER_MINUTE`, and
  `RATE_LIMIT_AUTH_PER_MINUTE` to the Backend Environment Variables table.
- Added a new **Rate Limiting** subsection under Environment Variables
  documenting the endpoint groups, default limits, HTTP 429 response format
  (headers and body), and a reference to the ADR.

---

## Issue #279 — Admin panel for managing users and roles (2026-06-20)

### New Documents

**`migration/2026-jun-20-mig-002.md`**

One-off migration guide (MIG-002) for adding the `users.role` column. Documents
the additive, idempotent schema change, the "promote the first account to admin"
behaviour, local Docker and AWS ECS/RDS rollout steps, verification queries, and
the validation checklist.

### Deployment / DB Schema Upgrade

**`deploy.sh`** — Added Step 8, which upgrades the RDS schema during deployment.
After Terraform rolls out the new backend image it runs the migration modules
(`add_agent_updated_at`, `add_user_role`) as one-off ECS tasks and forces a
fresh backend deployment so the running tasks always execute against the
migrated schema.

**`scripts/migration/run_aws_migration.sh`** (new) — Reusable runner generalised
from the proven MIG-001 ECS run-task logic. Accepts one or more migration module
names, runs each as a one-off Fargate task using the backend task definition
(same image, `DATABASE_URL` secret, and private networking), waits for
completion, and fails on any non-zero exit code. Optional `FORCE_NEW_DEPLOYMENT`
rolls the service afterwards.

**`scripts/migration/2026-jun-20-aws-mig-002.sh`** (new) — Dated convenience
wrapper that invokes the runner for `migrations.add_user_role`, mirroring the
existing MIG-001 wrapper.

### Updated Documents

**`README.md`**

- Added the `/admin` frontend route (admin-only User Management page) to the
  Frontend Routes table.
- Added **Role-Based Access Control** to the Features list and noted that the
  first registered account becomes an admin and that additional admins can be
  bootstrapped via `ADMIN_EMAILS`.
- Documented `GET /auth/me` and the new **Admin (user & role management)**
  endpoint group (`GET/POST /api/admin/users`, `PATCH/DELETE
  /api/admin/users/{id}`), including the `403 admin_required` behaviour for
  non-admins.
- Added `JWT_SECRET` and `ADMIN_EMAILS` to the Backend Environment Variables
  table.
- Refreshed the backend and frontend project-structure trees to include
  `app/api/auth.py`, `app/api/admin.py`, `app/api/dependencies.py`,
  `app/services/auth_service.py`, `migrations/add_user_role.py`, and the
  frontend `UserManagement.jsx` page.

**`e2e-test/api-test-plan.md`**

- Added section **10. Admin & RBAC Tests** documenting the admin API and UI
  E2E scenarios (identity/role claims, non-admin access control, admin user &
  role management, and the admin UI panel guards).

### New E2E Tests

**`e2e-test/specs/admin/admin-api.spec.ts`** and
**`e2e-test/specs/admin/admin-ui.spec.ts`**

Playwright coverage for role-based access control: `/auth/me`, role claims in
the JWT, `403 admin_required` for non-admins, the full admin user/role CRUD
lifecycle, and the admin UI (nav visibility, route guards, user creation, and
self-protection). The `docker-compose.yml` backend now accepts `ADMIN_EMAILS`
(defaulting to `e2e-admin@opm-test.io`) so the suite has a deterministic admin,
and `playwright.config.ts` accepts an optional `E2E_BASE_URL` override.

---

## Review Scope

The review focused on documentation claims that could be directly verified against code or configuration, including:

- runtime and dependency versions
- frontend routing and file names
- local development and test commands
- frontend environment variables
- project structure and developer workflow references

Documents that already matched the implementation, including the backend API route descriptions and most of the deployment guidance, were left unchanged.