"""Shared contract for the extended registration fields.

Source of truth for the rules that both the API and the registration form must
apply, per docs/features/registration-feature.md §4.3/§4.4. The frontend mirrors
these values in ``frontend/src/constants/registrationConsent.js`` and
``frontend/src/utils/authValidation.js``; the correspondence is asserted by
``backend/tests/test_registration_contract.py``.

Nothing here is flag-aware. These constants describe what a *valid* extended
block looks like; whether the block is honoured at all is the flag's decision.
"""

import re

# --- Consent (guardrail 8) ---------------------------------------------------
# A bare boolean is not evidence of consent. When marketing_opt_in is true we
# persist the version of the copy the user actually agreed to, plus a timestamp,
# so the consent can be evidenced later. Bump the version whenever the copy
# below changes in a way that alters its meaning - never edit the copy in place.
MARKETING_CONSENT_VERSION = 'marketing-consent-v1'

MARKETING_CONSENT_COPY = (
    'Email me occasional product updates about Open Prompt Manager. '
    'You can unsubscribe at any time.'
)

# --- Field limits (mirror the DB column widths in §4.4) ----------------------
COMPANY_NAME_MAX_LENGTH = 200
JOB_ROLE_MAX_LENGTH = 120
PHONE_MAX_LENGTH = 32

# --- Phone (PII, §4.4) -------------------------------------------------------
# Decision: accept human-typed separators, strip them, then accept either an
# international or a national-format number.
#
#   +<country><subscriber>   strict E.164 - no leading zero after the '+'
#   <digits>                 national format, leading zero allowed (e.g. 0412...)
#
# We deliberately do NOT convert national numbers to E.164. Doing so requires
# knowing the user's country, which registration does not collect, and getting
# it wrong silently corrupts the data. We store what was entered, normalised.
# Consumers must treat a stored number without a '+' as country-ambiguous.
#
# Rejecting national format outright was the first cut and was wrong: most
# people type their own number the local way, and a validation error on an
# optional field is a direct hit to the §1.2 funnel metric.
#
# Normalised output is at most 16 characters, well inside VARCHAR(32); the
# column is sized for the raw input we accept, not the normalised output.
PHONE_SEPARATORS = re.compile(r'[\s\-.()]')
PHONE_PATTERN = re.compile(r'^(?:\+[1-9]\d{6,14}|\d{7,15})$')


def normalize_phone(value: str) -> str:
    """Strip human separators. Does not validate - see ``is_valid_phone``."""
    return PHONE_SEPARATORS.sub('', value.strip())


def is_valid_phone(value: str) -> bool:
    """True when ``value`` normalises to something E.164-shaped.

    Deliberately does not check that the country code or subscriber number
    actually exists; that needs a phone-number library and is out of scope for
    OPM-FLAG-REG-001.
    """
    normalized = normalize_phone(value)
    return bool(normalized) and bool(PHONE_PATTERN.match(normalized))
