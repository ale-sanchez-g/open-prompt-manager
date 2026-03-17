import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.base import create_tables
from app.api.prompts import router as prompts_router
from app.api.tags_agents import tags_router, agents_router
from app.mcp_server import build_mcp_server

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
        title='Prompt Management Framework',
        description='A production-ready framework for managing AI prompts across agents and organizations.',
        version='1.0.0',
        docs_url='/api/docs',
        redoc_url='/api/redoc',
        openapi_url='/api/openapi.json',
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

    @application.get('/api/health')
    def health_check():
        return {'status': 'ok', 'version': '1.0.0'}

    # Mount MCP server – AI agents connect via Streamable HTTP transport.
    # The SDK's default streamable_http_path is /mcp, so the endpoint is
    # reachable at http://<host>:8000/mcp after mounting at the app root.
    # This must be the LAST mount so it does not shadow the /api/* routes.
    application.mount('/', mcp.streamable_http_app())

    return application


# Module-level app used by uvicorn in production and by the test suite.
app = create_app()

