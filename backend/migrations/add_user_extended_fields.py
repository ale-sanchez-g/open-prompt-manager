"""Expand-phase migration for the extended registration fields (OPM-FLAG-REG-001).

Adds six nullable columns to ``users`` so the ``registration_extended_fields``
flag has somewhere to write when it is turned on. See
``docs/features/registration-feature.md`` §4.4 and guardrail 4 (expand/contract).

Properties this migration deliberately has:

* **Idempotent.** Each column is inspected individually and only the missing
  ones are added, so it is safe to re-run on every deploy. A database created by
  ``create_tables()`` already has all six from the ORM model
  (``app/models/auth.py``) and is a clean no-op here.
* **Forward-only. There is no down-migration, by design.** Do not add one. The
  default development database is SQLite, which cannot reliably drop columns,
  and the rollback for this change is a Flagsmith flag flip rather than a schema
  revert (spec §5). Nullable columns left behind after a rollback are inert:
  with the flag off nothing reads or writes them.
* **No constraints.** No NOT NULL, no enums, no checks, no indexes. The fields
  are optional by design; any constraint is deferred to the contract phase
  (spec §10) once the feature is confirmed permanent.

Dialect note: development runs SQLite (``sqlite:///./data/prompts.db``) and
production runs Postgres 16 on RDS (``terraform/rds.tf``). The two disagree on
how a boolean default is spelled, so the DDL is built per dialect — see
``column_definitions``.
"""

import os

from sqlalchemy import create_engine, inspect, text


DEFAULT_DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./data/prompts.db')


def column_definitions(dialect_name: str) -> dict[str, str]:
    """Return ``{column_name: sql_type_clause}`` for the six new columns.

    Split out from :func:`run_migration` so the Postgres DDL can be unit-tested
    without a live Postgres.

    Two things differ by dialect:

    * **The boolean default.** SQLite has no native boolean and spells false as
      ``0``; Postgres rejects ``BOOLEAN DEFAULT 0`` outright ("column is of type
      boolean but default expression is of type integer") and needs
      ``DEFAULT FALSE``. Emitting the SQLite spelling against RDS is the single
      most likely way this migration fails in production.
    * **The timestamp type**, following the precedent already set by
      ``add_agent_updated_at``.

    Both match what SQLAlchemy renders from the ORM model, so the migrated
    schema and the ``create_tables()`` schema agree.
    """
    is_sqlite = dialect_name == 'sqlite'
    false_literal = '0' if is_sqlite else 'FALSE'
    timestamp_type = 'DATETIME' if is_sqlite else 'TIMESTAMP'

    return {
        'company_name': 'VARCHAR(200)',
        'job_role': 'VARCHAR(120)',
        'phone': 'VARCHAR(32)',
        'marketing_opt_in': f'BOOLEAN DEFAULT {false_literal}',
        # Consent evidence, not just the boolean (guardrail 8).
        'marketing_consent_at': timestamp_type,
        'marketing_consent_version': 'VARCHAR(32)',
    }


def run_migration(database_url: str = DEFAULT_DATABASE_URL) -> bool:
    """Add any missing extended-registration columns to ``users``.

    Returns ``True`` when at least one column was added, ``False`` when there
    was nothing to do (table absent, or every column already present).
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

        existing = {column['name'] for column in inspector.get_columns('users')}
        definitions = column_definitions(engine.dialect.name)
        missing = {name: sql for name, sql in definitions.items() if name not in existing}

        if not missing:
            print('users extended registration columns already exist; skipping migration')
            return False

        # Each ADD COLUMN is nullable with no table rewrite, so this is an
        # online change on Postgres and cheap on SQLite: no downtime.
        with engine.begin() as connection:
            for name, sql_type in missing.items():
                connection.execute(text(f'ALTER TABLE users ADD COLUMN {name} {sql_type}'))
                print(f'Added users.{name}')

        return True
    finally:
        engine.dispose()


if __name__ == '__main__':
    run_migration()
