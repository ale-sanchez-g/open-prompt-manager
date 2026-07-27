"""Validation and persistence for the flag-gated extended registration fields.

Everything here is reached **only** when ``registration_extended_fields`` is on
for the requesting visitor; with the flag off none of it runs and
``POST /auth/register`` behaves exactly as it does on ``main`` (guardrail 2).

The rules themselves live in :mod:`app.core.registration`, which is the shared
contract with the frontend. This module applies them; it does not restate them.

Two design points worth reading before changing anything here:

*Optional when present* (guardrail 6). Every field is optional, and a blank
string counts as "not supplied" rather than as an invalid value. The flag can be
flipped off between the form rendering and the POST landing, so an in-flight
submission must never be turned into a hard failure by the extended block. Only
a value that is genuinely wrong - too long, or a phone that is not phone-shaped
- is rejected.

*Consent is evidence, not a boolean* (guardrail 8). Opting in also records the
version of the copy the user agreed to and when they agreed to it, so the
consent can be evidenced later. ``marketing_opt_in=False`` records no evidence,
because there is nothing to evidence.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.registration import (
    COMPANY_NAME_MAX_LENGTH,
    JOB_ROLE_MAX_LENGTH,
    MARKETING_CONSENT_VERSION,
    PHONE_MAX_LENGTH,
    is_valid_phone,
    normalize_phone,
)
from app.models.auth import User
from app.models.schemas import ExtendedRegistrationFields
from app.services.auth_service import AuthError

# Text fields: (payload attribute, User column, max length). The column name is
# also what the audit event reports as "supplied", so the audit trail names the
# data that was actually stored.
_TEXT_FIELDS = (
    ('company_name', COMPANY_NAME_MAX_LENGTH),
    ('job_role', JOB_ROLE_MAX_LENGTH),
)


def _utcnow() -> datetime:
    """Naive UTC, matching the convention of the other DateTime columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _clean(value: Any) -> str | None:
    """Trim a submitted string; ``None`` when nothing meaningful was supplied."""
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def validate_extended_fields(extended: ExtendedRegistrationFields) -> dict[str, Any]:
    """Validate an extended block and return the column values to persist.

    Raises :class:`AuthError` (422) if any supplied value breaks the contract in
    :mod:`app.core.registration`. **Call this before creating the user**: a 422
    must never leave a half-created account behind (spec §11.2, matrix row 4).

    The returned mapping is keyed by ``User`` column name and contains only
    fields that were actually supplied, plus the consent evidence when the user
    opted in. Error messages name the field but never echo the value.
    """
    values: dict[str, Any] = {}

    for field_name, max_length in _TEXT_FIELDS:
        cleaned = _clean(getattr(extended, field_name, None))
        if cleaned is None:
            continue
        if len(cleaned) > max_length:
            raise AuthError(status_code=422, error=f'{field_name} must be at most {max_length} characters')
        values[field_name] = cleaned

    phone = _clean(extended.phone)
    if phone is not None:
        if len(phone) > PHONE_MAX_LENGTH:
            raise AuthError(status_code=422, error=f'phone must be at most {PHONE_MAX_LENGTH} characters')
        if not is_valid_phone(phone):
            raise AuthError(status_code=422, error='phone is not a valid phone number')
        # Store the normalised form, never the raw input, so the column holds one
        # canonical shape regardless of how the user typed the separators.
        values['phone'] = normalize_phone(phone)

    opted_in = bool(extended.marketing_opt_in)
    values['marketing_opt_in'] = opted_in
    if opted_in:
        values['marketing_consent_at'] = _utcnow()
        values['marketing_consent_version'] = MARKETING_CONSENT_VERSION

    return values


def supplied_field_names(values: dict[str, Any]) -> list[str]:
    """Names of the columns that were written, for the audit event.

    Names only. No value from an extended field - and above all no phone number
    - may ever reach a log record (guardrail 7). Consent evidence is derived
    rather than submitted, so it is not reported as a supplied field.
    """
    derived = {'marketing_consent_at', 'marketing_consent_version'}
    return sorted(name for name in values if name not in derived)


def apply_extended_fields(db: Session, user: User, values: dict[str, Any]) -> User:
    """Write already-validated extended values onto ``user``.

    Persistence only: by the time this runs, every value has passed
    :func:`validate_extended_fields`, so it cannot fail validation and cannot
    leave the account in a half-created state.
    """
    for column, value in values.items():
        setattr(user, column, value)
    db.commit()
    db.refresh(user)
    return user
