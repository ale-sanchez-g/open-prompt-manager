# Project Guidelines — Open Prompt Manager

A production-ready open-source framework for managing AI prompts with version control, quality metrics, composability, and MCP integration. See [README.md](../README.md) for full feature list and API reference.

## Architecture

This is a monorepo with five independently testable components:

| Component | Path | Runtime | Purpose |
|-----------|------|---------|---------|
| Backend API | `backend/` | Python 3.14, FastAPI, SQLAlchemy 2.0 | REST API + MCP server |
| Frontend | `frontend/` | React 19, Tailwind CSS, React Router v7 | SPA dashboard |
| MCP Python package | `mcp-package-python/` | Python 3.14, `mcp` SDK | Standalone stdio MCP client for Claude Desktop |
| MCP Node package | `mcp-package-node/` | Node 24, `@modelcontextprotocol/sdk` | Standalone stdio MCP client for Node environments |
| Infrastructure | `terraform/`, `helm/` | Terraform, Helm 3 | AWS ECS + Kubernetes deployment |

The backend exposes both a REST API (`/api/*`) and an MCP endpoint (`/mcp`) via Streamable HTTP transport. The MCP mount **must** remain the last `app.mount()` call in `main.py` so it does not shadow `/api/*` routes.

## Code Style

### Backend (Python)

- Follow PEP 8 with 4-space indentation.
- All function signatures **must** include type hints.
- Use Pydantic v2 models (`BaseModel`, `model_config = {"from_attributes": True}`) for request/response validation — never return raw ORM objects from endpoints.
- Use SQLAlchemy 2.0 query style (`select()`, `session.execute()`). Avoid raw SQL.
- Use single quotes for strings by convention (matching the existing codebase).
- Route handlers go in `backend/app/api/`. Register new routers in `main.py`.
- Business logic goes in `backend/app/services/`. Keep route handlers thin.
- New MCP tools go in `backend/app/mcp_server.py` inside `build_mcp_server()`.

### Frontend (React / JavaScript)

- Functional components and hooks only — no class components.
- Tailwind CSS utility classes for all styling — avoid custom CSS.
- All API calls go through `src/services/api.js` via the exported axios wrappers (`promptsApi`, `tagsApi`, `agentsApi`). Never use `fetch`/`axios` directly in components.
- Register new routes in `src/App.js` and add them to the README route table.
- Icons come from `lucide-react`.

### MCP Packages

- The Python MCP package (`mcp-package-python/`) uses only `urllib` for HTTP — no `requests` or `httpx` dependency.
- The Node MCP package (`mcp-package-node/`) uses native `fetch` — no `axios` or `node-fetch`.
- Both packages are configured via `BACKEND_URL` and `API_KEY` environment variables at startup (the Python package reads them on import).

## Build & Test

```bash
# ── Backend ──────────────────────────────────────────────
cd backend
pip install -r requirements-test.txt
pytest tests/ --cov=app --cov-report=term-missing -v

# ── Frontend ─────────────────────────────────────────────
cd frontend
npm ci --legacy-peer-deps
npm test -- --watchAll=false

# ── MCP Python package ───────────────────────────────────
cd mcp-package-python
pip install -e ".[test]"
pytest tests/ -v

# ── MCP Node package ─────────────────────────────────────
cd mcp-package-node
npm ci && npm test

# ── Terraform ────────────────────────────────────────────
cd terraform
terraform init -backend=false && terraform validate && terraform test

# ── Docker (full stack) ──────────────────────────────────
make up          # start all services
make down        # stop
```

Always run the relevant test suite **before** committing. CI (`.github/workflows/ci.yml`) runs all five suites plus `pip-audit` on every push and PR.

### Testing Discipline

- **Every code change must include corresponding test updates.** New features require new tests; bug fixes require a regression test that fails without the fix.
- **Never commit code that breaks existing tests.** Run the affected suite locally before pushing.
- **Coverage threshold: ≥ 80% on new code.** Both backend (`pytest --cov`) and frontend (`npm test -- --coverage`) report coverage. PRs that drop coverage below the threshold will be flagged in review.
- Backend tests use FastAPI's `TestClient` (or `httpx.AsyncClient` for async). MCP tool tests go through the same test database thanks to `conftest.py`'s `SessionLocal` patch.
- Frontend tests use React Testing Library + Jest. Test user-visible behaviour, not implementation details.

## Conventions

### Database

- SQLite is the default (`sqlite:///./data/prompts.db`), upgradeable to PostgreSQL via `DATABASE_URL`.
- Migrations are not used yet — schema changes should be additive (`Column` additions with defaults). Destructive changes require a migration plan.
- Tests use a shared in-memory SQLite database; the `conftest.py` patches `SessionLocal` so MCP tools also hit the test database.

### Versioning

Semantic versioning across all manifests. The single source of truth is `.version` at the repo root. Never edit version strings in individual files manually — they are synced by `scripts/release/sync_versions.sh` to `backend/app/__init__.py`, `frontend/package.json`, `frontend/package-lock.json`, `mcp-package-python/pyproject.toml`, `mcp-package-node/package.json`, `mcp-package-node/package-lock.json`, and `helm/prompt-manager/Chart.yaml`.

Three versioning workflows coexist:

| Workflow | What changes | How it works |
|----------|-------------|--------------|
| **Dependabot** | Package dependencies | Opens daily PRs for pip (`backend/`) and npm (`frontend/`) updates plus weekly PRs for GitHub Actions. The `dependabot-auto-merge.yml` workflow runs backend + frontend tests and merges automatically on success. No application version bump. |
| **Release pipeline** | Application version | Triggered manually via `workflow_dispatch` on the `release.yml` workflow. Choose `patch`, `minor`, or `major`; optionally enable AI-polished release notes (Gemini). The pipeline bumps `.version`, syncs all manifests, pushes a `release/v<version>` branch, and opens a PR. When the PR merges, `release-tag.yml` creates the annotated git tag and GitHub release. |
| **Manual** | Features, fixes, infrastructure | Developer creates a feature branch (`feat/`, `fix/`, etc.), updates code and/or dependencies as needed, and opens a PR. If the change warrants a version bump, use `make bump-version BUMP=patch|minor|major` locally — the script bumps `.version` and syncs all manifests in one step. |

### Git

- Branch names: `feat/<desc>`, `fix/<desc>`, `docs/<desc>`, `chore/<desc>`
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/) — e.g. `feat(backend): add bulk tag endpoint`
- One logical change per commit. Squash WIP before opening a PR.

### Prompt Syntax

- Variables use `{{variable_name}}` — resolved at render time.
- Component references use `{{component:<prompt_id>}}` — resolved recursively with circular-reference detection.

## Error Handling

- Backend endpoints must raise `HTTPException` with appropriate status codes (`404`, `400`, `422`). Do not return error dicts with 200 status.
- Frontend API calls should handle errors in the calling component using try/catch — the `api.js` service layer does not swallow errors.
- MCP tool functions return error dicts (`{"error": "..."}`) for expected failures rather than raising exceptions, keeping the MCP session alive.

## Security

- **No hardcoded credentials or API keys.** All secrets come from environment variables (`DATABASE_URL`, `CORS_ORIGINS`, `API_KEY`, `MCP_ALLOWED_HOSTS`).
- **Validate all user inputs** server-side via Pydantic schemas. Never trust client-supplied data.
- MCP connections are protected by `MCP_ALLOWED_HOSTS` (DNS rebinding protection) configured via `TransportSecuritySettings`.
- CORS origins are explicitly allow-listed; never use `allow_origins=["*"]` in production.
- CI runs `pip-audit` on every PR to catch dependency vulnerabilities.

## Documentation

- Public functions and non-obvious algorithms should have docstrings.
- New API endpoints must be documented in the README API Reference table.
- New MCP tools must be documented in the README MCP Available Tools table.
- New frontend routes must be documented in the README Frontend Routes table.
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for full contributor guidelines.
- **Quality gate:** All PRs must pass CI (tests + `pip-audit`) and maintain ≥ 80% coverage on new code before merging.

## Key Exemplar Files

When in doubt about patterns, read these files first:

| File | What it demonstrates |
|------|---------------------|
| `backend/main.py` | App factory, MCP server mount order, CORS, lifespan |
| `backend/app/mcp_server.py` | MCP tool definitions, DB session usage, error dict returns |
| `backend/app/api/prompts.py` | Thin REST route handlers, `Depends(get_db)`, HTTPException |
| `backend/app/models/schemas.py` | Pydantic v2 schemas, `model_config = {"from_attributes": True}` |
| `backend/app/services/prompt_service.py` | Business logic, recursive component resolution, circular-ref detection |
| `backend/tests/conftest.py` | In-memory SQLite setup, `SessionLocal` patch for MCP tools |
| `frontend/src/services/api.js` | Centralized axios client, `promptsApi`/`tagsApi`/`agentsApi` wrappers |
| `frontend/src/App.js` | Route registration, layout, React Router v7 structure |

## Common Pitfalls

- **MCP mount must be last** — any `app.mount('/mcp', ...)` call before the `/api/*` routers will shadow them. Keep it last in `main.py`.
- **Never return raw ORM objects** — always wrap SQLAlchemy models in a Pydantic schema before returning from an endpoint.
- **MCP tools must return error dicts, not raise** — raising an exception tears down the MCP session. Return `{"error": "..."}` for expected failures.
- **MCP tool DB sessions** — MCP tools open `SessionLocal()` directly (not via FastAPI `Depends`). Tests patch `db_module.SessionLocal` in `conftest.py`; new tools must follow the same open/close pattern or the test DB patch won't apply.
- **Frontend: `npm ci --legacy-peer-deps` is required** — React 19 peer dep conflicts with some testing libraries; omitting the flag will fail installs.
- **Frontend: no direct fetch/axios in components** — all HTTP calls must go through `src/services/api.js` to preserve centralized auth/error handling.
- **Never edit version strings manually** — `.version` is the single source of truth; `scripts/release/sync_versions.sh` propagates it everywhere. Manual edits will be overwritten.
- **Schema changes must be additive** — no migrations exist yet; adding a non-nullable column without a default breaks existing rows.
