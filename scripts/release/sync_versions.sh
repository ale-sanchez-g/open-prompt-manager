#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

python3 - "$VERSION" "$ROOT_DIR" <<'PY'
import pathlib
import re
import sys

version = sys.argv[1]
root = pathlib.Path(sys.argv[2])

semver = re.compile(r"^\d+\.\d+\.\d+$")
if not semver.match(version):
    raise SystemExit(f"Invalid semantic version: {version}")


def replace_or_fail(path: pathlib.Path, pattern: str, repl: str, *, flags: int = 0, count: int = 1) -> None:
    text = path.read_text(encoding="utf-8")
    new_text, replacements = re.subn(pattern, repl, text, count=count, flags=flags)
    if replacements != count:
        raise SystemExit(f"Expected {count} replacement(s) in {path}, got {replacements}")
    path.write_text(new_text, encoding="utf-8")


# JSON package files
for package_json in [
    root / "frontend" / "package.json",
    root / "mcp-package-node" / "package.json",
]:
    replace_or_fail(
        package_json,
        r'(?m)^\s*"version"\s*:\s*"[^"]+",?$',
        f'  "version": "{version}",',
    )

# Python package metadata
replace_or_fail(
    root / "mcp-package-python" / "pyproject.toml",
    r'(?m)^version\s*=\s*"[^"]+"$',
    f'version = "{version}"',
)

# Backend package version
replace_or_fail(
    root / "backend" / "app" / "__init__.py",
    r"(?m)^__version__\s*=\s*'[^']+'$",
    f"__version__ = '{version}'",
)

# Helm chart and values
replace_or_fail(
    root / "helm" / "prompt-manager" / "Chart.yaml",
    r"(?m)^version:\s*.+$",
    f"version: {version}",
)
replace_or_fail(
    root / "helm" / "prompt-manager" / "Chart.yaml",
    r"(?m)^appVersion:\s*.+$",
    f"appVersion: \"{version}\"",
)
replace_or_fail(
    root / "helm" / "prompt-manager" / "values.yaml",
    r'(?ms)(backend:\n.*?^\s+image:\n.*?^\s+tag:\s*)"[^"]+"',
    lambda m: f'{m.group(1)}"{version}"',
    flags=re.MULTILINE,
)
replace_or_fail(
    root / "helm" / "prompt-manager" / "values.yaml",
    r'(?ms)(frontend:\n.*?^\s+image:\n.*?^\s+tag:\s*)"[^"]+"',
    lambda m: f'{m.group(1)}"{version}"',
    flags=re.MULTILINE,
)

print(f"Synchronized manifests to version {version}")
PY
