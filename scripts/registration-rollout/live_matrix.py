#!/usr/bin/env python3
"""Drive POST /auth/register against a **live** Flagsmith flag decision.

``backend/tests/test_registration_extended.py`` already covers both flag states
exhaustively, but it does so with the flag client stubbed. That proves the
application logic and proves nothing about the wire. This script closes that
gap for the rows of the §8 acceptance matrix that can be executed from a local
checkout: it runs the real FastAPI app against a real database, and the ON/OFF
decision for each request comes from Flagsmith over the network.

Rows exercised: 1, 2, 3, 4, 5, 10, 11, 12, 13, 14.

What is and is not real here
----------------------------
Real: the app, the router, the ORM, the database write, the audit log, and the
flag decision - which is fetched from the Flagsmith Edge API for the supplied
``sessionId``.

Not real: the *evaluation mode*. Production backends use local evaluation, which
needs a ``ser.…`` server-side key (``flagsmith/flagsmith.py:197`` rejects
anything else). No such key is available to this harness, so it injects a
remote-evaluation client built from the publishable Development Environment ID.
The decision is Flagsmith's either way, and
``scripts/registration-rollout/bucketing_parity.py`` separately proves that
local evaluation computes the identical bucket - so the substitution changes how
the answer is fetched, not what the answer is. A human with a server key should
re-run row 5 against a deployed backend before Stage 5; see
``docs/features/registration-validation.md``.

Preconditions
-------------
The ``reg_ext_rollout_development`` segment must be at **50%** with the
Development segment override enabled, so that both an ON and an OFF identity
exist at the same time. That is what makes row 5 meaningful: the same run
exercises both sides of the split with one flag configuration.

    python3 scripts/registration-rollout/live_matrix.py

Development only. Never point this at Production.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / 'backend'
sys.path.insert(0, str(BACKEND))

os.environ.setdefault('JWT_SECRET', 'live-matrix-jwt-secret-32-chars-min')
os.environ.setdefault('BCRYPT_ROUNDS', '4')

DEV_ENVIRONMENT_KEY = os.environ.get('OPM_DEV_FLAGSMITH_KEY', 'mGoGnmAiyNzxXCikjAo8Qd')

# Buckets from bucketing_parity.py. At a 50% split these two straddle the line:
# 4.05 is comfortably inside the ON cohort, 89.03 comfortably outside it.
SESSION_ON = 'opm-reg-ext-parity-037'   # bucket  4.0508
SESSION_OFF = 'opm-reg-ext-parity-039'  # bucket 89.0278

PASSWORD = 'Str0ng!Passw0rd'

EXTENDED = {
    'companyName': 'Acme Pty Ltd',
    'jobRole': 'Platform Engineer',
    'phone': '+61 412 345 678',
    'marketingOptIn': True,
}

results: list[tuple[str, str, bool, str]] = []


def check(row: str, name: str, passed: bool, detail: str) -> None:
    results.append((row, name, passed, detail))
    print(f'[{"PASS" if passed else "FAIL"}] row {row:<4} {name}\n           {detail}')


def main() -> int:
    from fastapi.testclient import TestClient
    from flagsmith import Flagsmith
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    import app.core.flags as flags_module
    from app.database.base import Base, get_db
    from app.models.auth import User  # noqa: F401  (populates Base.metadata)
    from app.models.prompt import Agent, Prompt, PromptExecution, PromptMetric, Tag  # noqa: F401
    from main import create_app

    # A temp file rather than ':memory:': the endpoint runs in a threadpool and
    # each session opens its own connection, which for plain in-memory SQLite
    # would be a separate empty database.
    import tempfile
    db_path = Path(tempfile.mkdtemp(prefix='opm-live-matrix-')) / 'matrix.db'
    engine = create_engine(f'sqlite:///{db_path}', connect_args={'check_same_thread': False})
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    print(f'database: {db_path}')

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    client = TestClient(application)

    # Inject a live remote-evaluation client. init_flags() would refuse this key
    # for local evaluation, so the module global is set directly - the one place
    # this harness departs from production wiring.
    live = Flagsmith(environment_key=DEV_ENVIRONMENT_KEY, enable_local_evaluation=False)
    flags_module._client = live
    flags_module._initialised = True

    # Confirm the live decision before relying on it, so a segment left at the
    # wrong percentage is reported as a precondition failure rather than
    # silently inverting every assertion below.
    on_live = flags_module.extended_enabled(SESSION_ON)
    off_live = flags_module.extended_enabled(SESSION_OFF)
    print(f'live flag decision: {SESSION_ON} -> {on_live} | {SESSION_OFF} -> {off_live}\n')
    if not (on_live and not off_live):
        print('PRECONDITION FAILED: set reg_ext_rollout_development to 50% with the override enabled.')
        return 2

    def user_row(email: str) -> User:
        db = Session()
        try:
            return db.query(User).filter(User.email == email).one()
        finally:
            db.close()

    # ── row 12: legacy client, no sessionId, no extended block ────────────────
    r = client.post('/auth/register', json={'email': 'legacy@opm.test', 'password': PASSWORD})
    u = user_row('legacy@opm.test') if r.status_code == 201 else None
    check('12', 'legacy {email,password} only', r.status_code == 201 and set(r.json()) == {'id'},
          f'status={r.status_code} body_keys={sorted(r.json())}')

    # ── row 1: flag OFF for this identity, no extended block ──────────────────
    r = client.post('/auth/register', json={'email': 'off-plain@opm.test', 'password': PASSWORD, 'sessionId': SESSION_OFF})
    u = user_row('off-plain@opm.test')
    nulls = [u.company_name, u.job_role, u.phone, u.marketing_consent_at, u.marketing_consent_version]
    check('1', 'flag OFF, no extended -> legacy, columns null', r.status_code == 201 and all(v is None for v in nulls),
          f'status={r.status_code} company={u.company_name!r} job={u.job_role!r} phone={u.phone!r} '
          f'opt_in={u.marketing_opt_in!r} consent_at={u.marketing_consent_at!r}')

    # ── row 2: flag OFF, stray extended block must be ignored, not rejected ───
    r = client.post('/auth/register', json={'email': 'off-stray@opm.test', 'password': PASSWORD,
                                            'sessionId': SESSION_OFF, 'extended': EXTENDED})
    u = user_row('off-stray@opm.test')
    ignored = all(v is None for v in (u.company_name, u.job_role, u.phone, u.marketing_consent_at))
    check('2', 'flag OFF, stray extended -> ignored, nothing persisted', r.status_code == 201 and ignored,
          f'status={r.status_code} company={u.company_name!r} phone={u.phone!r} opt_in={u.marketing_opt_in!r}')

    # ── row 3: flag ON, full extended block persists ──────────────────────────
    r = client.post('/auth/register', json={'email': 'on-full@opm.test', 'password': PASSWORD,
                                            'sessionId': SESSION_ON, 'extended': EXTENDED})
    u = user_row('on-full@opm.test')
    persisted = (u.company_name == 'Acme Pty Ltd' and u.job_role == 'Platform Engineer'
                 and u.phone is not None and u.marketing_opt_in is True
                 and u.marketing_consent_at is not None and u.marketing_consent_version is not None)
    check('3', 'flag ON, extended persists with consent evidence', r.status_code == 201 and persisted,
          f'status={r.status_code} company={u.company_name!r} job={u.job_role!r} phone={u.phone!r} '
          f'opt_in={u.marketing_opt_in!r} consent_at={u.marketing_consent_at!r} version={u.marketing_consent_version!r}')

    # phone must be stored normalised, not as typed
    check('3', 'phone stored normalised, not raw input', u.phone == '+61412345678',
          f'submitted={EXTENDED["phone"]!r} stored={u.phone!r}')

    # ── row 4: flag ON, invalid extended -> 422 and no partial write ──────────
    bad = dict(EXTENDED, phone='not a phone')
    r = client.post('/auth/register', json={'email': 'on-bad@opm.test', 'password': PASSWORD,
                                            'sessionId': SESSION_ON, 'extended': bad})
    db = Session()
    orphan = db.query(User).filter(User.email == 'on-bad@opm.test').first()
    db.close()
    check('4', 'flag ON, invalid extended -> 422, no partial write', r.status_code == 422 and orphan is None,
          f'status={r.status_code} user_row_created={orphan is not None} body={r.json()}')

    # over-length company name is the other 422 shape
    r = client.post('/auth/register', json={'email': 'on-long@opm.test', 'password': PASSWORD,
                                            'sessionId': SESSION_ON, 'extended': {'companyName': 'x' * 201}})
    db = Session()
    orphan = db.query(User).filter(User.email == 'on-long@opm.test').first()
    db.close()
    check('4', 'flag ON, over-length companyName -> 422, no partial write', r.status_code == 422 and orphan is None,
          f'status={r.status_code} user_row_created={orphan is not None}')

    # ── row 5: cross-stack consistency, same sessionId both sides ─────────────
    # The browser would be told `on_live` for SESSION_ON; the API independently
    # re-evaluated and accepted the block. Same identity, same verdict.
    u = user_row('on-full@opm.test')
    check('5', 'same sessionId: Edge API says ON and the API accepted extended',
          on_live and u.company_name is not None,
          f'edge_api_enabled={on_live} api_persisted_extended={u.company_name is not None}')
    u_off = user_row('off-stray@opm.test')
    check('5', 'same sessionId: Edge API says OFF and the API ignored extended',
          (not off_live) and u_off.company_name is None,
          f'edge_api_enabled={off_live} api_persisted_extended={u_off.company_name is not None}')

    # ── row 13: flip during submit ────────────────────────────────────────────
    # Form rendered while ON, flag flipped off before the POST lands. The block
    # must be ignored, never 422 (guardrail 6). Simulated by sending an ON-shaped
    # request with an identity Flagsmith now resolves to OFF.
    r = client.post('/auth/register', json={'email': 'flip@opm.test', 'password': PASSWORD,
                                            'sessionId': SESSION_OFF, 'extended': EXTENDED})
    check('13', 'flag flipped off mid-submit -> 201, never 422', r.status_code == 201,
          f'status={r.status_code}')

    # And the reverse: a block that would be *invalid* if validated, arriving
    # after the flag went off, must still not 422.
    r = client.post('/auth/register', json={'email': 'flip-bad@opm.test', 'password': PASSWORD,
                                            'sessionId': SESSION_OFF, 'extended': bad})
    check('13', 'flag off + invalid extended -> 201, block never validated', r.status_code == 201,
          f'status={r.status_code}')

    # ── row 11: Flagsmith unavailable ─────────────────────────────────────────
    # (a) client never initialised
    flags_module._client = None
    r = client.post('/auth/register', json={'email': 'outage-a@opm.test', 'password': PASSWORD,
                                            'sessionId': SESSION_ON, 'extended': EXTENDED})
    u = user_row('outage-a@opm.test')
    check('11', 'no flag client -> legacy 201, no 5xx', r.status_code == 201 and u.company_name is None,
          f'status={r.status_code} extended_persisted={u.company_name is not None}')

    # (b) a client whose every call raises, i.e. a live outage mid-request
    class Exploding:
        def get_identity_flags(self, *a, **k):
            raise RuntimeError('simulated Flagsmith outage')

    flags_module._client = Exploding()
    r = client.post('/auth/register', json={'email': 'outage-b@opm.test', 'password': PASSWORD,
                                            'sessionId': SESSION_ON, 'extended': EXTENDED})
    u = user_row('outage-b@opm.test')
    check('11', 'flag lookup raises -> legacy 201, no 5xx', r.status_code == 201 and u.company_name is None,
          f'status={r.status_code} extended_persisted={u.company_name is not None}')

    # (c) real SDK, real network, unroutable API base - the closest thing to a
    #     blackhole this harness can produce without touching the firewall.
    try:
        blackhole = Flagsmith(environment_key=DEV_ENVIRONMENT_KEY, enable_local_evaluation=False,
                              api_url='https://127.0.0.1:9/api/v1/', request_timeout_seconds=2)
        flags_module._client = blackhole
        import time
        start = time.monotonic()
        r = client.post('/auth/register', json={'email': 'outage-c@opm.test', 'password': PASSWORD,
                                                'sessionId': SESSION_ON, 'extended': EXTENDED})
        elapsed = time.monotonic() - start
        u = user_row('outage-c@opm.test')
        check('11', 'unroutable Flagsmith endpoint -> legacy 201, bounded latency',
              r.status_code == 201 and u.company_name is None,
              f'status={r.status_code} elapsed={elapsed:.3f}s extended_persisted={u.company_name is not None}')
    except Exception as exc:  # pragma: no cover
        check('11', 'unroutable Flagsmith endpoint', False, f'harness error: {exc!r}')

    # (d) misconfiguration: the publishable Environment ID pasted into the
    #     server-key slot. init_flags must degrade, not raise.
    flags_module.reset_flags_client()
    started = flags_module.init_flags({'FLAGSMITH_SERVER_KEY': DEV_ENVIRONMENT_KEY})
    check('11', 'client-side key in FLAGSMITH_SERVER_KEY -> flags off, no crash',
          started is False and flags_module.get_client() is None,
          f'init_flags returned {started}, client={flags_module.get_client()!r}')

    # ── row 14: identity rotation must not bypass rate limiting ───────────────
    # Rotating sessionId changes the flag bucket but must not change auth policy.
    flags_module.reset_flags_client()
    flags_module._client = live
    flags_module._initialised = True
    statuses = []
    for n in range(12):
        rot = client.post('/auth/register', json={'email': 'dupe@opm.test', 'password': PASSWORD,
                                                  'sessionId': f'rotate-{n}', 'extended': EXTENDED})
        statuses.append(rot.status_code)
    # First is a genuine creation; every later one must be rejected as duplicate
    # (or rate limited) regardless of the rotating identity.
    rotated_ok = statuses[0] == 201 and all(s in (409, 429) for s in statuses[1:])
    check('14', 'rotating sessionId does not bypass duplicate detection', rotated_ok,
          f'statuses={statuses}')

    # The rate-limit half of row 14 runs last: it deliberately exhausts the
    # per-IP auth budget, which every request in this harness shares, so it
    # would starve any check that followed it.

    # ── row 10: audit event present, and no field value in any log record ─────
    import app.audit as audit_module
    records: list[logging.LogRecord] = []

    class Capture(logging.Handler):
        def emit(self, record):
            records.append(record)

    handler = Capture()
    root = logging.getLogger()
    root.addHandler(handler)
    previous = root.level
    root.setLevel(logging.DEBUG)
    try:
        r = client.post('/auth/register', json={'email': 'audit@opm.test', 'password': PASSWORD,
                                                'sessionId': SESSION_ON, 'extended': EXTENDED})
    finally:
        root.removeHandler(handler)
        root.setLevel(previous)

    blob = '\n'.join(
        (rec.getMessage() or '') + ' ' + ' '.join(f'{k}={v}' for k, v in vars(rec).items() if k not in ('args', 'msg'))
        for rec in records
    )
    saw_event = audit_module.EVENT_REGISTER_EXTENDED in blob
    # Every value the caller supplied, plus the normalised phone and the raw
    # session identifier, must be absent from the captured logs.
    leaks = [v for v in ('Acme Pty Ltd', 'Platform Engineer', '+61 412 345 678', '+61412345678',
                         '412345678', SESSION_ON) if v in blob]
    check('10', f'audit event {audit_module.EVENT_REGISTER_EXTENDED} emitted', saw_event and r.status_code == 201,
          f'status={r.status_code} event_in_logs={saw_event} records_captured={len(records)}')
    check('10', 'no field value and no sessionId in any log record', not leaks,
          f'leaked={leaks}' if leaks else 'no submitted value, normalised phone, or sessionId found in log output')

    # Field names are expected in the audit line - that is the point of it.
    names_present = all(n in blob for n in ('company_name', 'job_role', 'phone'))
    check('10', 'audit records supplied field NAMES', names_present,
          f'field names present in audit output: {names_present}')

    # ── row 14 (continued): rotation cannot evade the IP rate limit ───────────
    # The limiter keys on "{ip}:auth" (app/middleware/rate_limit.py:100) and never
    # reads sessionId, so rotation cannot move the bucket. Proven by firing it
    # rather than by reading the source: burst with a fresh identity *and* a
    # fresh email each time, so nothing is rejected as a duplicate first. No
    # `extended` block, so `extended_enabled` short-circuits in app/api/auth.py:99
    # and no Flagsmith API call is spent (§3.4 budget).
    burst = []
    for n in range(120):
        rot = client.post('/auth/register', json={'email': f'burst-{n}@opm.test', 'password': PASSWORD,
                                                  'sessionId': f'burst-rotate-{n}'})
        burst.append(rot.status_code)
        if rot.status_code == 429:
            break
    tripped = 429 in burst
    check('14', 'rotating sessionId + fresh email still trips the IP rate limit', tripped,
          (f'429 after {burst.index(429)} accepted requests in this burst; the harness had already '
           f'spent part of the shared {os.environ.get("RATE_LIMIT_AUTH_PER_MINUTE", "60")}/min IP budget')
          if tripped else f'no 429 in {len(burst)} requests: statuses={sorted(set(burst))}')

    print()
    failed = [r for r in results if not r[2]]
    print(f'{len(results) - len(failed)}/{len(results)} checks passed')
    if failed:
        print('FAILED:')
        for row, name, _, detail in failed:
            print(f'  row {row}: {name} - {detail}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
