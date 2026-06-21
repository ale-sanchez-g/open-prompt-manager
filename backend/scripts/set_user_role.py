"""set_user_role — promote or demote an application user by email.

Run inside the backend container (same image/secrets as the service) so it has
access to the production database via ``DATABASE_URL``:

    python3 -m scripts.set_user_role <email> [role]

``role`` defaults to ``admin`` and must be one of ``admin`` / ``user``
(see ``app.services.auth_service.VALID_ROLES``). The operation is idempotent:
re-running with the same role is a no-op. Exits non-zero if the email is not
found or the role is invalid, so callers (CI, the AWS wrapper) can detect
failure.
"""

import os
import sys

from sqlalchemy import create_engine, text

from app.services.auth_service import DEFAULT_ROLE, ROLE_ADMIN, VALID_ROLES

DEFAULT_DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./data/prompts.db')


def set_user_role(email: str, role: str = ROLE_ADMIN, database_url: str = DEFAULT_DATABASE_URL) -> bool:
    """Set ``users.role`` for the account with the given ``email``.

    Returns ``True`` if a row was changed, ``False`` if the user already had
    the requested role. Raises ``ValueError`` for an invalid role or unknown
    email.
    """
    if role not in VALID_ROLES:
        raise ValueError(f'Invalid role {role!r}; must be one of {", ".join(VALID_ROLES)}')

    engine = create_engine(
        database_url,
        connect_args={'check_same_thread': False} if 'sqlite' in database_url else {},
    )

    try:
        with engine.begin() as connection:
            current = connection.execute(
                text('SELECT id, role FROM users WHERE email = :email'),
                {'email': email},
            ).first()

            if current is None:
                raise ValueError(f'No user found with email {email!r}')

            user_id, current_role = current
            if current_role == role:
                print(f'{email} ({user_id}) is already {role}; no change')
                return False

            connection.execute(
                text('UPDATE users SET role = :role WHERE id = :id'),
                {'role': role, 'id': user_id},
            )
            print(f'Updated {email} ({user_id}): {current_role} -> {role}')
            return True
    finally:
        engine.dispose()


def main(argv: list[str]) -> int:
    if not (1 <= len(argv) <= 2):
        print('Usage: python3 -m scripts.set_user_role <email> [role]', file=sys.stderr)
        print(f'  role defaults to {ROLE_ADMIN!r}; valid roles: {", ".join(VALID_ROLES)}', file=sys.stderr)
        return 2

    email = argv[0]
    role = argv[1] if len(argv) == 2 else ROLE_ADMIN
    try:
        set_user_role(email, role)
    except ValueError as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
