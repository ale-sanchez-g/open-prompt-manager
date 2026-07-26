"""Expand-phase migration for the extended registration fields.

STUB - contract only. Implemented on ``feat/reg-ext/db`` (Agent A).

Contract this module must honour (docs/features/registration-feature.md §4.4, §7):

* Adds, all nullable, to ``users``::

      company_name              VARCHAR(200)
      job_role                  VARCHAR(120)
      phone                     VARCHAR(32)
      marketing_opt_in          BOOLEAN DEFAULT 0
      marketing_consent_at      DATETIME
      marketing_consent_version VARCHAR(32)

* **Idempotent**: inspect first, skip columns that already exist. A database
  created by ``create_tables()`` already has them from the ORM model, and this
  must be a no-op there.
* **Forward-only**: no down-migration. The default dev database is SQLite, which
  cannot reliably drop columns, and the rollback for this change is the flag
  flip, not a schema revert. Nullable columns left behind are inert.
* **No constraints**: no NOT NULL, no enums, no checks. Those are deferred to
  the contract phase (§10).
* Must be registered in ``deploy.sh`` alongside ``migrations.add_user_role``, or
  it will never run in AWS.

Model this on ``backend/migrations/add_user_role.py``.
"""

import os

DEFAULT_DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./data/prompts.db')


def run_migration(database_url: str = DEFAULT_DATABASE_URL) -> bool:
    raise NotImplementedError(
        'add_user_extended_fields is a contract stub - implement on feat/reg-ext/db'
    )
