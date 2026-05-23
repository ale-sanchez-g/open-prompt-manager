import os
import re
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth import RefreshToken, User

PASSWORD_PATTERN = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{10,}$')
REFRESH_COOKIE_NAME = 'refresh_token'
ACCESS_TOKEN_TTL_SECONDS = 900
REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
DEFAULT_BCRYPT_ROUNDS = 12
MIN_BCRYPT_ROUNDS = 4
MAX_BCRYPT_ROUNDS = 31


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


def create_user(db: Session, email: str, password: str) -> User:
    user = User(email=normalize_email(email), password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> User | None:
    normalized_email = normalize_email(email)
    return db.execute(select(User).where(User.email == normalized_email)).scalar_one_or_none()


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def _build_token_payload(user: User, expires_in: int, token_type: str, token_id: str | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        'sub': user.id,
        'email': user.email,
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


def revoke_refresh_token_from_cookie(db: Session, token: str | None) -> None:
    if not token:
        return
    try:
        payload = decode_token(token, expected_type='refresh')
    except TokenValidationError:
        return
    token_id = payload.get('jti')
    if token_id:
        revoke_refresh_token(db, token_id)
