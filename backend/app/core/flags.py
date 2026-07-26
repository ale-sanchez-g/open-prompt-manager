"""Backend feature flags: keys, and the Flagsmith client that resolves them.

This module is the backend counterpart of ``frontend/src/featureFlags/config.js``
and follows the same shape deliberately: **all vendor detail lives here**, the
rest of the application only ever imports a helper (``extended_enabled``) and a
key constant. Nothing outside this module imports ``flagsmith``.

Every key here must match its frontend counterpart in
``frontend/src/featureFlags/config.js`` exactly. There is no shared package
between ``frontend/`` and ``backend/``, so that correspondence is enforced by
``backend/tests/test_registration_contract.py`` instead of by the type system.

Flagsmith project ``opm-dx1`` sets ``only_allow_lower_case_feature_names``, so
keys are lowercase snake_case.

Configuration (all optional; without the server key, flags are disabled)
-----------------------------------------------------------------------
``FLAGSMITH_SERVER_KEY``
    Server-side key (``ser.…``). **Secret** - never the frontend's publishable
    Environment ID, never in a client bundle. Unset ⇒ the SDK is not started and
    every flag resolves false. That is the same "off-safe when unconfigured"
    contract the frontend config module has, and it is what lets tests and local
    development run with no network and no account.
``FLAGSMITH_API_URL``
    API base. Defaults to the Flagsmith SaaS Edge API.
``FLAGSMITH_REFRESH_INTERVAL_SECONDS``
    Local-evaluation poll interval. Defaults to 300 and is **clamped up** to
    :data:`MIN_REFRESH_INTERVAL_SECONDS`.

Why local evaluation, and why ≥300s
-----------------------------------
The Flagsmith plan for ``opm-dx1`` allows 50,000 API calls per month across
everything (spec §3.4). Remote evaluation would spend one call per registration
*and* create a persistent Flagsmith identity for every anonymous visitor, so it
is not viable here. Local evaluation instead polls one environment document on a
timer, independent of traffic: at 60s that is ~43,200 calls/month *per instance*
and OPM runs several ECS tasks, which alone would exhaust the quota. At 300s it
is ~8,600 per instance. The cost of the slower poll is slower flag propagation
(spec §3.5) - that trade-off is the decision, and it is why the interval is
floored rather than merely defaulted.

Failure semantics (guardrail 3)
-------------------------------
``POST /auth/register`` is public and unauthenticated, so a Flagsmith outage,
timeout, missing SDK, or bad key must resolve to the legacy path - never a 5xx,
never added latency. Concretely:

* The client is built **once**, at startup, by :func:`init_flags`. Nothing on the
  request path ever constructs a client or makes an API call, so a Flagsmith
  outage cannot add latency to a registration. If startup initialisation fails,
  flags stay off for the life of the process (a redeploy re-attempts) - that is
  the deliberate trade of self-healing for a guaranteed-fast request path.
* :func:`extended_enabled` returns ``False`` on *any* problem and never raises.

Privacy
-------
The ``session_id`` is an opaque per-visit identifier and is PII-adjacent: it is
used for bucketing only, is never persisted to ``users``, and is never logged
here. No traits are ever sent (spec §3.4), so no visitor attributes reach
Flagsmith.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Any, Mapping, Optional

logger = logging.getLogger(__name__)

# Gates the extended registration fields across frontend, API and persistence.
# Release toggle - remove once docs/features/registration-feature.md §10 completes.
FLAG_REGISTRATION_EXTENDED = 'registration_extended_fields'

# Flagsmith SaaS Edge API, matching the frontend default in
# frontend/src/featureFlags/config.js.
DEFAULT_API_URL = 'https://edge.api.flagsmith.com/api/v1/'

# Local-evaluation poll interval. See "Why local evaluation" above: 300s is the
# floor the API-call budget allows, not a preference.
DEFAULT_REFRESH_INTERVAL_SECONDS = 300
MIN_REFRESH_INTERVAL_SECONDS = 300

# Bounds any HTTP the SDK does (the startup environment-document fetch and the
# background poll). Short on purpose: a slow Flagsmith must not slow startup.
REQUEST_TIMEOUT_SECONDS = 3


@dataclass(frozen=True)
class FlagsmithConfig:
    """Normalised Flagsmith settings. ``enabled`` is false when unconfigured."""

    enabled: bool
    server_key: str
    api_url: str
    refresh_interval_seconds: int


def get_flagsmith_config(env: Optional[Mapping[str, str]] = None) -> FlagsmithConfig:
    """Read and normalise Flagsmith settings from the environment.

    Pass an explicit ``env`` mapping in tests to avoid touching ``os.environ``.
    Never raises: a malformed interval falls back to the default rather than
    taking the process down over a feature-flag setting.
    """
    source = os.environ if env is None else env

    server_key = str(source.get('FLAGSMITH_SERVER_KEY') or '').strip()
    api_url = str(source.get('FLAGSMITH_API_URL') or '').strip() or DEFAULT_API_URL

    raw_interval = str(source.get('FLAGSMITH_REFRESH_INTERVAL_SECONDS') or '').strip()
    try:
        interval = int(float(raw_interval)) if raw_interval else DEFAULT_REFRESH_INTERVAL_SECONDS
    except ValueError:
        logger.warning('FLAGSMITH_REFRESH_INTERVAL_SECONDS is not a number; using the default')
        interval = DEFAULT_REFRESH_INTERVAL_SECONDS

    if interval < MIN_REFRESH_INTERVAL_SECONDS:
        # Clamped, not rejected: a too-frequent poll burns the shared monthly
        # API-call quota for every other consumer of the project (spec §3.4).
        logger.warning(
            'FLAGSMITH_REFRESH_INTERVAL_SECONDS below the supported floor; clamping',
            extra={'requested_seconds': interval, 'minimum_seconds': MIN_REFRESH_INTERVAL_SECONDS},
        )
        interval = MIN_REFRESH_INTERVAL_SECONDS

    return FlagsmithConfig(
        enabled=bool(server_key),
        server_key=server_key,
        api_url=api_url,
        refresh_interval_seconds=interval,
    )


# ── Process-wide client ──────────────────────────────────────────────────────
#
# Built once by init_flags() at startup. _initialised records that the attempt
# happened, so the request path can distinguish "not configured" from "not yet
# tried" without ever attempting the (network-bound) construction itself.

_client: Any = None
_initialised = False
_init_lock = threading.Lock()


def _default_flag_handler(feature_name: str) -> Any:
    """Resolve unknown/unretrievable flags to disabled.

    Without this the SDK raises ``FlagsmithFeatureDoesNotExistError`` for a key
    that has not been created in the Flagsmith environment yet - which is the
    normal state during a dark launch, before the flag exists.
    """
    from flagsmith.models import DefaultFlag

    return DefaultFlag(enabled=False, value=None)


def init_flags(env: Optional[Mapping[str, str]] = None) -> bool:
    """Initialise the Flagsmith client once per process. Never raises.

    Returns ``True`` when a live client is available. Called from
    ``main.create_app()``; safe (and a no-op) to call again.
    """
    global _client, _initialised

    with _init_lock:
        if _initialised:
            return _client is not None
        _initialised = True

        config = get_flagsmith_config(env)
        if not config.enabled:
            logger.info('Flagsmith server key not configured; backend feature flags resolve to false')
            return False

        try:
            from flagsmith import Flagsmith
        except ImportError:
            # requirements.txt pins the SDK, but a partial install must not stop
            # the API serving traffic on the legacy path.
            logger.warning('flagsmith SDK not installed; backend feature flags resolve to false')
            return False

        try:
            _client = Flagsmith(
                environment_key=config.server_key,
                api_url=config.api_url,
                enable_local_evaluation=True,
                environment_refresh_interval_seconds=config.refresh_interval_seconds,
                request_timeout_seconds=REQUEST_TIMEOUT_SECONDS,
                default_flag_handler=_default_flag_handler,
            )
        except Exception:
            # Bad/short key, network blackhole, DNS failure: all of them mean
            # "no flags", not "no service". The key is never logged.
            _client = None
            logger.warning(
                'Flagsmith client initialisation failed; backend feature flags resolve to false',
                exc_info=False,
            )
            return False

        logger.info(
            'Flagsmith client initialised (local evaluation)',
            extra={'refresh_interval_seconds': config.refresh_interval_seconds},
        )
        return True


def reset_flags_client() -> None:
    """Drop the cached client so the next :func:`init_flags` rebuilds it.

    For tests only - production initialises once at startup.
    """
    global _client, _initialised

    with _init_lock:
        _client = None
        _initialised = False


def get_client() -> Any:
    """Return the initialised client, or ``None``. Does no I/O and never raises."""
    return _client


def extended_enabled(session_id: Optional[str]) -> bool:
    """Is ``registration_extended_fields`` on for this visitor?

    ``False`` on every uncertain outcome - no ``session_id``, no client, an
    unknown flag, a timeout, or any exception at all (guardrail 3). A flag
    lookup must never raise into the request path, and the caller is entitled to
    treat a ``False`` as "take the legacy path".

    Evaluation is local (no API call, no Flagsmith identity created); the
    ``session_id`` is never logged.
    """
    if not session_id:
        return False

    client = get_client()
    if client is None:
        return False

    try:
        # transient=True is the belt to local evaluation's braces. Local
        # evaluation resolves in-process and creates no Flagsmith identity, but
        # if the environment document is unavailable the SDK falls back to
        # remote evaluation - which would both spend an API call and persist an
        # identity for an anonymous visitor, breaking the §3.4 budget and the
        # privacy note above. A transient identity is never stored.
        flags = client.get_identity_flags(identifier=session_id, transient=True)
        return bool(flags.is_feature_enabled(FLAG_REGISTRATION_EXTENDED))
    except Exception:
        logger.warning(
            'Feature flag lookup failed; using the legacy path',
            extra={'flag': FLAG_REGISTRATION_EXTENDED},
        )
        return False
