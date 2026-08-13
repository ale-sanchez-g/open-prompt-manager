#!/usr/bin/env python3
"""Prove Flagsmith bucketing agrees between the browser and the backend.

Acceptance matrix row 7 (docs/features/registration-feature.md §8) is the one
the spec explicitly refuses to take on trust:

    "A fixed set of sessionIds produces the *same* ON/OFF split in the browser
     SDK and the Python SDK (proves composite-key hashing agrees - §4.2)"

If the two sides disagree, a visitor is shown the extended fields and then has
them silently dropped (or gets a 422) when the API re-evaluates the flag - the
failure mode §9.3 watches for.

What this script actually compares
----------------------------------
The two sides do *not* both compute a bucket, which is what makes the claim
provable rather than circular:

* **Browser.** ``@flagsmith/flagsmith`` has no local-evaluation mode - see
  ``frontend/src/featureFlags/FeatureFlagProvider.jsx``, which passes only
  ``environmentID``/``api``. The browser asks the Flagsmith Edge API and is told
  the answer. The bucket is computed server-side, inside Flagsmith.
* **Backend.** ``backend/app/core/flags.py`` runs the Python SDK with
  ``enable_local_evaluation=True``, so the bucket is computed **in-process** by
  ``flagsmith-flag-engine`` against a polled environment document. No API call,
  no server-side involvement.

So row 7 reduces to: *does flag-engine's in-process arithmetic reproduce what
Flagsmith's own service decides?* This script computes the bucket locally from
first principles and compares it against the live Edge API verdict for the same
identifiers.

The algorithm, cited to the installed engine
--------------------------------------------
``flag_engine`` 's PERCENTAGE_SPLIT path, at the pinned version in ``.venv``:

* ``segments/evaluator.py:86``   identity key = ``f"{environment.key}_{identifier}"``
  (this is what ``use_identity_composite_key_for_hashing: true`` selects)
* ``flagsmith/mappers.py:108``   ``environment.key`` = the environment document's
  ``api_key`` - i.e. the **client-side** Environment ID
* ``flagsmith/mappers.py:119``   ``segment.key`` = ``str(segment.id)``
* ``segments/evaluator.py:298``  ``object_ids = [segment_key, identity_key]``
* ``utils/hashing.py:20``        ``md5(",".join(object_ids))``, then
  ``(int(hexdigest, 16) % 9999) / 9998 * 100``
* ``segments/evaluator.py:304``  in-segment iff that value ``<=`` the percentage

The load-bearing detail is the second line. The composite key is built from the
environment's **client-side** ``api_key``, not from whichever credential the SDK
authenticated with. The backend authenticates with a ``ser.…`` key and the
browser with the publishable Environment ID, but both hash over the same
``api_key`` string, so both land on the same bucket. That is the mechanical
reason §4.2's handshake holds, and it is what this script checks empirically
rather than by reading the source.

Usage
-----
    python3 scripts/registration-rollout/bucketing_parity.py --offline
    python3 scripts/registration-rollout/bucketing_parity.py \
        --environment-key mGoGnmAiyNzxXCikjAo8Qd --segment-id 1148545

``--offline`` prints predicted buckets only and makes no network call - useful
for picking ramp percentages without spending the API-call budget (§3.4).
Without it, the script queries the Edge API once per identifier.

**Development only.** Point this at Production and it burns Production API-call
quota to no purpose. Identities are created ``transient=True`` so no identity
record is persisted for these synthetic visitors (§3.4 privacy note).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from typing import Iterable

FLAG_KEY = 'registration_extended_fields'

# Fixed corpus. Hard-coded rather than random so a re-run is comparable with a
# previous run, and so a disagreement can be reproduced from the report alone.
SESSION_IDS = tuple(f'opm-reg-ext-parity-{n:03d}' for n in range(40))


def hashed_percentage(object_ids: Iterable[str], iterations: int = 1) -> float:
    """Reimplementation of flag_engine.utils.hashing for an independent check.

    Deliberately *not* imported from flag_engine: importing the engine's own
    function and comparing it to the engine would prove nothing. This is written
    from the documented algorithm so a divergence in the engine shows up as a
    failure here rather than being silently mirrored.
    """
    ids = list(object_ids) * iterations
    to_hash = ','.join(str(id_) for id_ in ids)
    # MD5 here is not a security or integrity control - it is the exact
    # algorithm flag_engine.utils.hashing uses for PERCENTAGE_SPLIT bucketing
    # (see the module docstring), so matching it bit-for-bit is the whole
    # point of this check. usedforsecurity=False documents that; NOSONAR
    # covers scanners that flag any hashlib.md5 use regardless.
    hashed = int(hashlib.md5(to_hash.encode('utf-8'), usedforsecurity=False).hexdigest(), base=16)  # NOSONAR
    value = ((hashed % 9999) / 9998) * 100
    if value == 100:
        return hashed_percentage(object_ids, iterations + 1)
    return value


def predict(environment_key: str, segment_id: int, session_id: str) -> float:
    """Bucket for one visitor, 0 <= value < 100. Lower value => enabled sooner."""
    identity_key = f'{environment_key}_{session_id}'
    return hashed_percentage([str(segment_id), identity_key])


def edge_api_enabled(environment_key: str, session_ids: Iterable[str]) -> dict[str, bool]:
    """Ask Flagsmith what the *browser* would be told, for each identifier.

    Uses the Python SDK in remote-evaluation mode with the client-side
    Environment ID - the same credential and the same Edge API endpoint the
    browser SDK uses - so this measures Flagsmith's own verdict, not a local
    recomputation of it.
    """
    from flagsmith import Flagsmith

    client = Flagsmith(environment_key=environment_key, enable_local_evaluation=False)
    results: dict[str, bool] = {}
    for session_id in session_ids:
        # transient: evaluate without persisting an identity record (§3.4).
        flags = client.get_identity_flags(identifier=session_id, transient=True)
        results[session_id] = bool(flags.is_feature_enabled(FLAG_KEY))
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--environment-key', default='mGoGnmAiyNzxXCikjAo8Qd', help='Client-side Environment ID (Development)')
    parser.add_argument('--segment-id', type=int, default=1148545, help='Rollout segment id (reg_ext_rollout_development)')
    parser.add_argument('--percentage', type=float, default=None, help='Expected PERCENTAGE_SPLIT, for the offline prediction')
    parser.add_argument('--offline', action='store_true', help='Predict only; make no API call')
    parser.add_argument('--json', action='store_true', help='Emit machine-readable output')
    args = parser.parse_args()

    buckets = {sid: predict(args.environment_key, args.segment_id, sid) for sid in SESSION_IDS}

    if args.offline:
        pct = args.percentage
        for sid, bucket in buckets.items():
            marker = '' if pct is None else ('  ON ' if bucket <= pct else '  off')
            print(f'{sid}  bucket={bucket:8.4f}{marker}')
        if pct is not None:
            on = sum(1 for b in buckets.values() if b <= pct)
            print(f'\npredicted at {pct}%: {on}/{len(buckets)} ON')
        return 0

    actual = edge_api_enabled(args.environment_key, SESSION_IDS)

    # Infer the live percentage from the data rather than trusting the caller:
    # every ON bucket must be below every OFF bucket for a split to be coherent.
    on_buckets = sorted(b for sid, b in buckets.items() if actual[sid])
    off_buckets = sorted(b for sid, b in buckets.items() if not actual[sid])
    coherent = (not on_buckets) or (not off_buckets) or (max(on_buckets) < min(off_buckets))

    rows = []
    for sid in SESSION_IDS:
        rows.append({'session_id': sid, 'bucket': round(buckets[sid], 4), 'edge_api_enabled': actual[sid]})

    if args.percentage is not None:
        mismatches = [r for r in rows if (r['bucket'] <= args.percentage) != r['edge_api_enabled']]
    else:
        mismatches = []

    summary = {
        'flag': FLAG_KEY,
        'environment_key': args.environment_key,
        'segment_id': args.segment_id,
        'identifiers': len(SESSION_IDS),
        'edge_api_on': sum(1 for r in rows if r['edge_api_enabled']),
        'expected_percentage': args.percentage,
        'local_prediction_on': (None if args.percentage is None else sum(1 for r in rows if r['bucket'] <= args.percentage)),
        'mismatches': len(mismatches),
        'split_is_monotonic_in_bucket': coherent,
        'highest_on_bucket': (max(on_buckets) if on_buckets else None),
        'lowest_off_bucket': (min(off_buckets) if off_buckets else None),
    }

    if args.json:
        print(json.dumps({'summary': summary, 'rows': rows}, indent=2))
    else:
        for r in rows:
            flag_state = 'ON ' if r['edge_api_enabled'] else 'off'
            print(f"{r['session_id']}  bucket={r['bucket']:8.4f}  edge={flag_state}")
        print()
        for key, value in summary.items():
            print(f'{key}: {value}')

    # Monotonicity is the real assertion. If Flagsmith's server-side bucket
    # disagreed with the locally computed one for even one identifier, the ON
    # set would interleave with the OFF set when sorted by local bucket.
    ok = coherent and not mismatches
    print('\nRESULT:', 'PASS - local bucketing agrees with the Edge API' if ok else 'FAIL - bucketing disagreement')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
