"""
Tests for structured JSON audit logging (issue #332).

Covers:
  - audit events emitted for login success/failure/lockout, token issue/
    refresh/revoke, admin user CRUD/role changes, and password changes
  - the X-Request-ID correlation-id middleware
  - redaction of secrets (password/token) at the formatter level, both as a
    focused unit test of RedactingJSONFormatter and an end-to-end check that
    a deliberately "leaked" secret field never reaches the rendered log line
"""
import io
import json
import logging

from app.audit import (
    EVENT_ADMIN_USER_CREATE,
    EVENT_ADMIN_USER_DELETE,
    EVENT_ADMIN_USER_LIST,
    EVENT_ADMIN_USER_ROLE_CHANGE,
    EVENT_LOGIN_FAILURE,
    EVENT_LOGIN_LOCKOUT,
    EVENT_LOGIN_SUCCESS,
    EVENT_CREDENTIAL_CHANGE,
    EVENT_REGISTER,
    EVENT_TOKEN_ISSUED,
    EVENT_TOKEN_REFRESH,
    EVENT_TOKEN_REFRESH_FAILURE,
    EVENT_TOKEN_REVOKE,
    RedactingJSONFormatter,
    audit_event,
    configure_logging,
)

STRONG_PASSWORD = 'Str0ng!Pass1'
OTHER_PASSWORD = 'An0ther!Pass2'


def _audit_records(caplog):
    return [r for r in caplog.records if r.name == 'audit']


def _events(caplog):
    return [r.event for r in _audit_records(caplog)]


# ── login success / failure / lockout ────────────────────────────────────────


def test_login_success_emits_audit_events(anon_client, caplog):
    caplog.set_level(logging.INFO)
    anon_client.post('/auth/register', json={'email': 'audit-login@opm.io', 'password': STRONG_PASSWORD})
    caplog.clear()

    response = anon_client.post('/auth/login', json={'email': 'audit-login@opm.io', 'password': STRONG_PASSWORD})

    assert response.status_code == 200
    events = _events(caplog)
    assert EVENT_LOGIN_SUCCESS in events
    assert EVENT_TOKEN_ISSUED in events

    success_record = next(r for r in _audit_records(caplog) if r.event == EVENT_LOGIN_SUCCESS)
    assert success_record.actor == 'audit-login@opm.io'
    assert success_record.outcome == 'success'
    assert success_record.target  # user id present
    assert hasattr(success_record, 'source_ip')


def test_login_failure_emits_audit_event(anon_client, caplog):
    caplog.set_level(logging.INFO)
    anon_client.post('/auth/register', json={'email': 'audit-fail@opm.io', 'password': STRONG_PASSWORD})
    caplog.clear()

    response = anon_client.post('/auth/login', json={'email': 'audit-fail@opm.io', 'password': 'WrongPass123!'})

    assert response.status_code == 401
    failure_record = next(r for r in _audit_records(caplog) if r.event == EVENT_LOGIN_FAILURE)
    assert failure_record.actor == 'audit-fail@opm.io'
    assert failure_record.outcome == 'failure'
    # Never leak the attempted password into the audit trail.
    assert 'WrongPass123!' not in json.dumps(vars(failure_record), default=str)


def test_repeated_login_failures_trigger_lockout_event(anon_client, caplog, monkeypatch):
    monkeypatch.setenv('LOGIN_LOCKOUT_THRESHOLD', '3')
    caplog.set_level(logging.INFO)
    anon_client.post('/auth/register', json={'email': 'audit-lockout@opm.io', 'password': STRONG_PASSWORD})

    for _ in range(3):
        response = anon_client.post('/auth/login', json={'email': 'audit-lockout@opm.io', 'password': 'WrongPass123!'})
        assert response.status_code == 401

    assert EVENT_LOGIN_LOCKOUT in _events(caplog)

    caplog.clear()
    # Even the correct password is now blocked while locked out.
    blocked_response = anon_client.post('/auth/login', json={'email': 'audit-lockout@opm.io', 'password': STRONG_PASSWORD})
    assert blocked_response.status_code == 401
    lockout_record = next(r for r in _audit_records(caplog) if r.event == EVENT_LOGIN_LOCKOUT)
    assert lockout_record.outcome == 'blocked'


def test_register_emits_audit_event(anon_client, caplog):
    caplog.set_level(logging.INFO)
    response = anon_client.post('/auth/register', json={'email': 'audit-register@opm.io', 'password': STRONG_PASSWORD})

    assert response.status_code == 201
    assert EVENT_REGISTER in _events(caplog)


# ── token refresh / revoke ────────────────────────────────────────────────────


def test_refresh_emits_audit_event(anon_client, caplog):
    anon_client.post('/auth/register', json={'email': 'audit-refresh@opm.io', 'password': STRONG_PASSWORD})
    anon_client.post('/auth/login', json={'email': 'audit-refresh@opm.io', 'password': STRONG_PASSWORD})
    caplog.set_level(logging.INFO)
    caplog.clear()

    response = anon_client.post('/auth/refresh')

    assert response.status_code == 200
    assert EVENT_TOKEN_REFRESH in _events(caplog)


def test_refresh_without_cookie_emits_failure_event(anon_client, caplog):
    caplog.set_level(logging.INFO)
    response = anon_client.post('/auth/refresh')

    assert response.status_code == 401
    assert EVENT_TOKEN_REFRESH_FAILURE in _events(caplog)


def test_logout_emits_token_revoke_event(client, caplog):
    caplog.set_level(logging.INFO)
    response = client.post('/auth/logout')

    assert response.status_code == 204
    assert EVENT_TOKEN_REVOKE in _events(caplog)


# ── admin CRUD / role changes ─────────────────────────────────────────────────


def _register_and_login(anon_client, email, password=STRONG_PASSWORD):
    anon_client.post('/auth/register', json={'email': email, 'password': password})
    login_response = anon_client.post('/auth/login', json={'email': email, 'password': password})
    return login_response.json()['access_token']


def test_admin_list_users_emits_audit_event(anon_client, caplog):
    token = _register_and_login(anon_client, 'audit-admin@opm.io')
    caplog.set_level(logging.INFO)
    caplog.clear()

    response = anon_client.get('/api/admin/users', headers={'Authorization': f'Bearer {token}'})

    assert response.status_code == 200
    record = next(r for r in _audit_records(caplog) if r.event == EVENT_ADMIN_USER_LIST)
    assert record.actor == 'audit-admin@opm.io'
    assert record.count == 1


def test_admin_create_user_emits_audit_event(anon_client, caplog):
    token = _register_and_login(anon_client, 'audit-admin2@opm.io')
    caplog.set_level(logging.INFO)
    caplog.clear()

    response = anon_client.post(
        '/api/admin/users',
        headers={'Authorization': f'Bearer {token}'},
        json={'email': 'audit-new-user@opm.io', 'password': OTHER_PASSWORD, 'role': 'user'},
    )

    assert response.status_code == 201
    record = next(r for r in _audit_records(caplog) if r.event == EVENT_ADMIN_USER_CREATE)
    assert record.actor == 'audit-admin2@opm.io'
    assert record.outcome == 'success'
    assert record.target == response.json()['id']
    # No password value anywhere in the emitted record.
    assert OTHER_PASSWORD not in json.dumps(vars(record), default=str)


def test_admin_role_change_emits_audit_event(anon_client, caplog):
    token = _register_and_login(anon_client, 'audit-admin3@opm.io')
    anon_client.post('/auth/register', json={'email': 'audit-member@opm.io', 'password': STRONG_PASSWORD})
    member_id = anon_client.post(
        '/api/admin/users',
        headers={'Authorization': f'Bearer {token}'},
        json={'email': 'audit-member2@opm.io', 'password': OTHER_PASSWORD, 'role': 'user'},
    ).json()['id']

    caplog.set_level(logging.INFO)
    caplog.clear()

    response = anon_client.patch(
        f'/api/admin/users/{member_id}',
        headers={'Authorization': f'Bearer {token}'},
        json={'role': 'admin'},
    )

    assert response.status_code == 200
    record = next(r for r in _audit_records(caplog) if r.event == EVENT_ADMIN_USER_ROLE_CHANGE)
    assert record.actor == 'audit-admin3@opm.io'
    assert record.target == member_id
    assert record.new_role == 'admin'
    assert record.outcome == 'success'


def test_admin_password_reset_emits_password_change_event(anon_client, caplog):
    token = _register_and_login(anon_client, 'audit-admin4@opm.io')
    member_id = anon_client.post(
        '/api/admin/users',
        headers={'Authorization': f'Bearer {token}'},
        json={'email': 'audit-member3@opm.io', 'password': OTHER_PASSWORD, 'role': 'user'},
    ).json()['id']

    caplog.set_level(logging.INFO)
    caplog.clear()

    new_password = 'Br4nd!NewPass9'
    response = anon_client.patch(
        f'/api/admin/users/{member_id}',
        headers={'Authorization': f'Bearer {token}'},
        json={'password': new_password},
    )

    assert response.status_code == 200
    record = next(r for r in _audit_records(caplog) if r.event == EVENT_CREDENTIAL_CHANGE)
    assert record.actor == 'audit-admin4@opm.io'
    assert record.target == member_id
    assert record.outcome == 'success'
    # The new password value must never appear anywhere in the audit record.
    assert new_password not in json.dumps(vars(record), default=str)


def test_admin_delete_user_emits_audit_event(anon_client, caplog):
    token = _register_and_login(anon_client, 'audit-admin5@opm.io')
    member_id = anon_client.post(
        '/api/admin/users',
        headers={'Authorization': f'Bearer {token}'},
        json={'email': 'audit-member4@opm.io', 'password': OTHER_PASSWORD, 'role': 'user'},
    ).json()['id']

    caplog.set_level(logging.INFO)
    caplog.clear()

    response = anon_client.delete(f'/api/admin/users/{member_id}', headers={'Authorization': f'Bearer {token}'})

    assert response.status_code == 204
    record = next(r for r in _audit_records(caplog) if r.event == EVENT_ADMIN_USER_DELETE)
    assert record.actor == 'audit-admin5@opm.io'
    assert record.target == member_id
    assert record.outcome == 'success'


# ── X-Request-ID correlation middleware ───────────────────────────────────────


def test_response_includes_generated_request_id(anon_client):
    response = anon_client.get('/api/health')
    assert 'x-request-id' in response.headers
    assert len(response.headers['x-request-id']) > 0


def test_inbound_request_id_is_echoed_back(anon_client):
    response = anon_client.get('/api/health', headers={'X-Request-ID': 'my-correlation-id-123'})
    assert response.headers['x-request-id'] == 'my-correlation-id-123'


def test_login_audit_event_carries_request_id(anon_client, caplog):
    caplog.set_level(logging.INFO)
    anon_client.post('/auth/register', json={'email': 'audit-reqid@opm.io', 'password': STRONG_PASSWORD})
    caplog.clear()

    response = anon_client.post(
        '/auth/login',
        headers={'X-Request-ID': 'fixed-request-id'},
        json={'email': 'audit-reqid@opm.io', 'password': STRONG_PASSWORD},
    )

    assert response.status_code == 200
    record = next(r for r in _audit_records(caplog) if r.event == EVENT_LOGIN_SUCCESS)
    assert record.request_id == 'fixed-request-id'


# ── redaction (defense in depth) ──────────────────────────────────────────────


def test_formatter_redacts_password_field():
    formatter = RedactingJSONFormatter()
    record = logging.LogRecord(
        name='audit', level=logging.INFO, pathname=__file__, lineno=1,
        msg='auth.login.failure', args=None, exc_info=None,
    )
    record.password = 'SuperSecret123!'
    record.actor = 'user@opm.io'
    record.outcome = 'failure'

    output = formatter.format(record)
    data = json.loads(output)

    assert data['password'] == '***REDACTED***'
    assert 'SuperSecret123!' not in output
    assert data['actor'] == 'user@opm.io'


def test_formatter_redacts_token_and_hash_fields():
    formatter = RedactingJSONFormatter()
    record = logging.LogRecord(
        name='audit', level=logging.INFO, pathname=__file__, lineno=1,
        msg='auth.token.issued', args=None, exc_info=None,
    )
    # Deliberately fake, non-credential-shaped values: the redactor strips by
    # key name, so the content is irrelevant, and realistic-looking JWT/bcrypt
    # literals trip secret scanners (GitGuardian/gitleaks) on every scan.
    record.access_token = 'fake-access-token-value-for-redaction-test'
    record.password_hash = 'fake-password-hash-value-for-redaction-test'

    output = formatter.format(record)

    assert 'fake-access-token-value' not in output
    assert 'fake-password-hash-value' not in output
    assert output.count('***REDACTED***') == 2


def test_formatter_redacts_nested_secret_fields():
    formatter = RedactingJSONFormatter()
    record = logging.LogRecord(
        name='audit', level=logging.INFO, pathname=__file__, lineno=1,
        msg='test.nested', args=None, exc_info=None,
    )
    record.details = {'password': 'NestedSecret1!', 'email': 'user@opm.io'}

    output = formatter.format(record)
    data = json.loads(output)

    assert data['details']['password'] == '***REDACTED***'
    assert data['details']['email'] == 'user@opm.io'
    assert 'NestedSecret1!' not in output


def test_audit_event_pipeline_redacts_accidental_secret_field():
    """End-to-end: audit_event -> logger -> RedactingJSONFormatter -> stream.

    Even if a caller accidentally passes a secret-looking field into
    audit_event's **extra, it must never reach the rendered log output.
    """
    buffer = io.StringIO()
    configure_logging(stream=buffer)
    try:
        audit_event(
            'test.accidental.leak',
            actor='someone@opm.io',
            outcome='success',
            password='TopSecret1!',
            token='abc.def.ghi',
        )
    finally:
        configure_logging()  # restore the default stdout handler

    output = buffer.getvalue()
    assert 'TopSecret1!' not in output
    assert 'abc.def.ghi' not in output
    assert '***REDACTED***' in output
    assert 'test.accidental.leak' in output


def test_configure_logging_is_idempotent():
    root = logging.getLogger()
    before = sum(1 for h in root.handlers if getattr(h, '_is_audit_handler', False))
    configure_logging()
    configure_logging()
    after = sum(1 for h in root.handlers if getattr(h, '_is_audit_handler', False))
    assert before == 1
    assert after == 1
