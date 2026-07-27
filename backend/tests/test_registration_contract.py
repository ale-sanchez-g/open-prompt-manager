"""Cross-stack contract tests for OPM-FLAG-REG-001.

There is no shared package between ``frontend/`` and ``backend/``, so the values
that *must* be identical on both sides are asserted here by reading the frontend
source. A drift in any of these is a silent production bug:

* The flag key: if the two sides evaluate different keys, the frontend shows the
  extended fields while the backend discards them (or vice versa).
* The consent version: if they drift, we persist a version string that does not
  correspond to the copy the user was actually shown, which destroys the value
  of storing it at all.

See docs/features/registration-feature.md §4.1 and guardrail 8.
"""

import re
from pathlib import Path

import pytest

from app.core.flags import FLAG_REGISTRATION_EXTENDED
from app.core.registration import (
    MARKETING_CONSENT_COPY,
    MARKETING_CONSENT_VERSION,
    is_valid_phone,
    normalize_phone,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FLAGS_CONFIG = REPO_ROOT / 'frontend' / 'src' / 'featureFlags' / 'config.js'
CONSENT_CONSTANTS = REPO_ROOT / 'frontend' / 'src' / 'constants' / 'registrationConsent.js'


def _read_frontend(path: Path) -> str:
    if not path.is_file():
        pytest.skip(f'frontend source not available at {path} (backend-only checkout)')
    return path.read_text(encoding='utf-8')


def _extract_js_string(source: str, name: str) -> str:
    """Pull a single-quoted JS string constant out of the frontend source."""
    match = re.search(rf'{name}:\s*\'([^\']*)\'', source) or re.search(
        rf'{name}\s*=\s*\'([^\']*)\'', source
    )
    assert match, f'could not find constant {name} in frontend source'
    return match.group(1)


def test_flag_key_matches_frontend():
    frontend_key = _extract_js_string(_read_frontend(FLAGS_CONFIG), 'REGISTRATION_EXTENDED_FIELDS')
    assert frontend_key == FLAG_REGISTRATION_EXTENDED


def test_flag_key_is_lowercase():
    """Flagsmith project opm-dx1 sets only_allow_lower_case_feature_names."""
    assert FLAG_REGISTRATION_EXTENDED == FLAG_REGISTRATION_EXTENDED.lower()


def test_consent_version_matches_frontend():
    source = _read_frontend(CONSENT_CONSTANTS)
    assert _extract_js_string(source, 'MARKETING_CONSENT_VERSION') == MARKETING_CONSENT_VERSION


def test_consent_copy_matches_frontend():
    """The stored version must describe the copy the user actually saw."""
    source = _read_frontend(CONSENT_CONSTANTS)
    assert _extract_js_string(source, 'MARKETING_CONSENT_COPY') == MARKETING_CONSENT_COPY


@pytest.mark.parametrize(
    'raw',
    ['+61412345678', '+61 412 345 678', '(02) 9876 5432', '0412-345-678', '+1 (555) 123-4567'],
)
def test_valid_phone_shapes(raw):
    assert is_valid_phone(raw)


@pytest.mark.parametrize('raw', ['', '   ', 'not a phone', '+', '123', '0412345678901234567', '+0412345678'])
def test_invalid_phone_shapes(raw):
    assert not is_valid_phone(raw)


def test_normalized_phone_fits_the_column():
    """Normalised output must fit VARCHAR(32) with room to spare."""
    assert len(normalize_phone('+1 (555) 123-4567')) <= 32
