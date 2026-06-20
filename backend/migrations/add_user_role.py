import os

from sqlalchemy import create_engine, inspect, text


DEFAULT_DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./data/prompts.db')


def run_migration(database_url: str = DEFAULT_DATABASE_URL) -> bool:
    """Add the ``users.role`` column and seed an initial administrator.

    The change is additive and idempotent:

    1. Adds ``users.role`` (default ``user``) if it does not already exist.
    2. Backfills any NULL roles to ``user``.
    3. Promotes the earliest-created account to ``admin`` when no admin exists,
       so an upgraded instance is never left without an administrator.
    """
    engine = create_engine(
        database_url,
        connect_args={'check_same_thread': False} if 'sqlite' in database_url else {},
    )

    try:
        inspector = inspect(engine)
        if not inspector.has_table('users'):
            print('users table does not exist; skipping migration')
            return False

        column_exists = any(column['name'] == 'role' for column in inspector.get_columns('users'))

        with engine.begin() as connection:
            if not column_exists:
                connection.execute(
                    text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'")
                )
                print('Added users.role column')
            else:
                print('users.role already exists; ensuring data is consistent')

            connection.execute(text("UPDATE users SET role = 'user' WHERE role IS NULL"))

            admin_count = connection.execute(
                text("SELECT COUNT(*) FROM users WHERE role = 'admin'")
            ).scalar()
            if not admin_count:
                first_user_id = connection.execute(
                    text('SELECT id FROM users ORDER BY created_at ASC LIMIT 1')
                ).scalar()
                if first_user_id is not None:
                    connection.execute(
                        text('UPDATE users SET role = :role WHERE id = :id'),
                        {'role': 'admin', 'id': first_user_id},
                    )
                    print(f'Promoted user {first_user_id} to admin')

        return not column_exists
    finally:
        engine.dispose()


if __name__ == '__main__':
    run_migration()
