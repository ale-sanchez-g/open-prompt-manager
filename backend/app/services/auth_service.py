import os
import re
import threading
import time
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.auth import RefreshToken, User

PASSWORD_PATTERN = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{10,}$')
REFRESH_COOKIE_NAME = 'refresh_token'
ACCESS_TOKEN_TTL_SECONDS = 900
REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
DEFAULT_BCRYPT_ROUNDS = 12
MIN_BCRYPT_ROUNDS = 4
MAX_BCRYPT_ROUNDS = 31

DEFAULT_LOGIN_LOCKOUT_THRESHOLD = 5
DEFAULT_LOGIN_LOCKOUT_WINDOW_SECONDS = 15 * 60

ROLE_ADMIN = 'admin'
ROLE_USER = 'user'
VALID_ROLES = (ROLE_ADMIN, ROLE_USER)
DEFAULT_ROLE = ROLE_USER


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AuthError(Exception):
    def __init__(self, status_code: int, error: str):
        super().__init__(error)
        self.status_code = status_code
        self.error = error


class TokenValidationError(Exception):
    def __init__(self, error: str):
        super().__init__(error)
        self.error = error


def _get_jwt_secret() -> str:
    secret = os.getenv('JWT_SECRET')
    if not secret:
        raise RuntimeError('JWT_SECRET environment variable is required')
    return secret


def get_cookie_secure(request: Any) -> bool:
    forwarded_proto = request.headers.get('x-forwarded-proto', '')
    return request.url.scheme == 'https' or forwarded_proto == 'https'


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> bool:
    normalized_email = email.strip()
    if ' ' in normalized_email or '@' not in normalized_email:
        return False

    local_part, separator, domain_part = normalized_email.rpartition('@')
    if separator == '' or not local_part or not domain_part or '.' not in domain_part:
        return False

    domain_labels = domain_part.split('.')
    return all(label and label != '-' and not label.startswith('-') and not label.endswith('-') for label in domain_labels)


def validate_password(password: str) -> bool:
    return bool(PASSWORD_PATTERN.match(password))


def get_bcrypt_rounds() -> int:
    configured = os.getenv('BCRYPT_ROUNDS')
    if configured is None:
        return DEFAULT_BCRYPT_ROUNDS

    try:
        rounds = int(configured)
    except ValueError:
        return DEFAULT_BCRYPT_ROUNDS

    if rounds < MIN_BCRYPT_ROUNDS or rounds > MAX_BCRYPT_ROUNDS:
        return DEFAULT_BCRYPT_ROUNDS
    return rounds


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=get_bcrypt_rounds())).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


def validate_role(role: str) -> bool:
    return role in VALID_ROLES


def get_bootstrap_admin_emails() -> set[str]:
    """Return the set of emails configured to always receive the admin role.

    Read from the ``ADMIN_EMAILS`` environment variable (comma-separated).
    Provides a deterministic way to designate administrators at registration
    time, independent of who happens to register first.
    """
    configured = os.getenv('ADMIN_EMAILS', '')
    return {normalize_email(email) for email in configured.split(',') if email.strip()}


def is_bootstrap_admin(email: str) -> bool:
    return normalize_email(email) in get_bootstrap_admin_emails()


def count_users(db: Session) -> int:
    return db.execute(select(func.count()).select_from(User)).scalar_one()


def create_user(db: Session, email: str, password: str, role: str = DEFAULT_ROLE) -> User:
    user = User(email=normalize_email(email), password_hash=hash_password(password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> User | None:
    normalized_email = normalize_email(email)
    return db.execute(select(User).where(User.email == normalized_email)).scalar_one_or_none()


def get_user_by_id(db: Session, user_id: str) -> User | None:
    return db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()


def list_users(db: Session) -> list[User]:
    return list(db.execute(select(User).order_by(User.created_at)).scalars().all())


def update_user_role(db: Session, user: User, role: str) -> User:
    user.role = role
    db.commit()
    db.refresh(user)
    return user


def update_user_password(db: Session, user: User, password: str) -> User:
    user.password_hash = hash_password(password)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> None:
    db.delete(user)
    db.commit()


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


# ── Login lockout tracking (credential-stuffing / brute-force defense) ──────
#
# In-memory, per-process, sliding-window counter of failed login attempts
# keyed by normalized email. Env vars are read lazily (not cached at import
# time) so operators can tune them without a restart-sensitive constant, and
# so tests can monkeypatch them per-case.


def get_login_lockout_threshold() -> int:
    try:
        return int(os.getenv('LOGIN_LOCKOUT_THRESHOLD', str(DEFAULT_LOGIN_LOCKOUT_THRESHOLD)))
    except ValueError:
        return DEFAULT_LOGIN_LOCKOUT_THRESHOLD


def get_login_lockout_window_seconds() -> int:
    try:
        return int(os.getenv('LOGIN_LOCKOUT_WINDOW_SECONDS', str(DEFAULT_LOGIN_LOCKOUT_WINDOW_SECONDS)))
    except ValueError:
        return DEFAULT_LOGIN_LOCKOUT_WINDOW_SECONDS


class _LoginAttemptTracker:
    """Thread-safe sliding-window counter of failed login attempts per key."""

    def __init__(self) -> None:
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> list[float]:
        window_start = now - get_login_lockout_window_seconds()
        attempts = [t for t in self._failures.get(key, []) if t >= window_start]
        self._failures[key] = attempts
        return attempts

    def record_failure(self, key: str) -> int:
        """Record a failed attempt for ``key`` and return the attempt count within the window."""
        now = time.monotonic()
        with self._lock:
            attempts = self._prune(key, now)
            attempts.append(now)
            return len(attempts)

    def is_locked(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            return len(self._prune(key, now)) >= get_login_lockout_threshold()

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def reset_all(self) -> None:
        with self._lock:
            self._failures.clear()


_login_attempt_tracker = _LoginAttemptTracker()


def reset_login_lockout_state() -> None:
    """Clear all tracked failed-login counters.

    Called once per application instance (see ``main.create_app``) so state
    starts fresh for each process; in tests this keeps lockout counters from
    leaking between test cases, since the test suite builds a fresh app per
    test.
    """
    _login_attempt_tracker.reset_all()


def record_failed_login(email: str) -> bool:
    """Record a failed login attempt for ``email``.

    Returns ``True`` if this attempt trips the lockout threshold.
    """
    key = normalize_email(email)
    count = _login_attempt_tracker.record_failure(key)
    return count >= get_login_lockout_threshold()


def is_login_locked_out(email: str) -> bool:
    """Return True if ``email`` currently has too many recent failed attempts."""
    return _login_attempt_tracker.is_locked(normalize_email(email))


def reset_login_attempts(email: str) -> None:
    """Clear the failed-attempt counter for ``email`` (called on successful login)."""
    _login_attempt_tracker.reset(normalize_email(email))


def _build_token_payload(user: User, expires_in: int, token_type: str, token_id: str | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        'sub': user.id,
        'email': user.email,
        'role': user.role or DEFAULT_ROLE,
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(seconds=expires_in)).timestamp()),
        'type': token_type,
    }
    if token_id is not None:
        payload['jti'] = token_id
    return payload


def create_access_token(user: User, expires_in: int = ACCESS_TOKEN_TTL_SECONDS) -> str:
    return jwt.encode(
        _build_token_payload(user, expires_in=expires_in, token_type='access', token_id=str(uuid4())),
        _get_jwt_secret(),
        algorithm='HS256',
    )


def create_refresh_token(db: Session, user: User, expires_in: int = REFRESH_TOKEN_TTL_SECONDS) -> str:
    expires_at = utcnow() + timedelta(seconds=expires_in)
    refresh_token = RefreshToken(user_id=user.id, expires_at=expires_at)
    db.add(refresh_token)
    db.commit()
    db.refresh(refresh_token)
    return jwt.encode(
        _build_token_payload(user, expires_in=expires_in, token_type='refresh', token_id=refresh_token.id),
        _get_jwt_secret(),
        algorithm='HS256',
    )


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, _get_jwt_secret(), algorithms=['HS256'])
    except ExpiredSignatureError as exc:
        raise TokenValidationError('token_expired') from exc
    except InvalidTokenError as exc:
        raise TokenValidationError('invalid_token') from exc

    if payload.get('type') != expected_type or 'sub' not in payload or 'email' not in payload:
        raise TokenValidationError('invalid_token')
    return payload


def get_refresh_token_record(db: Session, token_id: str) -> RefreshToken | None:
    return db.execute(select(RefreshToken).where(RefreshToken.id == token_id)).scalar_one_or_none()


def ensure_refresh_token_is_active(refresh_token: RefreshToken | None) -> RefreshToken:
    if refresh_token is None or refresh_token.revoked_at is not None:
        raise TokenValidationError('token_expired')
    if refresh_token.expires_at <= utcnow():
        raise TokenValidationError('token_expired')
    return refresh_token


def revoke_refresh_token(db: Session, token_id: str) -> None:
    refresh_token = get_refresh_token_record(db, token_id)
    if refresh_token is None or refresh_token.revoked_at is not None:
        return
    refresh_token.revoked_at = utcnow()
    db.commit()


def revoke_refresh_token_from_cookie(db: Session, token: str | None) -> dict[str, Any] | None:
    """Revoke the refresh token embedded in ``token`` cookie, if any.

    Returns a dict with ``user_id`` and ``email`` (taken from the token
    payload) when a revocation was attempted against a syntactically valid
    refresh token, or ``None`` when there was no cookie, or the cookie
    could not be decoded as a valid refresh token. Used by the ``/auth/logout``
    endpoint to emit an ``auth.token.revoke`` audit event.
    """
    if not token:
        return None
    try:
        payload = decode_token(token, expected_type='refresh')
    except TokenValidationError:
        return None
    token_id = payload.get('jti')
    if not token_id:
        return None
    revoke_refresh_token(db, token_id)
    return {'user_id': payload.get('sub'), 'email': payload.get('email')}
