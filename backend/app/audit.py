"""
Structured JSON audit logging for authentication and admin actions.

This module is the single source of truth for the application's audit-event
schema. It is intentionally dependency-light (stdlib ``logging`` only) so the
existing awslogs Docker log driver -- which only ships whatever the container
writes to stdout -- can pick these events up without any extra shipping
infrastructure, and so CloudWatch metric filters/alarms (see issue #331) can
match on stable event names.

Design
------
- Every audit event is emitted through the ``audit`` logger
  (``logging.getLogger('audit')``) as a single-line JSON object on stdout,
  always including: ``ts``, ``level``, ``logger``, ``message``, ``event``,
  ``actor``, ``outcome``, and (when known) ``target``, ``source_ip``,
  ``request_id``, plus any event-specific ``**extra`` fields.
- ``configure_logging()`` installs the same JSON formatter on the root
  logger so every log line the process emits (uvicorn access/error logs
  included) is structured the same way.
- ``RequestIDMiddleware`` assigns (or propagates an inbound) ``X-Request-ID``
  header and threads it through a ``contextvar`` for the lifetime of the
  request, so ``audit_event()`` calls deep inside service functions -- which
  don't have access to the ``Request`` object -- are still correlated to the
  request that triggered them, and it is echoed back on the response so
  clients/gateways can correlate their own logs.
- ``RedactingJSONFormatter`` strips any field whose key looks like a secret
  (password, token, hash, secret, jwt, ...) at format time. This is defense
  in depth: application code should never pass a secret into ``audit_event``/
  ``extra=`` in the first place, but if one ever slips through it is scrubbed
  here before a single byte reaches stdout.

Stable event names
-------------------
These names are relied on by issue #331's CloudWatch metric filters/alarms.
Do not rename or remove an event without updating those filters; add new
events rather than repurposing an existing name.

    auth.register               - a new account was created
    auth.login.success          - successful password authentication
    auth.login.failure          - invalid credentials on /auth/login
    auth.login.lockout          - account temporarily locked after repeated
                                   failed login attempts (credential-stuffing
                                   / brute-force signal)
    auth.token.issued           - access+refresh tokens issued (on login)
    auth.token.refresh          - access token refreshed from a valid
                                   refresh-token cookie
    auth.token.refresh_failure  - refresh rejected (missing/expired/invalid
                                   refresh token)
    auth.token.revoke           - a refresh token was revoked (logout)
    auth.password.change        - a user's password was changed/reset
    admin.user.list             - an admin listed all user accounts
    admin.user.create           - an admin created a user account
    admin.user.role_change      - an admin changed (or attempted to change)
                                   a user's role
    admin.user.delete           - an admin deleted a user account

Each event carries ``outcome`` in {"success", "failure", "blocked"} (plus a
free-form ``reason`` on failure/blocked outcomes), ``actor`` (the acting
user's email, or "anonymous" if unauthenticated), ``target`` (the affected
user id/email, when applicable), and ``source_ip``.
"""
from __future__ import annotations

import contextvars
import json
import logging
import sys
import uuid
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

REQUEST_ID_HEADER = 'X-Request-ID'
AUDIT_LOGGER_NAME = 'audit'

# ── Stable, documented event names (see module docstring) ───────────────────

EVENT_REGISTER = 'auth.register'
EVENT_LOGIN_SUCCESS = 'auth.login.success'
EVENT_LOGIN_FAILURE = 'auth.login.failure'
EVENT_LOGIN_LOCKOUT = 'auth.login.lockout'
EVENT_TOKEN_ISSUED = 'auth.token.issued'
EVENT_TOKEN_REFRESH = 'auth.token.refresh'
EVENT_TOKEN_REFRESH_FAILURE = 'auth.token.refresh_failure'
EVENT_TOKEN_REVOKE = 'auth.token.revoke'
EVENT_PASSWORD_CHANGE = 'auth.password.change'
EVENT_ADMIN_USER_LIST = 'admin.user.list'
EVENT_ADMIN_USER_CREATE = 'admin.user.create'
EVENT_ADMIN_USER_ROLE_CHANGE = 'admin.user.role_change'
EVENT_ADMIN_USER_DELETE = 'admin.user.delete'

# ── Redaction (defense in depth) ─────────────────────────────────────────────

_REDACTED = '***REDACTED***'
_SENSITIVE_KEYS = frozenset({
    'password', 'password_hash', 'new_password', 'old_password',
    'token', 'access_token', 'refresh_token', 'authorization',
    'secret', 'jwt', 'jwt_secret', 'jti', 'cookie', 'set-cookie',
})


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: (_REDACTED if key.lower() in _SENSITIVE_KEYS else _redact(val)) for key, val in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(item) for item in value]
    return value


_request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar('request_id', default=None)


def get_request_id() -> str | None:
    """Return the correlation ID for the request currently being handled, if any."""
    return _request_id_ctx.get()


class RedactingJSONFormatter(logging.Formatter):
    """Formats every log record as a single-line JSON object, redacting secrets.

    Any ``extra`` field (or nested dict/list value) whose key looks like a
    secret -- password, token, hash, jwt, etc. -- is replaced with a fixed
    placeholder before serialization.
    """

    # Attribute names that already exist on a "fresh" LogRecord and therefore
    # should not be re-emitted as top-level custom fields.
    _RESERVED = frozenset(vars(logging.LogRecord('', 0, '', 0, '', None, None))) | {'message', 'asctime'}

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            'ts': self.formatTime(record, '%Y-%m-%dT%H:%M:%S') + f'.{int(record.msecs):03d}Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }

        request_id = getattr(record, 'request_id', None) or _request_id_ctx.get()
        if request_id:
            payload['request_id'] = request_id

        for key, value in record.__dict__.items():
            if key in self._RESERVED or key == 'request_id' or key.startswith('_'):
                continue
            payload[key] = value

        payload = _redact(payload)

        if record.exc_info:
            payload['exc_info'] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO, stream: Any = None) -> None:
    """Configure root logging to emit redacted single-line JSON.

    Writes to ``stream`` (defaults to ``sys.stdout`` so the existing awslogs
    Docker log driver ships every line). Idempotent: calling this again
    (e.g. once per ``create_app()`` in tests) replaces the previously
    installed handler instead of stacking duplicates.
    """
    root = logging.getLogger()
    root.setLevel(level)

    handler = logging.StreamHandler(stream if stream is not None else sys.stdout)
    handler.setFormatter(RedactingJSONFormatter())
    handler._is_audit_handler = True  # marker so repeated calls don't duplicate handlers

    root.handlers = [h for h in root.handlers if not getattr(h, '_is_audit_handler', False)]
    root.addHandler(handler)


def _client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded_for = request.headers.get('X-Forwarded-For')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.client.host if request.client else None


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Assigns/propagates a per-request correlation ID.

    Honors an inbound ``X-Request-ID`` header (e.g. one already assigned by
    a load balancer) or generates a fresh uuid4 otherwise. The ID is stored
    on ``request.state.request_id`` and in a contextvar for the lifetime of
    the request, and echoed back as a response header.
    """

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get(REQUEST_ID_HEADER)
        request_id = incoming.strip() if incoming and incoming.strip() else str(uuid.uuid4())
        request.state.request_id = request_id
        token = _request_id_ctx.set(request_id)
        try:
            response = await call_next(request)
        finally:
            _request_id_ctx.reset(token)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response


_audit_logger = logging.getLogger(AUDIT_LOGGER_NAME)


def audit_event(
    event: str,
    *,
    request: Request | None = None,
    actor: str | None = None,
    target: str | None = None,
    outcome: str | None = None,
    source_ip: str | None = None,
    **extra: Any,
) -> None:
    """Emit a single structured audit log line.

    ``event`` should be one of the dotted ``EVENT_*`` constants documented in
    this module's docstring. Additional context goes in ``**extra`` and is
    redacted the same as everything else if a key name looks sensitive.
    """
    fields: dict[str, Any] = {
        'event': event,
        'actor': actor or 'anonymous',
        'outcome': outcome or 'unknown',
    }
    if target is not None:
        fields['target'] = target

    ip = source_ip or _client_ip(request)
    if ip:
        fields['source_ip'] = ip

    request_id = None
    if request is not None:
        request_id = getattr(request.state, 'request_id', None)
    fields['request_id'] = request_id or get_request_id()
    if fields['request_id'] is None:
        del fields['request_id']

    fields.update(extra)

    _audit_logger.info(event, extra=fields)
