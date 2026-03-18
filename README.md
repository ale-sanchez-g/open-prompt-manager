# Prompt Management Framework

A production-ready open-source framework for managing AI prompts across agents and organizations — with version control, quality metrics, and composability.

## Application Overview

When you open the application, you will first land on the **Landing Page** (`/`), which introduces Prompt Manager and explains how it works. From there, clicking **Get Started** or **Go to Dashboard** takes you to the **Dashboard** (`/dashboard`) where you can view statistics, recent prompts, and quality metrics.

### Frontend Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Landing Page | Introduction to the application and how it works |
| `/dashboard` | Dashboard | Overview stats, recent prompts, and quality metrics |
| `/prompts` | Prompt List | Browse and search all prompts |
| `/prompts/new` | Prompt Editor | Create a new prompt |
| `/prompts/:id` | Prompt Detail | View a specific prompt |
| `/prompts/:id/edit` | Prompt Editor | Edit an existing prompt |
| `/tags` | Tags Management | Create and manage tags |
| `/agents` | Agents Management | Create and manage AI agents |

## Features

- **Version Control** — Full history, parent-child relationships, semantic versioning
- **Tags** — Color-coded, filterable, bulk-assignable
- **Composable Prompts** — Component references via `{{component:id}}`, recursive rendering
- **Quality Metrics** — Ratings, success rate, usage count, execution time, token count, cost
- **Agent Management** — Define agents, associate prompts, track usage, manage status
- **Variable System** — Typed variables (string, number, boolean, array, object) with validation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| Database | SQLite (upgradeable to PostgreSQL/MySQL) |
| Frontend | React 18, Tailwind CSS, React Router v6, Axios |
| Infrastructure | Docker, Kubernetes, Helm 3 |
| AI Connectivity | MCP (Model Context Protocol) via `mcp==1.23.3` |

## Quick Start

### Docker Compose (recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/prompt-management-framework
cd prompt-management-framework

# Start all services
make up
# or
docker-compose up -d
```

Access:
- **Landing Page**: http://localhost
- **Dashboard**: http://localhost/dashboard
- **Backend API**: http://localhost:8000/api
- **API Docs**: http://localhost:8000/api/docs
- **MCP Endpoint**: http://localhost:8000/mcp

### Local Development

```bash
# Backend
make dev-backend
# or
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
make dev-frontend
# or
cd frontend && npm install && npm start
```

### Frontend Build Notes (CRA)

- The frontend currently uses Create React App (`react-scripts@5`).
- Docker builds use `npm ci` (lockfile-based, deterministic installs).
- API requests default to relative `/api/*` paths so Nginx can proxy to the backend.
- Optional override for local direct backend calls: set `REACT_APP_API_URL` to backend origin (for example `http://localhost:8000`). Values ending with `/api` are also accepted.
- Tailwind CSS v4 is intentionally deferred while CRA is in use. CRA v5 is not compatible with Tailwind v4's PostCSS plugin model; migrate bundler first (for example Vite), then upgrade Tailwind.

## API Reference

### Prompts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/prompts/` | List prompts (filter by tag, agent, search) |
| POST | `/api/prompts/` | Create new prompt |
| GET | `/api/prompts/{id}` | Get prompt details |
| PUT | `/api/prompts/{id}` | Update prompt |
| DELETE | `/api/prompts/{id}` | Delete prompt |
| POST | `/api/prompts/{id}/versions` | Create new version |
| GET | `/api/prompts/{id}/versions` | Get version history |
| POST | `/api/prompts/{id}/render` | Render prompt with variables |
| POST | `/api/prompts/{id}/executions` | Track an execution |
| GET | `/api/prompts/{id}/executions` | Get execution history |
| POST | `/api/prompts/{id}/metrics` | Add custom metric |
| GET | `/api/prompts/{id}/metrics` | Get metrics |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags/` | List all tags |
| POST | `/api/tags/` | Create tag |
| DELETE | `/api/tags/{id}` | Delete tag |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents/` | List all agents |
| GET | `/api/agents/{id}` | Get agent |
| POST | `/api/agents/` | Create agent |
| PUT | `/api/agents/{id}` | Update agent |
| DELETE | `/api/agents/{id}` | Delete agent |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |

## MCP Server

Open Prompt Manager exposes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server so AI coding assistants (GitHub Copilot, Claude Code, etc.) can discover and use prompts programmatically without any custom integration code.

### Endpoint

```
POST http://localhost:8000/mcp
```

The server uses the **Streamable HTTP** transport (`stateless_http=True`), which means every request is self-contained — no persistent session is required.

### Available Tools

| Tool | Description |
|------|-------------|
| `list_prompts` | List prompts, optionally filtered by a search string |
| `get_prompt` | Retrieve a single prompt by ID |
| `render_prompt` | Render a prompt, substituting variables and resolving components |
| `create_prompt` | Create a new prompt |
| `list_tags` | List all tags |
| `create_tag` | Create a new tag |
| `list_agents` | List all registered agents |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ALLOWED_HOSTS` | `localhost,localhost:8000,127.0.0.1,127.0.0.1:8000` | Comma-separated list of host names allowed to connect to the MCP endpoint (DNS rebinding protection). Add your production domain here. |

### Connect from VS Code (GitHub Copilot)

Create or update `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "open-prompt-manager": {
      "type": "http",
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

Open the **Chat** panel in VS Code, switch to **Agent mode**, and your prompts will be available as context tools.

### Connect from Claude Code

```bash
claude mcp add --transport http open-prompt-manager http://localhost:8000/mcp
```

Verify the server is registered:

```bash
claude mcp list
```

Claude Code will now be able to call `list_prompts`, `get_prompt`, `render_prompt`, `create_prompt`, `list_tags`, `create_tag`, and `list_agents` as tools during conversations.

### Production Deployment

When running behind a load balancer or reverse proxy, allow the production host:

```bash
MCP_ALLOWED_HOSTS="localhost,localhost:8000,prompt-manager.yourdomain.com" docker-compose up -d
```

The AWS ALB listener rule in `terraform/alb.tf` already routes `/mcp` and `/mcp/*` requests to the backend target group.

## Prompt Syntax

### Variables
Use `{{variable_name}}` in prompt content:
```
You are a helpful assistant. The user's name is {{user_name}} and they need help with {{topic}}.
```

### Component References
Reference other prompts as reusable components:
```
{{component:42}}

Now respond to: {{user_message}}
```

### Render Example

```bash
curl -X POST http://localhost:8000/api/prompts/1/render \
  -H "Content-Type: application/json" \
  -d '{"variables": {"user_name": "Alice", "topic": "Python"}}'
```

## Project Structure

```
prompt-management-framework/
├── backend/
│   ├── app/
│   │   ├── models/
│   │   │   ├── prompt.py          # SQLAlchemy models
│   │   │   └── schemas.py         # Pydantic schemas
│   │   ├── api/
│   │   │   ├── prompts.py         # Prompt endpoints
│   │   │   └── tags_agents.py     # Tags and Agents endpoints
│   │   ├── services/
│   │   │   └── prompt_service.py  # Business logic
│   │   ├── database/
│   │   │   └── base.py            # Database configuration
│   │   └── mcp_server.py          # MCP server (AI agent connectivity)
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.js
│   │   │   ├── Dashboard.js
│   │   │   ├── PromptList.js
│   │   │   ├── PromptEditor.js
│   │   │   ├── PromptDetail.js
│   │   │   ├── TagsManagement.js
│   │   │   └── AgentsManagement.js
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.js
│   │   └── index.js
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
├── helm/
│   └── prompt-manager/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
├── docker-compose.yml
├── Makefile
└── README.md
```

## Kubernetes / Helm Deployment

```bash
# Build and push images
make build VERSION=1.0.0 REGISTRY=your-registry
make push VERSION=1.0.0 REGISTRY=your-registry

# Deploy with Helm
make helm-install VERSION=1.0.0 REGISTRY=your-registry

# Upgrade existing deployment
make helm-upgrade VERSION=1.1.0 REGISTRY=your-registry

# Uninstall
make helm-uninstall
```

### Custom values

```bash
helm install prompt-manager ./helm/prompt-manager \
  --set backend.image.repository=your-registry/backend \
  --set backend.image.tag=1.0.0 \
  --set frontend.image.repository=your-registry/frontend \
  --set frontend.image.tag=1.0.0 \
  --set ingress.hosts[0].host=prompt-manager.yourdomain.com
```

## Environment Variables

### Backend
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./data/prompts.db` | Database connection string |
| `CORS_ORIGINS` | `http://localhost,http://localhost:3000` | Comma-separated allowed CORS origins |
| `MCP_ALLOWED_HOSTS` | `localhost,localhost:8000,127.0.0.1,127.0.0.1:8000` | Comma-separated host names allowed to connect to the MCP endpoint |

### Frontend
| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_API_URL` | `` (same origin) | Backend API base URL — leave empty when deploying behind a reverse proxy or ALB. Set to the full backend URL (e.g. `http://localhost:8000`) only for standalone local development. |

## Version Control

Create a new version from an existing prompt:

```bash
curl -X POST http://localhost:8000/api/prompts/1/versions \
  -H "Content-Type: application/json" \
  -d '{"content": "Updated content here", "description": "Fixed typo in greeting"}'
```

Versions are automatically given the next patch version (e.g., `1.0.0` → `1.0.1`). Supply a custom `version` field to override.

## Tracking Executions

```bash
curl -X POST http://localhost:8000/api/prompts/1/executions \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": 2,
    "input_variables": {"user_name": "Alice"},
    "rendered_prompt": "Hello Alice...",
    "response": "How can I help?",
    "execution_time_ms": 342,
    "token_count": 128,
    "cost": 0.0004,
    "success": 1,
    "rating": 5
  }'
```

Execution stats (`avg_rating`, `success_rate`, `usage_count`) are automatically updated on the prompt.

## License

MIT License — see [LICENSE](LICENSE) for details.
