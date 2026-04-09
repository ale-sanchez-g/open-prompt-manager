import os

from sqlalchemy import create_engine, inspect, text


DEFAULT_DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./data/prompts.db')


def run_migration(database_url: str = DEFAULT_DATABASE_URL) -> bool:
    engine = create_engine(
        database_url,
        connect_args={'check_same_thread': False} if 'sqlite' in database_url else {},
    )

    try:
        inspector = inspect(engine)
        if any(column['name'] == 'updated_at' for column in inspector.get_columns('agents')):
            print('agents.updated_at already exists; skipping migration')
            return False

        column_type = 'DATETIME' if engine.dialect.name == 'sqlite' else 'TIMESTAMP'

        with engine.begin() as connection:
            connection.execute(text(f'ALTER TABLE agents ADD COLUMN updated_at {column_type}'))
            connection.execute(
                text(
                    'UPDATE agents '
                    'SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) '
                    'WHERE updated_at IS NULL'
                )
            )

        print('Added agents.updated_at and backfilled existing rows')
        return True
    finally:
        engine.dispose()


if __name__ == '__main__':
    run_migration()
