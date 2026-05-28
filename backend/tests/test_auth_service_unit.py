"""
Unit tests for auth_service functions targeting surviving mutmut mutations.

Covers: utcnow, AuthError, TokenValidationError, _get_jwt_secret,
get_cookie_secure, validate_email, get_bcrypt_rounds, hash_password,
verify_password, _build_token_payload, decode_token,
ensure_refresh_token_is_active, revoke_refresh_token,
revoke_refresh_token_from_cookie.
"""
import time
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import jwt
import pytest

from app.models.auth import RefreshToken, User
from app.services.auth_service import (
    ACCESS_TOKEN_TTL_SECONDS,
    DEFAULT_BCRYPT_ROUNDS,
    MAX_BCRYPT_ROUNDS,
    MIN_BCRYPT_ROUNDS,
    AuthError,
    TokenValidationError,
    _build_token_payload,
    _get_jwt_secret,
    create_access_token,
    decode_token,
    ensure_refresh_token_is_active,
    get_bcrypt_rounds,
    get_cookie_secure,
    hash_password,
    revoke_refresh_token,
    revoke_refresh_token_from_cookie,
    utcnow,
    validate_email,
    verify_password,
)


# ── utcnow ────────────────────────────────────────────────────────────────────

def test_utcnow_returns_naive_datetime():
    result = utcnow()
    assert result.tzinfo is None


def test_utcnow_is_approximately_now():
    from datetime import datetime
    result = utcnow()
    now = datetime.utcnow()
    assert abs((now - result).total_seconds()) < 2


# ── AuthError ─────────────────────────────────────────────────────────────────

def test_auth_error_stores_status_code():
    err = AuthError(status_code=403, error='forbidden')
    assert err.status_code == 403


def test_auth_error_stores_error_message():
    err = AuthError(status_code=401, error='invalid_credentials')
    assert err.error == 'invalid_credentials'


def test_auth_error_str_is_error_message():
    err = AuthError(status_code=401, error='invalid_credentials')
    assert str(err) == 'invalid_credentials'


# ── TokenValidationError ──────────────────────────────────────────────────────

def test_token_validation_error_stores_error():
    err = TokenValidationError(error='token_expired')
    assert err.error == 'token_expired'


def test_token_validation_error_str_is_error():
    err = TokenValidationError(error='invalid_token')
    assert str(err) == 'invalid_token'


# ── _get_jwt_secret ────────────────────────────────────────────────────────────

def test_get_jwt_secret_returns_env_value(monkeypatch):
    monkeypatch.setenv('JWT_SECRET', 'my-super-secret-key')
    assert _get_jwt_secret() == 'my-super-secret-key'


def test_get_jwt_secret_raises_when_empty_string(monkeypatch):
    monkeypatch.setenv('JWT_SECRET', '')
    with pytest.raises(RuntimeError, match='JWT_SECRET'):
        _get_jwt_secret()


def test_get_jwt_secret_raises_when_not_set(monkeypatch):
    monkeypatch.delenv('JWT_SECRET', raising=False)
    with pytest.raises(RuntimeError, match='JWT_SECRET'):
        _get_jwt_secret()


# ── get_cookie_secure ──────────────────────────────────────────────────────────

def _make_request(scheme: str, forwarded_proto: str = '') -> MagicMock:
    request = MagicMock()
    request.url.scheme = scheme
    request.headers.get = MagicMock(return_value=forwarded_proto)
    return request


def test_get_cookie_secure_true_for_https_scheme():
    assert get_cookie_secure(_make_request('https')) is True


def test_get_cookie_secure_false_for_http_scheme():
    assert get_cookie_secure(_make_request('http')) is False


def test_get_cookie_secure_true_when_x_forwarded_proto_is_https():
    assert get_cookie_secure(_make_request('http', 'https')) is True


def test_get_cookie_secure_false_when_x_forwarded_proto_is_http():
    assert get_cookie_secure(_make_request('http', 'http')) is False


def test_get_cookie_secure_false_when_forwarded_proto_is_unset():
    assert get_cookie_secure(_make_request('http', '')) is False


# ── validate_email ─────────────────────────────────────────────────────────────

def test_validate_email_simple_valid():
    assert validate_email('user@example.com') is True


def test_validate_email_subdomain_valid():
    assert validate_email('user@sub.example.com') is True


def test_validate_email_strips_leading_trailing_whitespace():
    assert validate_email('  user@example.com  ') is True


def test_validate_email_space_inside_rejects():
    assert validate_email('us er@example.com') is False


def test_validate_email_space_before_at_rejects():
    assert validate_email('user @example.com') is False


def test_validate_email_missing_at_rejects():
    assert validate_email('userexample.com') is False


def test_validate_email_empty_local_part_rejects():
    assert validate_email('@example.com') is False


def test_validate_email_empty_domain_rejects():
    assert validate_email('user@') is False


def test_validate_email_domain_without_dot_rejects():
    assert validate_email('user@localhost') is False


def test_validate_email_domain_label_starts_with_hyphen_rejects():
    assert validate_email('user@-example.com') is False


def test_validate_email_domain_label_ends_with_hyphen_rejects():
    assert validate_email('user@example-.com') is False


def test_validate_email_empty_domain_label_from_leading_dot_rejects():
    assert validate_email('user@.example.com') is False


def test_validate_email_consecutive_dots_in_domain_rejects():
    assert validate_email('user@example..com') is False


def test_validate_email_solo_hyphen_label_rejects():
    assert validate_email('user@-.com') is False


# ── get_bcrypt_rounds ──────────────────────────────────────────────────────────

def test_get_bcrypt_rounds_uses_default_when_env_not_set(monkeypatch):
    monkeypatch.delenv('BCRYPT_ROUNDS', raising=False)
    assert get_bcrypt_rounds() == DEFAULT_BCRYPT_ROUNDS


def test_get_bcrypt_rounds_uses_default_for_non_numeric(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', 'abc')
    assert get_bcrypt_rounds() == DEFAULT_BCRYPT_ROUNDS


def test_get_bcrypt_rounds_uses_default_below_minimum(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', str(MIN_BCRYPT_ROUNDS - 1))
    assert get_bcrypt_rounds() == DEFAULT_BCRYPT_ROUNDS


def test_get_bcrypt_rounds_uses_default_above_maximum(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', str(MAX_BCRYPT_ROUNDS + 1))
    assert get_bcrypt_rounds() == DEFAULT_BCRYPT_ROUNDS


def test_get_bcrypt_rounds_accepts_minimum_value(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', str(MIN_BCRYPT_ROUNDS))
    assert get_bcrypt_rounds() == MIN_BCRYPT_ROUNDS


def test_get_bcrypt_rounds_accepts_maximum_value(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', str(MAX_BCRYPT_ROUNDS))
    assert get_bcrypt_rounds() == MAX_BCRYPT_ROUNDS


def test_get_bcrypt_rounds_accepts_valid_in_range(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', '8')
    assert get_bcrypt_rounds() == 8


# ── hash_password / verify_password ───────────────────────────────────────────

def test_hash_password_produces_bcrypt_prefix(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', '4')
    h = hash_password('TestPassword1!')
    assert h.startswith('$2b$') or h.startswith('$2a$')


def test_hash_password_encodes_rounds_in_hash(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', '4')
    h = hash_password('TestPassword1!')
    assert '$04$' in h


def test_verify_password_returns_true_for_correct_password(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', '4')
    h = hash_password('CorrectHorse1!')
    assert verify_password('CorrectHorse1!', h) is True


def test_verify_password_returns_false_for_wrong_password(monkeypatch):
    monkeypatch.setenv('BCRYPT_ROUNDS', '4')
    h = hash_password('CorrectHorse1!')
    assert verify_password('WrongPassword1!', h) is False


# ── _build_token_payload ──────────────────────────────────────────────────────

def test_build_token_payload_contains_sub_and_email():
    user = User(id='usr_abc123', email='test@opm.io', password_hash='hash')
    payload = _build_token_payload(user, expires_in=900, token_type='access')
    assert payload['sub'] == 'usr_abc123'
    assert payload['email'] == 'test@opm.io'


def test_build_token_payload_type_field_matches_arg():
    user = User(id='usr_abc123', email='test@opm.io', password_hash='hash')
    access_payload = _build_token_payload(user, expires_in=900, token_type='access')
    refresh_payload = _build_token_payload(user, expires_in=7200, token_type='refresh')
    assert access_payload['type'] == 'access'
    assert refresh_payload['type'] == 'refresh'


def test_build_token_payload_exp_is_after_iat():
    user = User(id='usr_abc123', email='test@opm.io', password_hash='hash')
    payload = _build_token_payload(user, expires_in=900, token_type='access')
    assert payload['exp'] > payload['iat']


def test_build_token_payload_without_token_id_has_no_jti():
    user = User(id='usr_abc123', email='test@opm.io', password_hash='hash')
    payload = _build_token_payload(user, expires_in=900, token_type='access')
    assert 'jti' not in payload


def test_build_token_payload_with_token_id_has_jti():
    user = User(id='usr_abc123', email='test@opm.io', password_hash='hash')
    payload = _build_token_payload(user, expires_in=900, token_type='access', token_id='my-jti')
    assert payload['jti'] == 'my-jti'


# ── create_access_token ────────────────────────────────────────────────────────

def test_create_access_token_type_is_access():
    user = User(id='usr_abc123', email='test@opm.io', password_hash='hash')
    token = create_access_token(user)
    import os
    payload = jwt.decode(token, os.environ['JWT_SECRET'], algorithms=['HS256'])
    assert payload['type'] == 'access'


def test_create_access_token_expires_in_controls_ttl():
    user = User(id='usr_abc123', email='test@opm.io', password_hash='hash')
    token = create_access_token(user, expires_in=1800)
    import os
    payload = jwt.decode(token, os.environ['JWT_SECRET'], algorithms=['HS256'])
    assert payload['exp'] - payload['iat'] == 1800


# ── decode_token ──────────────────────────────────────────────────────────────

def test_decode_token_rejects_wrong_token_type():
    user = User(id='usr_abc', email='test@opm.io', password_hash='hash')
    access_token = create_access_token(user)
    with pytest.raises(TokenValidationError) as exc_info:
        decode_token(access_token, expected_type='refresh')
    assert exc_info.value.error == 'invalid_token'


def test_decode_token_rejects_missing_sub():
    import os
    payload = {
        'email': 'test@opm.io',
        'type': 'access',
        'iat': int(time.time()),
        'exp': int(time.time()) + 900,
    }
    token = jwt.encode(payload, os.environ['JWT_SECRET'], algorithm='HS256')
    with pytest.raises(TokenValidationError) as exc_info:
        decode_token(token, expected_type='access')
    assert exc_info.value.error == 'invalid_token'


def test_decode_token_rejects_missing_email():
    import os
    payload = {
        'sub': 'usr_abc',
        'type': 'access',
        'iat': int(time.time()),
        'exp': int(time.time()) + 900,
    }
    token = jwt.encode(payload, os.environ['JWT_SECRET'], algorithm='HS256')
    with pytest.raises(TokenValidationError) as exc_info:
        decode_token(token, expected_type='access')
    assert exc_info.value.error == 'invalid_token'


def test_decode_token_raises_token_expired_for_expired_jwt():
    user = User(id='usr_abc', email='test@opm.io', password_hash='hash')
    expired_token = create_access_token(user, expires_in=-1)
    with pytest.raises(TokenValidationError) as exc_info:
        decode_token(expired_token, expected_type='access')
    assert exc_info.value.error == 'token_expired'


def test_decode_token_raises_invalid_token_for_garbage():
    with pytest.raises(TokenValidationError) as exc_info:
        decode_token('not-a-jwt', expected_type='access')
    assert exc_info.value.error == 'invalid_token'


def test_decode_token_succeeds_for_valid_token():
    user = User(id='usr_abc', email='test@opm.io', password_hash='hash')
    token = create_access_token(user)
    payload = decode_token(token, expected_type='access')
    assert payload['sub'] == 'usr_abc'
    assert payload['email'] == 'test@opm.io'


# ── ensure_refresh_token_is_active ────────────────────────────────────────────

def _make_refresh_token(revoked_at=None, expires_offset_seconds=3600) -> RefreshToken:
    return SimpleNamespace(
        revoked_at=revoked_at,
        expires_at=utcnow() + timedelta(seconds=expires_offset_seconds),
    )


def test_ensure_refresh_token_is_active_returns_token_when_valid():
    rt = _make_refresh_token()
    result = ensure_refresh_token_is_active(rt)
    assert result is rt


def test_ensure_refresh_token_is_active_raises_for_none():
    with pytest.raises(TokenValidationError) as exc_info:
        ensure_refresh_token_is_active(None)
    assert exc_info.value.error == 'token_expired'


def test_ensure_refresh_token_is_active_raises_when_revoked():
    rt = _make_refresh_token(revoked_at=utcnow())
    with pytest.raises(TokenValidationError) as exc_info:
        ensure_refresh_token_is_active(rt)
    assert exc_info.value.error == 'token_expired'


def test_ensure_refresh_token_is_active_raises_when_expired():
    rt = _make_refresh_token(expires_offset_seconds=-1)
    with pytest.raises(TokenValidationError) as exc_info:
        ensure_refresh_token_is_active(rt)
    assert exc_info.value.error == 'token_expired'


def test_ensure_refresh_token_is_active_raises_when_expires_at_exactly_now():
    """Token expiry boundary: expires_at == utcnow() should be expired."""
    rt = _make_refresh_token(expires_offset_seconds=0)
    with pytest.raises(TokenValidationError):
        ensure_refresh_token_is_active(rt)


# ── revoke_refresh_token ──────────────────────────────────────────────────────

def test_revoke_refresh_token_sets_revoked_at():
    rt = _make_refresh_token()
    rt.id = 'token-id-1'

    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = rt

    revoke_refresh_token(db, 'token-id-1')

    assert rt.revoked_at is not None
    db.commit.assert_called_once()


def test_revoke_refresh_token_is_noop_when_already_revoked():
    rt = _make_refresh_token(revoked_at=utcnow())
    rt.id = 'token-id-1'

    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = rt

    revoke_refresh_token(db, 'token-id-1')

    db.commit.assert_not_called()


def test_revoke_refresh_token_is_noop_when_not_found():
    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    revoke_refresh_token(db, 'nonexistent-id')

    db.commit.assert_not_called()


# ── revoke_refresh_token_from_cookie ──────────────────────────────────────────

def test_revoke_refresh_token_from_cookie_ignores_none():
    db = MagicMock()
    revoke_refresh_token_from_cookie(db, None)
    db.execute.assert_not_called()


def test_revoke_refresh_token_from_cookie_ignores_empty_string():
    db = MagicMock()
    revoke_refresh_token_from_cookie(db, '')
    db.execute.assert_not_called()


def test_revoke_refresh_token_from_cookie_ignores_invalid_token():
    db = MagicMock()
    revoke_refresh_token_from_cookie(db, 'not-a-valid-jwt')
    db.execute.assert_not_called()


def test_revoke_refresh_token_from_cookie_revokes_valid_token(monkeypatch):
    """A valid refresh token cookie triggers revocation of the DB record."""
    import os
    from sqlalchemy import select

    user = User(id='usr_cookie', email='cookie@opm.io', password_hash='hash')
    rt = _make_refresh_token()
    rt.id = 'refresh-jti-1'

    # Build a real refresh token JWT
    payload = {
        'sub': user.id,
        'email': user.email,
        'type': 'refresh',
        'iat': int(time.time()),
        'exp': int(time.time()) + 3600,
        'jti': 'refresh-jti-1',
    }
    token = jwt.encode(payload, os.environ['JWT_SECRET'], algorithm='HS256')

    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = rt

    revoke_refresh_token_from_cookie(db, token)

    assert rt.revoked_at is not None
    db.commit.assert_called_once()
