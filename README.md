# Prompt Management Framework

A production-ready open-source framework for managing AI prompts across agents and organizations — with version control, quality metrics, and composability.

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
- **Frontend**: http://localhost
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

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

## API Reference

### Prompts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/prompts/` | List prompts (filter by tag, agent, search) |
| POST | `/prompts/` | Create new prompt |
| GET | `/prompts/{id}` | Get prompt details |
| PUT | `/prompts/{id}` | Update prompt |
| DELETE | `/prompts/{id}` | Delete prompt |
| POST | `/prompts/{id}/versions` | Create new version |
| GET | `/prompts/{id}/versions` | Get version history |
| POST | `/prompts/{id}/render` | Render prompt with variables |
| POST | `/prompts/{id}/executions` | Track an execution |
| GET | `/prompts/{id}/executions` | Get execution history |
| POST | `/prompts/{id}/metrics` | Add custom metric |
| GET | `/prompts/{id}/metrics` | Get metrics |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tags/` | List all tags |
| POST | `/tags/` | Create tag |
| DELETE | `/tags/{id}` | Delete tag |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/agents/` | List all agents |
| GET | `/agents/{id}` | Get agent |
| POST | `/agents/` | Create agent |
| PUT | `/agents/{id}` | Update agent |
| DELETE | `/agents/{id}` | Delete agent |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |

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
curl -X POST http://localhost:8000/prompts/1/render \
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
│   │   └── database/
│   │       └── base.py            # Database configuration
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
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

### Frontend
| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_API_URL` | `http://localhost:8000` | Backend API base URL |

## Version Control

Create a new version from an existing prompt:

```bash
curl -X POST http://localhost:8000/prompts/1/versions \
  -H "Content-Type: application/json" \
  -d '{"content": "Updated content here", "description": "Fixed typo in greeting"}'
```

Versions are automatically given the next patch version (e.g., `1.0.0` → `1.0.1`). Supply a custom `version` field to override.

## Tracking Executions

```bash
curl -X POST http://localhost:8000/prompts/1/executions \
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
