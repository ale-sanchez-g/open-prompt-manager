import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.base import create_tables
from app.api.prompts import router as prompts_router
from app.api.tags_agents import tags_router, agents_router

# Ensure data directory exists for SQLite
os.makedirs('./data', exist_ok=True)

app = FastAPI(
    title='Prompt Management Framework',
    description='A production-ready framework for managing AI prompts across agents and organizations.',
    version='1.0.0',
    docs_url='/api/docs',
    redoc_url='/api/redoc',
    openapi_url='/api/openapi.json',
)

cors_origins_env = os.getenv('CORS_ORIGINS', 'http://localhost,http://localhost:3000,http://localhost:80')
cors_origins = [o.strip() for o in cors_origins_env.split(',')]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# Create database tables on startup
create_tables()

app.include_router(prompts_router)
app.include_router(tags_router)
app.include_router(agents_router)


@app.get('/api/health')
def health_check():
    return {'status': 'ok', 'version': '1.0.0'}
