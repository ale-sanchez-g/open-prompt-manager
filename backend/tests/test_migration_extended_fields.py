"""Tests for the expand-phase migration (OPM-FLAG-REG-001, Stage 1).

The migration must be safe to run on every deploy against three shapes of
database: a legacy one that predates the feature, one already migrated, and a
fresh one created from the ORM model by ``create_tables()``.

Modelled on ``test_migration_user_role.py``.
"""

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.database.base import Base
from app.models.auth import User  # noqa: F401  (populates Base.metadata)
from migrations.add_user_extended_fields import column_definitions, run_migration


EXTENDED_COLUMNS = {
    'company_name',
    'job_role',
    'phone',
    'marketing_opt_in',
    'marketing_consent_at',
    'marketing_consent_version',
}

# Everything except marketing_opt_in, which carries a DEFAULT and is therefore
# backfilled rather than left null. See test_existing_rows_are_unaffected.
NULLABLE_TEXT_COLUMNS = EXTENDED_COLUMNS - {'marketing_opt_in'}


def _engine(tmp_path, name='legacy.db'):
    return create_engine(
        f'sqlite:///{tmp_path / name}', connect_args={'check_same_thread': False}
    )


def _create_legacy_users_table(engine):
    """A ``users`` table as it exists today, before this migration."""
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
            'INSERT INTO users (id, email, password_hash, role, created_at) VALUES '
            "('usr_first', 'first@opm.io', 'hash1', 'admin', '2026-01-01 10:00:00'), "
            "('usr_second', 'second@opm.io', 'hash2', 'user', '2026-02-01 10:00:00')"
        ))


def _columns(engine):
    return {column['name']: column for column in inspect(engine).get_columns('users')}


# --- schema change ---------------------------------------------------------


def test_migration_adds_all_six_columns(tmp_path):
    engine = _engine(tmp_path)
    try:
        _create_legacy_users_table(engine)
        assert not EXTENDED_COLUMNS & set(_columns(engine))

        assert run_migration(str(engine.url)) is True

        assert EXTENDED_COLUMNS <= set(_columns(engine))
    finally:
        engine.dispose()


def test_migrated_schema_matches_the_orm_schema(tmp_path):
    """Fresh-DB path and migrated-DB path must produce the same columns."""
    migrated = _engine(tmp_path, 'migrated.db')
    fresh = _engine(tmp_path, 'fresh.db')
    try:
        _create_legacy_users_table(migrated)
        run_migration(str(migrated.url))
        Base.metadata.create_all(bind=fresh)

        assert set(_columns(migrated)) == set(_columns(fresh))

        # ...and the extended columns agree on type and nullability.
        for name in EXTENDED_COLUMNS:
            assert str(_columns(migrated)[name]['type']) == str(_columns(fresh)[name]['type'])
            assert _columns(migrated)[name]['nullable'] == _columns(fresh)[name]['nullable']
    finally:
        migrated.dispose()
        fresh.dispose()


# --- idempotency -----------------------------------------------------------


def test_migration_is_idempotent(tmp_path):
    engine = _engine(tmp_path)
    try:
        _create_legacy_users_table(engine)
        assert run_migration(str(engine.url)) is True
        before = set(_columns(engine))

        # Second run has nothing to do and must not raise on the duplicate DDL.
        assert run_migration(str(engine.url)) is False
        assert set(_columns(engine)) == before
    finally:
        engine.dispose()


def test_migration_is_a_noop_on_a_create_tables_database(tmp_path):
    """New environments get their schema from the ORM, not from this migration."""
    engine = _engine(tmp_path, 'fresh.db')
    try:
        Base.metadata.create_all(bind=engine)
        assert EXTENDED_COLUMNS <= set(_columns(engine))

        assert run_migration(str(engine.url)) is False
    finally:
        engine.dispose()


def test_migration_completes_a_partially_applied_schema(tmp_path):
    """An interrupted earlier run must be repairable by re-running."""
    engine = _engine(tmp_path)
    try:
        _create_legacy_users_table(engine)
        with engine.begin() as connection:
            connection.execute(text('ALTER TABLE users ADD COLUMN phone VARCHAR(32)'))

        assert run_migration(str(engine.url)) is True
        assert EXTENDED_COLUMNS <= set(_columns(engine))
    finally:
        engine.dispose()


def test_migration_skips_without_users_table(tmp_path):
    engine = _engine(tmp_path, 'empty.db')
    try:
        assert run_migration(str(engine.url)) is False
    finally:
        engine.dispose()


# --- data safety -----------------------------------------------------------


def test_existing_rows_are_unaffected(tmp_path):
    engine = _engine(tmp_path)
    try:
        _create_legacy_users_table(engine)
        run_migration(str(engine.url))

        with engine.connect() as connection:
            rows = connection.execute(text(
                'SELECT id, email, password_hash, role, company_name, job_role, phone, '
                'marketing_opt_in, marketing_consent_at, marketing_consent_version '
                'FROM users ORDER BY created_at'
            )).mappings().all()

        assert [row['id'] for row in rows] == ['usr_first', 'usr_second']
        assert [row['email'] for row in rows] == ['first@opm.io', 'second@opm.io']
        assert [row['role'] for row in rows] == ['admin', 'user']
        assert [row['password_hash'] for row in rows] == ['hash1', 'hash2']

        for row in rows:
            for name in NULLABLE_TEXT_COLUMNS:
                assert row[name] is None, f'{name} should be null for pre-existing rows'
            # marketing_opt_in carries DEFAULT false, which both SQLite and
            # Postgres apply to existing rows on ADD COLUMN. Backfilled to
            # "not opted in", which is the safe value for a consent flag.
            assert not row['marketing_opt_in']
    finally:
        engine.dispose()


def test_legacy_insert_still_succeeds_after_migration(tmp_path):
    """A writer that knows nothing about the new columns must keep working."""
    engine = _engine(tmp_path)
    try:
        _create_legacy_users_table(engine)
        run_migration(str(engine.url))

        with engine.begin() as connection:
            connection.execute(text(
                'INSERT INTO users (id, email, password_hash, role) '
                "VALUES ('usr_new', 'new@opm.io', 'hash3', 'user')"
            ))

        with engine.connect() as connection:
            row = connection.execute(text(
                'SELECT company_name, job_role, phone, marketing_opt_in, '
                'marketing_consent_at, marketing_consent_version '
                "FROM users WHERE id = 'usr_new'"
            )).mappings().one()

        for name in NULLABLE_TEXT_COLUMNS:
            assert row[name] is None
        assert not row['marketing_opt_in']
    finally:
        engine.dispose()


def test_no_not_null_constraint_is_introduced(tmp_path):
    """Expand phase only: constraints are deferred to §10."""
    engine = _engine(tmp_path)
    try:
        _create_legacy_users_table(engine)
        run_migration(str(engine.url))

        columns = _columns(engine)
        for name in EXTENDED_COLUMNS:
            assert columns[name]['nullable'] is True, f'{name} must stay nullable'

        # Proven behaviourally as well as by introspection: an explicit NULL is
        # accepted in every one of the new columns.
        with engine.begin() as connection:
            connection.execute(text(
                'INSERT INTO users (id, email, password_hash, role, company_name, job_role, '
                'phone, marketing_opt_in, marketing_consent_at, marketing_consent_version) '
                "VALUES ('usr_nulls', 'nulls@opm.io', 'hash4', 'user', "
                'NULL, NULL, NULL, NULL, NULL, NULL)'
            ))
    finally:
        engine.dispose()


def test_no_indexes_are_added_for_the_new_columns(tmp_path):
    engine = _engine(tmp_path)
    try:
        _create_legacy_users_table(engine)
        run_migration(str(engine.url))

        indexed = {
            column
            for index in inspect(engine).get_indexes('users')
            for column in index['column_names']
        }
        assert not indexed & EXTENDED_COLUMNS
    finally:
        engine.dispose()


# --- dialect portability ---------------------------------------------------
#
# Production is Postgres 16 on RDS (terraform/rds.tf); development is SQLite.
# There is no live Postgres in CI, so the Postgres DDL is covered by unit-testing
# the helper that generates it.


def test_column_definitions_cover_the_whole_contract():
    for dialect in ('sqlite', 'postgresql'):
        definitions = column_definitions(dialect)
        assert set(definitions) == EXTENDED_COLUMNS
        assert definitions['company_name'] == 'VARCHAR(200)'
        assert definitions['job_role'] == 'VARCHAR(120)'
        assert definitions['phone'] == 'VARCHAR(32)'
        assert definitions['marketing_consent_version'] == 'VARCHAR(32)'


def test_boolean_default_differs_between_sqlite_and_postgres():
    """`BOOLEAN DEFAULT 0` is invalid on Postgres - it needs the FALSE keyword.

    This is the single most likely way this migration breaks in production, so
    it is asserted directly rather than inferred.
    """
    assert column_definitions('sqlite')['marketing_opt_in'] == 'BOOLEAN DEFAULT 0'
    assert column_definitions('postgresql')['marketing_opt_in'] == 'BOOLEAN DEFAULT FALSE'


def test_timestamp_type_differs_between_sqlite_and_postgres():
    assert column_definitions('sqlite')['marketing_consent_at'] == 'DATETIME'
    assert column_definitions('postgresql')['marketing_consent_at'] == 'TIMESTAMP'


def test_unknown_dialect_falls_back_to_standard_sql():
    """Anything that is not SQLite gets portable, standard-SQL spellings."""
    definitions = column_definitions('mysql')
    assert definitions['marketing_opt_in'] == 'BOOLEAN DEFAULT FALSE'
    assert definitions['marketing_consent_at'] == 'TIMESTAMP'


@pytest.mark.parametrize('dialect', ['sqlite', 'postgresql'])
def test_generated_ddl_is_additive_and_unconstrained(dialect):
    for name, sql_type in column_definitions(dialect).items():
        statement = f'ALTER TABLE users ADD COLUMN {name} {sql_type}'
        assert 'NOT NULL' not in statement.upper()
        assert 'CHECK' not in statement.upper()
        assert 'UNIQUE' not in statement.upper()


def test_migration_boolean_default_agrees_with_the_orm_on_postgres():
    """The migrated and create_tables() schemas must not diverge on Postgres.

    Compiled against the Postgres dialect only - no server connection needed.
    """
    orm_ddl = str(CreateTable(User.__table__).compile(dialect=postgresql.dialect()))

    # The ORM renders the SQL keyword, not the integer literal...
    assert 'marketing_opt_in BOOLEAN DEFAULT false' in orm_ddl
    assert 'marketing_opt_in BOOLEAN DEFAULT 0' not in orm_ddl
    # ...and so must the migration.
    migration_clause = column_definitions('postgresql')['marketing_opt_in']
    assert migration_clause.lower() == 'boolean default false'
