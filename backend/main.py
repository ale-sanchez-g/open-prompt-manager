import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.base import create_tables
from app.api.prompts import router as prompts_router
from app.api.tags_agents import tags_router, agents_router
from app.mcp_server import build_mcp_server
from app import __version__

# Ensure data directory exists for SQLite
os.makedirs('./data', exist_ok=True)

# Create database tables once at startup
create_tables()


def create_app() -> FastAPI:
    """
    Application factory.

    Creates a fresh FastAPI instance together with its own MCP server.
    Call this once for production (module-level ``app`` below) and once
    per test run so that each test gets an isolated MCP session manager.
    """
    mcp = build_mcp_server()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        """Start the MCP session manager alongside the FastAPI app."""
        async with mcp.session_manager.run():
            yield

    application = FastAPI(
        title='Open Prompt Manager API',
        description=(
            '## Overview\n\n'
            'The Open Prompt Manager REST API lets you **create**, **version**, **render**, and **track** '
            'AI prompts across agents and organisations.\n\n'
            '### Key Concepts\n\n'
            '- **Prompt** — A versioned template with typed variables and optional component references.\n'
            '- **Version** — A child prompt that inherits from a parent. Version history forms a tree; '
            '  `is_latest: true` marks the leaf node.\n'
            '- **Tag** — A colour-coded label for organising and filtering prompts.\n'
            '- **Agent** — An AI agent that is associated with prompts and whose executions are tracked.\n'
            '- **Execution** — A record of one LLM call, including cost, latency, tokens, and a rating.\n'
            '- **Metric** — A custom numeric measurement (e.g. `latency_p99`, `hallucination_rate`).\n\n'
            '### Variable Syntax\n\n'
            'Use `{{variable_name}}` in prompt content for dynamic substitution at render time.\n\n'
            '### Component Syntax\n\n'
            'Use `{{component:<id>}}` to embed another prompt by its integer ID. '
            'Components are resolved recursively; circular references are rejected with HTTP 422.\n\n'
            '### Pagination\n\n'
            'List endpoints accept `skip` (offset) and `limit` (max 200) query parameters.\n\n'
            '### Error Responses\n\n'
            '| Status | Meaning |\n'
            '|--------|---------|\n'
            '| 400 | Bad request — invalid input |\n'
            '| 404 | Resource not found |\n'
            '| 409 | Conflict — duplicate name |\n'
            '| 422 | Validation error — missing required field or circular reference |\n'
        ),
        version=__version__,
        docs_url='/api/docs',
        redoc_url='/api/redoc',
        openapi_url='/api/openapi.json',
        contact={
            'name': 'Open Prompt Manager',
            'url': 'https://github.com/ale-sanchez-g/open-prompt-manager',
        },
        license_info={
            'name': 'MIT',
            'url': 'https://opensource.org/licenses/MIT',
        },
        openapi_tags=[
            {
                'name': 'prompts',
                'description': (
                    'Create, read, update, and delete prompts. '
                    'Manage version history, render templates with variables, '
                    'record executions, and track custom quality metrics.'
                ),
            },
            {
                'name': 'tags',
                'description': 'Manage colour-coded labels used to organise and filter prompts.',
            },
            {
                'name': 'agents',
                'description': (
                    'Register and manage AI agents. '
                    'Associate agents with prompts and review aggregate execution statistics.'
                ),
            },
            {
                'name': 'health',
                'description': 'Liveness / readiness check endpoint.',
            },
        ],
        lifespan=lifespan,
    )

    cors_origins_env = os.getenv('CORS_ORIGINS', 'http://localhost,http://localhost:3000,http://localhost:80')
    cors_origins = [o.strip() for o in cors_origins_env.split(',')]

    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    application.include_router(prompts_router)
    application.include_router(tags_router)
    application.include_router(agents_router)

    @application.get(
        '/api/health',
        tags=['health'],
        summary='Health check',
        description='Returns the current application status and version. Used by the frontend to display the app version in the sidebar.',
        response_description='`{ "status": "ok", "version": "<semver>" }`',
    )
    def health_check():
        return {'status': 'ok', 'version': __version__}

    # Mount MCP server – AI agents connect via Streamable HTTP transport.
    # The SDK's default streamable_http_path is /mcp, so the endpoint is
    # reachable at http://<host>:8000/mcp after mounting at the app root.
    # This must be the LAST mount so it does not shadow the /api/* routes.
    application.mount('/', mcp.streamable_http_app())

    return application


# Module-level app used by uvicorn in production and by the test suite.
app = create_app()

