from sqlalchemy import create_engine, inspect, text

from migrations.add_user_role import run_migration


def _create_legacy_users_table(engine):
    with engine.begin() as connection:
        connection.execute(text(
            'CREATE TABLE users ('
            'id VARCHAR(32) NOT NULL PRIMARY KEY, '
            'email VARCHAR(255) NOT NULL UNIQUE, '
            'password_hash VARCHAR(255) NOT NULL, '
            'created_at DATETIME'
            ')'
        ))
        connection.execute(text(
            "INSERT INTO users (id, email, password_hash, created_at) VALUES "
            "('usr_first', 'first@opm.io', 'hash1', '2026-01-01 10:00:00'), "
            "('usr_second', 'second@opm.io', 'hash2', '2026-02-01 10:00:00')"
        ))


def test_add_user_role_migration_adds_column_and_promotes_first_user(tmp_path):
    database_path = tmp_path / 'legacy.db'
    database_url = f'sqlite:///{database_path}'
    engine = create_engine(database_url, connect_args={'check_same_thread': False})

    try:
        _create_legacy_users_table(engine)

        applied = run_migration(database_url)
        assert applied is True

        inspector = inspect(engine)
        columns = {column['name'] for column in inspector.get_columns('users')}
        assert 'role' in columns

        with engine.connect() as connection:
            rows = connection.execute(text(
                'SELECT id, role FROM users ORDER BY created_at'
            )).fetchall()

        roles = {row[0]: row[1] for row in rows}
        assert roles['usr_first'] == 'admin'
        assert roles['usr_second'] == 'user'

        # Idempotent: a second run makes no schema change.
        applied_again = run_migration(database_url)
        assert applied_again is False
    finally:
        engine.dispose()


def test_add_user_role_migration_skips_when_admin_exists(tmp_path):
    database_path = tmp_path / 'legacy.db'
    database_url = f'sqlite:///{database_path}'
    engine = create_engine(database_url, connect_args={'check_same_thread': False})

    try:
        with engine.begin() as connection:
            connection.execute(text(
                'CREATE TABLE users ('
                'id VARCHAR(32) NOT NULL PRIMARY KEY, '
                'email VARCHAR(255) NOT NULL UNIQUE, '
                'password_hash VARCHAR(255) NOT NULL, '
                "role VARCHAR(20) NOT NULL DEFAULT 'user', "
                'created_at DATETIME'
                ')'
            ))
            connection.execute(text(
                "INSERT INTO users (id, email, password_hash, role, created_at) VALUES "
                "('usr_a', 'a@opm.io', 'h', 'user', '2026-01-01 10:00:00'), "
                "('usr_b', 'b@opm.io', 'h', 'admin', '2026-02-01 10:00:00')"
            ))

        # Column already exists, so no schema change is applied.
        applied = run_migration(database_url)
        assert applied is False

        with engine.connect() as connection:
            rows = connection.execute(text('SELECT id, role FROM users ORDER BY id')).fetchall()
        roles = {row[0]: row[1] for row in rows}
        # The first user is NOT promoted because an admin already exists.
        assert roles['usr_a'] == 'user'
        assert roles['usr_b'] == 'admin'
    finally:
        engine.dispose()


def test_add_user_role_migration_skips_without_users_table(tmp_path):
    database_path = tmp_path / 'empty.db'
    database_url = f'sqlite:///{database_path}'
    engine = create_engine(database_url, connect_args={'check_same_thread': False})
    try:
        assert run_migration(database_url) is False
    finally:
        engine.dispose()
