# Contributing to Open Prompt Manager

Thank you for your interest in contributing! Open Prompt Manager is a community-driven project and we welcome all kinds of contributions — bug fixes, new features, documentation improvements, tests, and more.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Adding New Features](#adding-new-features)

---

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) Code of Conduct. By participating, you are expected to be respectful, inclusive, and constructive in all interactions. Please report unacceptable behaviour by opening an issue.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/open-prompt-manager.git
   cd open-prompt-manager
   ```
3. **Add the upstream remote** so you can stay up to date:
   ```bash
   git remote add upstream https://github.com/ale-sanchez-g/open-prompt-manager.git
   ```
4. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/my-awesome-feature
   ```

---

## How to Contribute

| Type | Description |
|------|-------------|
| Bug fix | Fix a broken behaviour documented in an issue |
| Feature | Implement a new capability (open an issue first for discussion) |
| Documentation | Improve or expand the README, code comments, or this file |
| Tests | Add missing test coverage for existing code |
| Refactor | Improve code quality without changing behaviour |
| Infrastructure | Helm, Terraform, Docker, or CI improvements |

For non-trivial changes, **open an issue first** to discuss your approach before writing code. This avoids duplicated effort and ensures the change aligns with project goals.

---

## Development Setup

### Prerequisites

| Tool | Minimum version |
|------|----------------|
| Docker & Docker Compose | 24.x |
| Python | 3.11 |
| Node.js | 20.x |
| npm | 9.x |

### Option A — Docker Compose (recommended)

```bash
make up
# or
docker-compose up -d
```

Services will be available at:

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost:8000/api |
| API Docs (Swagger) | http://localhost:8000/api/docs |
| MCP Endpoint | http://localhost:8000/mcp |

### Option B — Local development servers

Run each in a separate terminal:

```bash
# Backend (hot-reload enabled)
make dev-backend
# or: cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# Frontend (hot-reload enabled)
make dev-frontend
# or: cd frontend && npm install && npm start
```

### Environment variables

Copy and adjust as needed — defaults work for local development out of the box.

**Backend** (`backend/`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./data/prompts.db` | Database connection string |
| `CORS_ORIGINS` | `http://localhost,http://localhost:80,http://localhost:3000` | Allowed CORS origins |
| `MCP_ALLOWED_HOSTS` | `localhost,localhost:8000,127.0.0.1,127.0.0.1:8000` | Hosts allowed to connect to the MCP endpoint |

**Frontend** (`frontend/`):

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_API_URL` | *(empty)* | Backend base URL — leave empty when using a reverse proxy |

---

## Project Structure

```
open-prompt-manager/
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI route handlers
│   │   ├── models/        # SQLAlchemy models & Pydantic schemas
│   │   ├── services/      # Business logic
│   │   ├── database/      # DB engine & session
│   │   └── mcp_server.py  # MCP tool definitions
│   ├── tests/             # pytest test suite
│   ├── main.py
│   ├── requirements.txt
│   └── requirements-test.txt
├── frontend/
│   ├── src/
│   │   ├── pages/         # React page components
│   │   ├── services/      # Axios API client
│   │   └── __tests__/     # Jest test suite
│   └── package.json
├── helm/                  # Helm chart for Kubernetes
├── terraform/             # AWS infrastructure (ECS, RDS, ALB, VPC)
├── docker-compose.yml
├── Makefile
└── README.md
```

---

## Coding Standards

### Backend (Python)

- **Style**: Follow [PEP 8](https://peps.python.org/pep-0008/). Use 4-space indentation.
- **Type hints**: All function signatures must include Python type hints.
- **Schemas**: Use Pydantic v2 models for request/response validation — never return raw ORM objects from endpoints.
- **Database**: Use SQLAlchemy 2.0 style (`select()`, `session.execute()`). Avoid raw SQL strings.
- **New endpoints**: Add them to the appropriate router in `backend/app/api/`. Register the router in `main.py`.
- **New MCP tools**: Define them in `backend/app/mcp_server.py` and document them in the README.

### Frontend (React / JavaScript)

- **Style**: Use functional components and React hooks. No class components.
- **CSS**: Use Tailwind CSS utility classes. Avoid custom CSS unless absolutely necessary.
- **API calls**: Go through `src/services/api.js`. Do not call `fetch`/`axios` directly from components.
- **Routing**: Add new pages to `src/App.js` and document the route in the README.

### Git

- **Branch naming**: `feat/<short-description>`, `fix/<short-description>`, `docs/<short-description>`, `chore/<short-description>`
- **Commit messages**: Use the [Conventional Commits](https://www.conventionalcommits.org/) format:
  ```
  feat(backend): add bulk tag assignment endpoint
  fix(frontend): correct version display in PromptDetail
  docs: update MCP connection instructions
  ```
- **Keep commits focused**: One logical change per commit. Squash WIP commits before opening a PR.

---

## Testing

All CI checks must pass before a PR can be merged. Run them locally before pushing:

### Backend

```bash
cd backend
pip install -r requirements-test.txt
pytest tests/ --cov=app --cov-report=term-missing -v
```

- Tests live in `backend/tests/`.
- Aim for **≥ 80% coverage** on any new code you add.
- Use FastAPI's `TestClient` for API integration tests (see existing examples in `backend/tests/`). For advanced async scenarios, you may also use `httpx.AsyncClient`.

### Frontend

```bash
cd frontend
npm ci --legacy-peer-deps
npm test -- --watchAll=false --ci --coverage
```

- Tests live in `frontend/src/__tests__/`.
- Use [React Testing Library](https://testing-library.com/react) for component tests.
- Mock API calls via `jest.mock('../services/api')`.

### Full stack (Docker Compose smoke test)

```bash
make up
curl http://localhost:8000/api/health
# Expected: {"status":"ok","version":"0.1.0"}
```

---

## Submitting a Pull Request

1. **Sync with upstream** before opening your PR:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```
2. **Push** your branch to your fork:
   ```bash
   git push -u origin feat/my-awesome-feature
   ```
3. **Open a Pull Request** against the `main` branch of this repository.
4. **Fill in the PR template** — description, motivation, test plan, and screenshots (for UI changes).
5. **Respond to review comments** promptly. Unaddressed reviews after 14 days may result in the PR being closed.

### PR checklist

- [ ] All CI checks pass (backend tests, frontend tests, Docker build, E2E smoke test)
- [ ] New behaviour is covered by tests
- [ ] Documentation updated (README, inline comments) where relevant
- [ ] No secrets, credentials, or environment-specific values committed
- [ ] Commits follow Conventional Commits format

---

## Reporting Bugs

Open a **Bug Report** issue and include:

- A clear description of the unexpected behaviour
- Steps to reproduce (minimal reproduction preferred)
- Expected vs actual result
- Environment: OS, Python version, Node version, Docker version
- Relevant logs or screenshots

---

## Requesting Features

Open a **Feature Request** issue and include:

- The problem you are trying to solve
- Your proposed solution or API design
- Alternatives you considered
- Any relevant prior art or references

Large features benefit from an initial discussion before implementation begins — this ensures the design fits the project's direction and avoids wasted effort.

---

## Adding New Features — Step-by-Step Guide

Here is the typical workflow for adding a new capability end-to-end:

### 1. Backend — data model

Add or extend a SQLAlchemy model in `backend/app/models/prompt.py` and a matching Pydantic schema in `backend/app/models/schemas.py`. The database schema is managed at startup via `create_tables()` (which calls `Base.metadata.create_all`), so changes to the models will be applied when you restart the backend. For breaking schema changes in development, you may need to drop and recreate your local database.

### 2. Backend — service layer

Add business logic to `backend/app/services/prompt_service.py` (or create a new service file). Keep route handlers thin — they should only validate input and delegate to the service layer.

### 3. Backend — API endpoint

Add the endpoint to the relevant router in `backend/app/api/`. Register any new router in `main.py`. Document the new route in the README API reference table.

### 4. Backend — MCP tool (optional)

If the feature should be available to AI agents, expose it as an MCP tool in `backend/app/mcp_server.py`. Follow the existing pattern: define the tool schema and handler, then register it with `@mcp.tool()`.

### 5. Backend — tests

Write pytest tests in `backend/tests/`. Cover the happy path, validation errors, and edge cases.

### 6. Frontend — API client

Add the corresponding API call to `frontend/src/services/api.js`.

### 7. Frontend — UI

Add or update a page in `frontend/src/pages/`. Register the route in `frontend/src/App.js` and update the README route table.

### 8. Frontend — tests

Add Jest tests in `frontend/src/__tests__/`. Mock the API service and cover key user interactions.

### 9. Documentation

Update the README with any new environment variables, API routes, MCP tools, or configuration options.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) that covers this project.
