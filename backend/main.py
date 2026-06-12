import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

import app.database.base as db_module
from app.database.base import create_tables
from app.api.auth import router as auth_router
from app.api.prompts import router as prompts_router
from app.api.tags_agents import tags_router, agents_router
from app import __version__
from app.middleware.rate_limit import RateLimitMiddleware
from app.services.auth_service import AuthError, TokenValidationError, decode_token

# Ensure data directory exists for SQLite
os.makedirs('./data', exist_ok=True)

# Create database tables once at startup
create_tables()


def create_app() -> FastAPI:
    """
    Application factory.

    Creates a fresh FastAPI instance.
    Call this once for production (module-level ``app`` below) and once
    per test run.
    """
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
                'name': 'auth',
                'description': 'Registration, login, refresh, and logout endpoints for JWT authentication.',
            },
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
    )

    cors_origins_env = os.getenv(
        'CORS_ORIGINS',
        'vscode-file://vscode-app',
    )
    cors_origins = [o.strip() for o in cors_origins_env.split(',')]

    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    # Rate limiting — added after CORS so it becomes the outermost middleware
    # layer and receives every request before auth and routing.
    rate_limit_enabled = os.getenv('RATE_LIMIT_ENABLED', 'true').lower() not in ('false', '0', 'no')
    rate_limit_per_minute = int(os.getenv('RATE_LIMIT_PER_MINUTE', '200'))
    rate_limit_auth_per_minute = int(os.getenv('RATE_LIMIT_AUTH_PER_MINUTE', '60'))

    application.add_middleware(
        RateLimitMiddleware,
        enabled=rate_limit_enabled,
        per_minute=rate_limit_per_minute,
        auth_per_minute=rate_limit_auth_per_minute,
    )

    @application.exception_handler(AuthError)
    async def auth_error_handler(_request: Request, exc: AuthError):
        return JSONResponse(status_code=exc.status_code, content={'error': exc.error})

    public_prefixes = ('/api/docs', '/api/redoc')
    public_paths = {'/auth/register', '/auth/login', '/auth/refresh', '/auth/logout', '/api/health', '/api/ready', '/api/openapi.json'}

    @application.middleware('http')
    async def require_authentication(request: Request, call_next):
        path = request.url.path
        if request.method == 'OPTIONS' or path in public_paths or any(path.startswith(prefix) for prefix in public_prefixes):
            return await call_next(request)
        if not path.startswith('/api'):
            return await call_next(request)

        authorization_header = request.headers.get('Authorization')
        if authorization_header is None:
            return JSONResponse(status_code=401, content={'error': 'missing_token'})

        scheme, _, token = authorization_header.partition(' ')
        if scheme.lower() != 'bearer' or not token:
            return JSONResponse(status_code=401, content={'error': 'invalid_token'})

        try:
            payload = decode_token(token, expected_type='access')
        except TokenValidationError as exc:
            return JSONResponse(status_code=401, content={'error': exc.error})

        request.state.user_id = payload['sub']
        request.state.user_email = payload['email']
        request.state.auth_user = {'sub': payload['sub'], 'email': payload['email']}
        return await call_next(request)

    application.include_router(auth_router)
    application.include_router(prompts_router)
    application.include_router(tags_router)
    application.include_router(agents_router)

    @application.get(
        '/api/health',
        tags=['health'],
        summary='Health check',
        description=(
            'Fast liveness check that returns the current application status, version, '
            'and active runtime configuration. Useful for verifying deployment settings '
            'without needing shell access. No authentication required.'
        ),
        response_description=(
            '`{ "status": "ok", "version": "<semver>", "config": { '
            '"rate_limit_enabled": true, "rate_limit_per_minute": 200, '
            '"rate_limit_auth_per_minute": 60, "cors_origins": ["..."] } }`'
        ),
    )
    def health_check():
        return {
            'status': 'ok',
            'version': __version__,
            'config': {
                'rate_limit_enabled': rate_limit_enabled,
                'rate_limit_per_minute': rate_limit_per_minute,
                'rate_limit_auth_per_minute': rate_limit_auth_per_minute,
                'cors_origins': cors_origins,
            },
        }

    @application.get(
        '/api/ready',
        tags=['health'],
        summary='Readiness check',
        description='Readiness probe that verifies database connectivity by running `SELECT 1`.',
        responses={503: {'description': 'Service not ready because the database is unavailable.'}},
        response_description='`{ "status": "ok" }`',
    )
    def readiness_check():
        try:
            with db_module.SessionLocal() as db:
                db.execute(text('SELECT 1'))
        except Exception as exc:
            raise HTTPException(status_code=503, detail='Database not ready') from exc
        return {'status': 'ok'}

    # Inject BearerAuth security scheme so the Swagger UI "Authorize" button
    # lets users supply a JWT access token for all protected endpoints.
    _original_openapi = application.openapi

    def _openapi_with_bearer():
        schema = _original_openapi()
        schema.setdefault('components', {}).setdefault('securitySchemes', {})['BearerAuth'] = {
            'type': 'http',
            'scheme': 'bearer',
            'bearerFormat': 'JWT',
            'description': 'Enter the JWT access token obtained from **POST /auth/login**.',
        }
        protected_prefix = '/api/'
        public_paths = {'/api/health', '/api/ready'}
        http_methods = {'get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'}

        for path, operations in schema.get('paths', {}).items():
            for method, operation in operations.items():
                if method not in http_methods or not isinstance(operation, dict):
                    continue
                if path.startswith(protected_prefix) and path not in public_paths:
                    operation['security'] = [{'BearerAuth': []}]
                else:
                    operation['security'] = []
        return schema

    application.openapi = _openapi_with_bearer

    return application


# Module-level app used by uvicorn in production and by the test suite.
app = create_app()
