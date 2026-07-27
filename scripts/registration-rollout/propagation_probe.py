#!/usr/bin/env python3
"""Measure one component of §8 row 6: how fast a flag change reaches the Edge API.

Row 6 asks for the **actual** propagation time after a rollback, because §3.5
replaces the previous draft's "instant rollback" with a measured worst case. That
total is the sum of three delays:

    1. dashboard/API write  ->  Flagsmith Edge API serves the new value
    2. Edge API             ->  browser        (client SDK poll + `cacheFlags`)
    3. Edge API             ->  backend        (local-evaluation poll, >=300s)

Only (1) is measurable from a local checkout: (2) needs a browser with a loaded
page and (3) needs a deployed backend holding a polling SDK instance. This script
measures (1) and nothing else, so the runbook can state a real number for the
part that is knowable here and an arithmetic bound for the rest.

The measurement: flip the Development rollout segment's PERCENTAGE_SPLIT between
two values and poll the Edge API for a fixed identifier until the answer changes,
recording the elapsed time.

    python3 scripts/registration-rollout/propagation_probe.py

Development only. Requires FLAGSMITH_ADMIN_TOKEN for the segment write; without
it the script prints the manual procedure and exits.
"""

from __future__ import annotations

import os
import sys
import time

import requests

EDGE_API = 'https://edge.api.flagsmith.com/api/v1/'
ADMIN_API = 'https://api.flagsmith.com/api/v1/'

DEV_ENVIRONMENT_KEY = os.environ.get('OPM_DEV_FLAGSMITH_KEY', 'mGoGnmAiyNzxXCikjAo8Qd')
DEV_SEGMENT_ID = int(os.environ.get('OPM_DEV_SEGMENT_ID', '1148545'))
PROJECT_ID = 44530
FLAG_KEY = 'registration_extended_fields'

# bucket 4.0508 - inside any split at 10% or above, outside a 0% split.
PROBE_IDENTIFIER = 'opm-reg-ext-parity-037'

POLL_INTERVAL_SECONDS = 0.5
TIMEOUT_SECONDS = 120


def edge_enabled(identifier: str) -> bool:
    """One Edge API evaluation, transient so no identity record is persisted."""
    response = requests.post(
        f'{EDGE_API}identities/',
        headers={'X-Environment-Key': DEV_ENVIRONMENT_KEY, 'Content-Type': 'application/json'},
        json={'identifier': identifier, 'traits': [], 'transient': True},
        timeout=10,
    )
    response.raise_for_status()
    for flag in response.json().get('flags', []):
        if flag['feature']['name'] == FLAG_KEY:
            return bool(flag['enabled'])
    return False


def set_percentage(token: str, percentage: int) -> None:
    """Write a new PERCENTAGE_SPLIT onto the Development rollout segment."""
    current = requests.get(
        f'{ADMIN_API}projects/{PROJECT_ID}/segments/{DEV_SEGMENT_ID}/',
        headers={'Authorization': f'Api-Key {token}'},
        timeout=10,
    )
    current.raise_for_status()
    body = current.json()
    body['rules'][0]['rules'][0]['conditions'][0]['value'] = str(percentage)
    updated = requests.put(
        f'{ADMIN_API}projects/{PROJECT_ID}/segments/{DEV_SEGMENT_ID}/',
        headers={'Authorization': f'Api-Key {token}', 'Content-Type': 'application/json'},
        json=body,
        timeout=10,
    )
    updated.raise_for_status()


def wait_for(expected: bool) -> float | None:
    """Poll the Edge API until the flag reads `expected`. Returns elapsed seconds."""
    start = time.monotonic()
    while time.monotonic() - start < TIMEOUT_SECONDS:
        if edge_enabled(PROBE_IDENTIFIER) is expected:
            return time.monotonic() - start
        time.sleep(POLL_INTERVAL_SECONDS)
    return None


def main() -> int:
    token = os.environ.get('FLAGSMITH_ADMIN_TOKEN')
    if not token:
        print(
            'FLAGSMITH_ADMIN_TOKEN is not set, so this script cannot write the segment.\n\n'
            'To measure component (1) manually:\n'
            f'  1. Confirm {PROBE_IDENTIFIER} currently reads OFF (segment at 0%).\n'
            '  2. Note the wall-clock time, then set reg_ext_rollout_development to 100%\n'
            '     in the Flagsmith dashboard.\n'
            f'  3. Poll: curl -s -X POST {EDGE_API}identities/ \\\n'
            f'       -H "X-Environment-Key: {DEV_ENVIRONMENT_KEY}" \\\n'
            '       -H "Content-Type: application/json" \\\n'
            f'       -d \'{{"identifier":"{PROBE_IDENTIFIER}","traits":[],"transient":true}}\'\n'
            '     until the flag reads enabled, and record the elapsed time.\n'
            '  4. Reverse the change and measure again - rollback is the direction\n'
            '     the runbook actually cares about.\n'
        )
        return 2

    print(f'probe identifier: {PROBE_IDENTIFIER} (bucket 4.0508)')
    print(f'baseline: enabled={edge_enabled(PROBE_IDENTIFIER)}\n')

    print('ramp   0% -> 100% ...', end=' ', flush=True)
    set_percentage(token, 100)
    up = wait_for(True)
    print(f'{up:.2f}s' if up is not None else f'NOT OBSERVED within {TIMEOUT_SECONDS}s')

    print('rollback 100% -> 0% ...', end=' ', flush=True)
    set_percentage(token, 0)
    down = wait_for(False)
    print(f'{down:.2f}s' if down is not None else f'NOT OBSERVED within {TIMEOUT_SECONDS}s')

    print(
        '\nThis is component (1) only - write to Edge API visibility.\n'
        'Total user-visible rollback time is this plus the client SDK poll (browser,\n'
        'plus a stale first paint from cacheFlags) and the backend local-evaluation\n'
        'poll (FLAGSMITH_REFRESH_INTERVAL_SECONDS, floored at 300s). Publish the sum\n'
        'as the runbook worst case, not this number.'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
