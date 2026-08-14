import os

from sqlalchemy import create_engine, inspect

from app.models.llm_provider_config import LLMProviderConfig


DEFAULT_DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./data/prompts.db')


def run_migration(database_url: str = DEFAULT_DATABASE_URL) -> bool:
    engine = create_engine(
        database_url,
        connect_args={'check_same_thread': False} if 'sqlite' in database_url else {},
    )

    try:
        inspector = inspect(engine)
        if inspector.has_table('llm_provider_configs'):
            print('llm_provider_configs table already exists; skipping migration')
            return False

        LLMProviderConfig.__table__.create(bind=engine, checkfirst=True)

        print('Created llm_provider_configs table')
        return True
    finally:
        engine.dispose()


if __name__ == '__main__':
    run_migration()
