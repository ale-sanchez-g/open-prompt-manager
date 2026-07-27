// Consent copy for the extended registration fields.
//
// Mirrors backend/app/core/registration.py. The version string is persisted
// alongside the opt-in boolean so the consent can be evidenced later
// (docs/features/registration-feature.md guardrail 8) - a bare boolean does not
// record *what* the user agreed to.
//
// Bump the version whenever the copy changes meaning. Never edit the copy in
// place: rows already carry the old version and must keep pointing at the text
// that was actually shown.
//
// backend/tests/test_registration_contract.py asserts these two values match
// their Python counterparts.

export const MARKETING_CONSENT_VERSION = 'marketing-consent-v1';

export const MARKETING_CONSENT_COPY =
  'Email me occasional product updates about Open Prompt Manager. You can unsubscribe at any time.';
