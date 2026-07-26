#!/usr/bin/env python3
"""Enforce npm audit high/critical findings against a per-workspace audit-ci.jsonc allowlist.

Reads the machine-readable report already produced by `npm audit --json` and
cross-references it against an audit-ci-style allowlist file, without making a
second call to npm's registry (npm's bulk advisory endpoint has proven
unreliable in CI) and without shelling out to a third-party npx-fetched tool.

Usage: enforce-npm-audit.py <npm-audit-report.json> <audit-ci-config.jsonc>
"""
import json
import sys
from datetime import date, datetime


def load_allowlist(config_path):
    try:
        with open(config_path) as f:
            cfg = json.load(f)
    except FileNotFoundError:
        return set()

    today = date.today().isoformat()
    allowlist = set()
    for entry in cfg.get("allowlist", []):
        if isinstance(entry, str):
            allowlist.add(entry)
            continue
        if not isinstance(entry, dict):
            continue
        for advisory_id, meta in entry.items():
            if not isinstance(meta, dict):
                allowlist.add(advisory_id)
                continue
            if meta.get("active", True) is False:
                continue
            expiry = str(meta.get("expiry", ""))[:10]
            try:
                if expiry and expiry < today:
                    continue  # expired — do not honor
            except TypeError:
                pass
            allowlist.add(advisory_id)
    return allowlist


def collect_advisory_ids(vulns, pkg_name, seen=None):
    """Walk a vulnerability's `via` chain (which may reference other package
    names as plain strings) to collect every GHSA/advisory URL id involved."""
    if seen is None:
        seen = set()
    if pkg_name in seen or pkg_name not in vulns:
        return set()
    seen.add(pkg_name)

    ids = set()
    for via in vulns[pkg_name].get("via", []):
        if isinstance(via, str):
            ids |= collect_advisory_ids(vulns, via, seen)
        elif isinstance(via, dict):
            url = via.get("url", "")
            if "/advisories/" in url:
                ids.add(url.rsplit("/", 1)[-1])
    return ids


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <npm-audit-report.json> <audit-ci-config.jsonc>", file=sys.stderr)
        return 2

    report_path, config_path = sys.argv[1], sys.argv[2]

    try:
        with open(report_path) as f:
            report = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"::error::Could not read npm audit report at {report_path}: {exc}")
        return 1

    vulns = report.get("vulnerabilities", {})
    allowlist = load_allowlist(config_path)

    blocking = []
    allowlisted_found = []
    for name, info in vulns.items():
        severity = info.get("severity")
        if severity not in ("high", "critical"):
            continue
        ids = collect_advisory_ids(vulns, name)
        if ids and ids.issubset(allowlist):
            allowlisted_found.append((name, severity, ids))
            continue
        blocking.append((name, severity, ids))

    for name, severity, ids in allowlisted_found:
        label = ", ".join(sorted(ids))
        print(f"::notice::Allowlisted {severity} finding in {name} ({label})")

    if blocking:
        for name, severity, ids in blocking:
            label = ", ".join(sorted(ids)) if ids else "unknown advisory — no matching GHSA id found in report"
            print(f"::error::{severity} severity vulnerability in {name} ({label}) is not allowlisted in {config_path}")
        print(f"npm audit FAILED — {len(blocking)} unallowlisted high/critical finding(s).", file=sys.stderr)
        return 1

    total = len(allowlisted_found)
    print(f"npm audit OK — {total} high/critical finding(s), all allowlisted; none blocking.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
