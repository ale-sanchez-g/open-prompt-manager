from sqlalchemy import create_engine, inspect, text

from migrations.add_agent_updated_at import run_migration


def test_add_agent_updated_at_migration_preserves_existing_data(tmp_path):
    database_path = tmp_path / 'legacy.db'
    database_url = f'sqlite:///{database_path}'
    engine = create_engine(database_url, connect_args={'check_same_thread': False})

    try:
        with engine.begin() as connection:
            connection.execute(text(
                'CREATE TABLE agents ('
                'id INTEGER NOT NULL PRIMARY KEY, '
                'name VARCHAR(255) NOT NULL UNIQUE, '
                'description TEXT, '
                'type VARCHAR(50), '
                'status VARCHAR(20), '
                'created_at DATETIME'
                ')'
            ))
            connection.execute(text(
                "INSERT INTO agents (id, name, description, type, status, created_at) VALUES "
                "(1, 'Agent One', 'legacy', 'chatbot', 'active', '2026-04-01 10:00:00'), "
                "(2, 'Agent Two', 'legacy', 'worker', 'inactive', NULL)"
            ))

        applied = run_migration(database_url)
        assert applied is True

        inspector = inspect(engine)
        columns = {column['name'] for column in inspector.get_columns('agents')}
        assert 'updated_at' in columns

        with engine.connect() as connection:
            rows = connection.execute(text(
                'SELECT id, name, created_at, updated_at FROM agents ORDER BY id'
            )).fetchall()

        assert len(rows) == 2
        assert rows[0][1] == 'Agent One'
        assert str(rows[0][2]) == '2026-04-01 10:00:00'
        assert str(rows[0][3]) == '2026-04-01 10:00:00'
        assert rows[1][1] == 'Agent Two'
        assert rows[1][3] is not None

        applied_again = run_migration(database_url)
        assert applied_again is False
    finally:
        engine.dispose()