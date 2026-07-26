"""Stage 2 of OPM-FLAG-REG-001: flag-gated extended fields on /auth/register.

The acceptance matrix these cover is docs/features/registration-feature.md §7
(Agent B) and §8. The organising idea is that **the OFF path must be
indistinguishable from main** (guardrail 2) and **no flag problem may ever
surface to a caller** (guardrail 3), so most of what is asserted here is an
absence: no column written, no 5xx, no PII in a log line.

Two levels are tested separately on purpose:

* endpoint behaviour, with ``app.api.auth.extended_enabled`` patched, so the
  flag state is exact and the tests do not depend on Flagsmith at all;
* :mod:`app.core.flags` itself, against a fake client, so the off-safe
  failure semantics are proven rather than assumed.

Flags are off by default in the suite: ``FLAGSMITH_SERVER_KEY`` is unset, so
``init_flags()`` in ``create_app()`` is a no-op and ``extended_enabled()``
returns False for everyone. The OFF cases therefore need no mocking, which is
what makes them a genuine regression guard.
"""
import json
import logging
import sys

import pytest

import app.core.flags as flags_module
import app.database.base as db_module
from app.audit import EVENT_REGISTER, EVENT_REGISTER_EXTENDED, RedactingJSONFormatter
from app.core.flags import (
    DEFAULT_REFRESH_INTERVAL_SECONDS,
    FLAG_REGISTRATION_EXTENDED,
    MIN_REFRESH_INTERVAL_SECONDS,
    extended_enabled,
    get_flagsmith_config,
    init_flags,
    reset_flags_client,
)
from app.core.registration import MARKETING_CONSENT_VERSION
from app.models.auth import User

STRONG_PASSWORD = 'Str0ng!Pass1'
SESSION_ID = 'b7f1c2de-3a4b-4c5d-8e9f-0a1b2c3d4e5f'

# Raw values a user would type, and what the contract says we store. The phone
# carries human separators precisely so the normalisation is observable.
COMPANY_NAME = 'Acme Ltd'
JOB_ROLE = 'Platform Engineer'
PHONE_TYPED = '+61 412 345 678'
PHONE_STORED = '+61412345678'

EXTENDED_BLOCK = {
    'companyName': COMPANY_NAME,
    'jobRole': JOB_ROLE,
    'phone': PHONE_TYPED,
    'marketingOptIn': True,
}


def _register(client, email, **body):
    return client.post('/auth/register', json={'email': email, 'password': STRONG_PASSWORD, **body})


def _user(email):
    """Read a user straight from the test database, bypassing the API.

    ``conftest`` repoints ``db_module.SessionLocal`` at the in-memory test
    database, so this sees exactly what the endpoint committed.
    """
    with db_module.SessionLocal() as session:
        return session.query(User).filter(User.email == email).one_or_none()


@pytest.fixture
def flag_on(monkeypatch):
    """Force the flag on for every visitor, recording the identities asked about.

    Patches the name as imported into ``app.api.auth``; patching the flags
    module would miss the ``from ... import`` binding the endpoint actually uses.
    """
    seen = []

    def _enabled(session_id):
        seen.append(session_id)
        return True

    monkeypatch.setattr('app.api.auth.extended_enabled', _enabled)
    return seen


def _audit_records(caplog):
    return [r for r in caplog.records if r.name == 'audit']


# ── Flag OFF: must be byte-for-byte the behaviour on main ────────────────────


def test_off_ignores_extended_block_entirely(anon_client):
    response = _register(anon_client, 'off-extended@opm.io', sessionId=SESSION_ID, extended=EXTENDED_BLOCK)

    assert response.status_code == 201
    user = _user('off-extended@opm.io')
    assert user.company_name is None
    assert user.job_role is None
    assert user.phone is None
    # False rather than None: the ORM column carries default=False, so every
    # insert sets it, OFF path included. That is why opt-in alone is not
    # evidence — "never asked" and "asked and declined" both read False here,
    # and only the consent version below tells them apart.
    assert user.marketing_opt_in is False
    assert user.marketing_consent_at is None
    assert user.marketing_consent_version is None


def test_off_without_session_id_still_registers(anon_client):
    """Regression guard for §4.3: sessionId is optional on a public endpoint."""
    response = _register(anon_client, 'off-nosession@opm.io')

    assert response.status_code == 201
    assert response.json()['id'].startswith('usr_')


def test_off_does_not_validate_extended_values(anon_client):
    """An invalid block is ignored, not rejected, while the flag is off.

    Validating on the OFF path would turn a stray or malformed block into a 422
    where main returns 201 — a behaviour change under a disabled flag, which is
    exactly what guardrail 2 forbids.
    """
    response = _register(
        anon_client,
        'off-invalid@opm.io',
        sessionId=SESSION_ID,
        extended={'companyName': 'x' * 5000, 'phone': 'definitely-not-a-phone'},
    )

    assert response.status_code == 201
    assert _user('off-invalid@opm.io').phone is None


def test_off_emits_no_extended_audit_event(anon_client, caplog):
    caplog.set_level(logging.INFO)

    _register(anon_client, 'off-audit@opm.io', sessionId=SESSION_ID, extended=EXTENDED_BLOCK)

    events = [r.event for r in _audit_records(caplog)]
    assert EVENT_REGISTER in events
    assert EVENT_REGISTER_EXTENDED not in events


# ── Flag ON: fields are honoured ─────────────────────────────────────────────


def test_on_persists_extended_fields_with_consent_evidence(anon_client, flag_on):
    response = _register(anon_client, 'on-valid@opm.io', sessionId=SESSION_ID, extended=EXTENDED_BLOCK)

    assert response.status_code == 201
    user = _user('on-valid@opm.io')
    assert user.company_name == COMPANY_NAME
    assert user.job_role == JOB_ROLE
    # Stored normalised, never as typed.
    assert user.phone == PHONE_STORED
    assert user.marketing_opt_in is True
    # Consent is evidence, not a boolean (guardrail 8).
    assert user.marketing_consent_version == MARKETING_CONSENT_VERSION
    assert user.marketing_consent_at is not None


def test_on_evaluates_the_flag_for_the_submitted_session_id(anon_client, flag_on):
    _register(anon_client, 'on-identity@opm.io', sessionId=SESSION_ID, extended=EXTENDED_BLOCK)

    assert flag_on == [SESSION_ID]


def test_on_declining_marketing_records_no_consent_evidence(anon_client, flag_on):
    _register(
        anon_client,
        'on-declined@opm.io',
        sessionId=SESSION_ID,
        extended={'companyName': COMPANY_NAME, 'marketingOptIn': False},
    )

    user = _user('on-declined@opm.io')
    assert user.marketing_opt_in is False
    # Nothing was agreed to, so there is nothing to evidence.
    assert user.marketing_consent_at is None
    assert user.marketing_consent_version is None


def test_on_without_extended_block_registers_normally(anon_client, flag_on):
    response = _register(anon_client, 'on-noblock@opm.io', sessionId=SESSION_ID)

    assert response.status_code == 201
    assert _user('on-noblock@opm.io').company_name is None


def test_on_blank_strings_count_as_not_supplied(anon_client, flag_on):
    """Optional when present (guardrail 6): an empty input is absence, not error."""
    response = _register(
        anon_client,
        'on-blank@opm.io',
        sessionId=SESSION_ID,
        extended={'companyName': '   ', 'jobRole': '', 'phone': '', 'marketingOptIn': False},
    )

    assert response.status_code == 201
    user = _user('on-blank@opm.io')
    assert user.company_name is None
    assert user.job_role is None
    assert user.phone is None


def test_on_session_id_is_never_persisted(anon_client, flag_on):
    _register(anon_client, 'on-nosessionstore@opm.io', sessionId=SESSION_ID, extended=EXTENDED_BLOCK)

    user = _user('on-nosessionstore@opm.io')
    stored = {str(getattr(user, column.name)) for column in User.__table__.columns}
    assert SESSION_ID not in stored


# ── Flag ON: rejection must not leave a half-created account ─────────────────


@pytest.mark.parametrize(
    'bad_block,expected_error',
    [
        ({'phone': 'not-a-phone'}, 'phone is not a valid phone number'),
        ({'phone': '1' * 40}, 'phone must be at most 32 characters'),
        ({'companyName': 'x' * 201}, 'company_name must be at most 200 characters'),
        ({'jobRole': 'x' * 121}, 'job_role must be at most 120 characters'),
    ],
)
def test_on_invalid_extended_returns_422_and_creates_no_user(anon_client, flag_on, bad_block, expected_error):
    response = _register(anon_client, 'on-invalid@opm.io', sessionId=SESSION_ID, extended=bad_block)

    assert response.status_code == 422
    assert response.json() == {'error': expected_error}
    # §8 matrix row 4: validation runs before the account exists, so a rejected
    # block can never leave an orphaned user behind.
    assert _user('on-invalid@opm.io') is None


def test_on_rejected_registration_can_be_retried(anon_client, flag_on):
    """The 409 path must stay clear after a 422 — proof nothing was written."""
    first = _register(anon_client, 'on-retry@opm.io', sessionId=SESSION_ID, extended={'phone': 'nope'})
    assert first.status_code == 422

    second = _register(anon_client, 'on-retry@opm.io', sessionId=SESSION_ID, extended=EXTENDED_BLOCK)
    assert second.status_code == 201


# ── Audit: the event fires, and carries no field values ──────────────────────


def test_on_emits_extended_audit_event_naming_only_the_fields(anon_client, flag_on, caplog):
    caplog.set_level(logging.INFO)

    _register(anon_client, 'on-audit@opm.io', sessionId=SESSION_ID, extended=EXTENDED_BLOCK)

    record = next(r for r in _audit_records(caplog) if r.event == EVENT_REGISTER_EXTENDED)
    assert record.actor == 'on-audit@opm.io'
    assert record.outcome == 'success'
    assert record.target.startswith('usr_')
    assert record.fields == 'company_name,job_role,marketing_opt_in,phone'


def test_on_audit_log_lines_contain_no_extended_values(anon_client, flag_on, caplog):
    """Guardrail 7, asserted against the rendered line, not the record.

    Checking attributes would miss a value that reaches stdout via the message
    or an unexpected field, so this formats every audit record exactly as the
    log driver would ship it and searches the resulting text.
    """
    caplog.set_level(logging.INFO)

    _register(anon_client, 'on-nopii@opm.io', sessionId=SESSION_ID, extended=EXTENDED_BLOCK)

    formatter = RedactingJSONFormatter()
    rendered = '\n'.join(formatter.format(r) for r in _audit_records(caplog))

    assert rendered  # guard against the assertions below passing vacuously
    for secret in (PHONE_TYPED, PHONE_STORED, COMPANY_NAME, JOB_ROLE, SESSION_ID, STRONG_PASSWORD):
        assert secret not in rendered
    # The field *names* are what the audit trail is for, so they must be there.
    assert 'company_name' in rendered


# ── app.core.flags: off-safe under every failure mode (guardrail 3) ──────────


class _FakeFlags:
    def __init__(self, enabled):
        self._enabled = enabled

    def is_feature_enabled(self, feature_name):
        assert feature_name == FLAG_REGISTRATION_EXTENDED
        return self._enabled


class _FakeClient:
    """Stands in for the Flagsmith client, recording how it was called."""

    def __init__(self, enabled=True, raises=None):
        self._enabled = enabled
        self._raises = raises
        self.calls = []

    def get_identity_flags(self, identifier, transient=False):
        self.calls.append({'identifier': identifier, 'transient': transient})
        if self._raises is not None:
            raise self._raises
        return _FakeFlags(self._enabled)


@pytest.fixture
def fake_client(monkeypatch):
    def _install(**kwargs):
        client = _FakeClient(**kwargs)
        monkeypatch.setattr(flags_module, '_client', client)
        return client

    yield _install
    reset_flags_client()


def test_extended_enabled_false_without_a_session_id(fake_client):
    fake_client(enabled=True)

    # No identity means no bucket to fall in, so there is nothing to turn on.
    assert extended_enabled(None) is False
    assert extended_enabled('') is False


def test_extended_enabled_false_when_client_never_initialised():
    reset_flags_client()

    assert extended_enabled(SESSION_ID) is False


def test_extended_enabled_true_when_flag_is_on(fake_client):
    fake_client(enabled=True)

    assert extended_enabled(SESSION_ID) is True


def test_extended_enabled_asks_for_a_transient_identity(fake_client):
    """Anonymous visitors must not accumulate as stored Flagsmith identities (§3.4)."""
    client = fake_client(enabled=True)

    extended_enabled(SESSION_ID)

    assert client.calls == [{'identifier': SESSION_ID, 'transient': True}]


def test_extended_enabled_is_deterministic_for_one_session(fake_client):
    fake_client(enabled=True)

    assert len({extended_enabled(SESSION_ID) for _ in range(5)}) == 1


@pytest.mark.parametrize('failure', [RuntimeError('flagsmith is down'), TimeoutError(), ValueError('bad key')])
def test_extended_enabled_swallows_every_lookup_failure(fake_client, failure):
    fake_client(raises=failure)

    # A flag lookup that raises into a public registration would be a 5xx on a
    # path that has a perfectly good legacy behaviour available.
    assert extended_enabled(SESSION_ID) is False


def test_outage_during_registration_still_returns_201(anon_client, fake_client, caplog):
    """End-to-end proof of the outage path: Flagsmith down ⇒ legacy 201, no 5xx."""
    caplog.set_level(logging.INFO)
    fake_client(raises=RuntimeError('flagsmith is down'))

    response = _register(anon_client, 'outage@opm.io', sessionId=SESSION_ID, extended=EXTENDED_BLOCK)

    assert response.status_code == 201
    assert _user('outage@opm.io').company_name is None


def test_init_flags_without_a_server_key_is_a_no_op():
    reset_flags_client()

    assert init_flags({}) is False
    assert flags_module.get_client() is None


def test_init_flags_survives_an_unusable_key():
    """A bad key must degrade to flags-off, not take the process down at startup.

    The SDK does not necessarily reject the key eagerly — construction can
    succeed and fail later on the first poll — so this asserts the property that
    actually matters (startup completes, lookups stay safe) rather than a
    particular return value.
    """
    reset_flags_client()
    try:
        init_flags({'FLAGSMITH_SERVER_KEY': 'ser.not-a-real-key', 'FLAGSMITH_API_URL': 'http://127.0.0.1:1/api/v1/'})
        assert extended_enabled(SESSION_ID) is False
    finally:
        reset_flags_client()


def test_init_flags_degrades_when_the_sdk_is_not_installed(monkeypatch):
    """requirements.txt pins the SDK, but a partial install must not stop the API."""
    reset_flags_client()
    # A None entry in sys.modules makes the `from flagsmith import ...` inside
    # init_flags raise ImportError, which is what a partial install looks like.
    monkeypatch.setitem(sys.modules, 'flagsmith', None)
    try:
        assert init_flags({'FLAGSMITH_SERVER_KEY': 'ser.key'}) is False
        assert flags_module.get_client() is None
        assert extended_enabled(SESSION_ID) is False
    finally:
        reset_flags_client()


def test_init_flags_degrades_when_client_construction_raises(monkeypatch):
    reset_flags_client()
    import flagsmith as flagsmith_sdk

    def _explode(**kwargs):
        raise RuntimeError('DNS blackhole')

    monkeypatch.setattr(flagsmith_sdk, 'Flagsmith', _explode)
    try:
        assert init_flags({'FLAGSMITH_SERVER_KEY': 'ser.key'}) is False
        assert flags_module.get_client() is None
    finally:
        reset_flags_client()


def test_init_flags_never_logs_the_server_key(monkeypatch, caplog):
    reset_flags_client()
    caplog.set_level(logging.DEBUG)
    import flagsmith as flagsmith_sdk

    def _explode(**kwargs):
        raise RuntimeError('bad key: ser.super-secret-value')

    monkeypatch.setattr(flagsmith_sdk, 'Flagsmith', _explode)
    try:
        init_flags({'FLAGSMITH_SERVER_KEY': 'ser.super-secret-value'})
        # The failure is logged without exc_info precisely so an SDK exception
        # carrying the key cannot drag it into the log.
        assert 'ser.super-secret-value' not in caplog.text
    finally:
        reset_flags_client()


def test_unknown_flags_resolve_to_disabled():
    """A key that does not exist yet in Flagsmith is the normal dark-launch state.

    Without the default handler the SDK raises FlagsmithFeatureDoesNotExistError
    for it, which would surface as a 500 on a public endpoint.
    """
    default = flags_module._default_flag_handler('some_feature_nobody_created')

    assert default.enabled is False
    assert default.value is None


def test_init_flags_is_idempotent():
    reset_flags_client()

    assert init_flags({}) is False
    assert init_flags({'FLAGSMITH_SERVER_KEY': 'ser.something'}) is False, 'second call must not rebuild the client'


# ── Configuration: the poll interval protects a shared quota ─────────────────


def test_config_defaults_to_disabled_without_a_key():
    config = get_flagsmith_config({})

    assert config.enabled is False
    assert config.refresh_interval_seconds == DEFAULT_REFRESH_INTERVAL_SECONDS


def test_config_clamps_a_too_frequent_poll():
    """Below the floor the monthly API-call budget (§3.4) does not survive."""
    config = get_flagsmith_config({'FLAGSMITH_SERVER_KEY': 'ser.key', 'FLAGSMITH_REFRESH_INTERVAL_SECONDS': '5'})

    assert config.enabled is True
    assert config.refresh_interval_seconds == MIN_REFRESH_INTERVAL_SECONDS


def test_config_accepts_a_slower_poll():
    config = get_flagsmith_config({'FLAGSMITH_SERVER_KEY': 'ser.key', 'FLAGSMITH_REFRESH_INTERVAL_SECONDS': '900'})

    assert config.refresh_interval_seconds == 900


def test_config_falls_back_on_a_malformed_interval():
    config = get_flagsmith_config({'FLAGSMITH_SERVER_KEY': 'ser.key', 'FLAGSMITH_REFRESH_INTERVAL_SECONDS': 'soon'})

    assert config.refresh_interval_seconds == DEFAULT_REFRESH_INTERVAL_SECONDS


def test_config_never_logs_the_server_key(caplog):
    caplog.set_level(logging.DEBUG)

    get_flagsmith_config({'FLAGSMITH_SERVER_KEY': 'ser.super-secret-value'})

    assert 'ser.super-secret-value' not in caplog.text


# ── OpenAPI: the published contract matches §4.3 ─────────────────────────────


def test_register_schema_keeps_session_id_and_extended_optional(anon_client):
    schema = anon_client.get('/api/openapi.json').json()
    body = schema['paths']['/auth/register']['post']['requestBody']['content']['application/json']['schema']
    ref = body['$ref'].rsplit('/', 1)[-1]
    register_request = schema['components']['schemas'][ref]

    assert sorted(register_request['required']) == ['email', 'password']
    assert 'sessionId' in register_request['properties']
    assert 'extended' in register_request['properties']


def test_login_schema_is_untouched_by_the_extended_fields(anon_client):
    """RegisterRequest subclasses AuthRequest; login must not inherit the widening."""
    schema = anon_client.get('/api/openapi.json').json()
    body = schema['paths']['/auth/login']['post']['requestBody']['content']['application/json']['schema']
    ref = body['$ref'].rsplit('/', 1)[-1]
    login_request = schema['components']['schemas'][ref]

    assert set(login_request['properties']) == {'email', 'password'}
    assert json.dumps(login_request).count('sessionId') == 0
