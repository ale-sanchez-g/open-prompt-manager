const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{10,}$/;

export const passwordRequirements =
  'Password must be at least 10 characters and include uppercase, lowercase, a number, and a special character.';

export function validateEmail(email) {
  return emailPattern.test(email.trim());
}

export function validatePassword(password) {
  return passwordPattern.test(password);
}

// --- Extended registration fields (registration_extended_fields flag) --------
//
// Mirrors backend/app/core/registration.py, which is the canonical rule. These
// values are duplicated rather than shared because there is no package spanning
// frontend/ and backend/; backend/tests/test_registration_contract.py asserts
// the two copies agree. Change one, change the other.
//
// All four fields are OPTIONAL at submit. That is a product decision, not an
// oversight: a validation error on a field nobody asked for is a direct hit to
// the registration funnel, which is the metric this rollout is gated on
// (docs/features/registration-feature.md §1.2).

export const companyNameMaxLength = 200;
export const jobRoleMaxLength = 120;
export const phoneMaxLength = 32;

// Human separators we strip before validating: whitespace, hyphen, dot, parens.
// Same set as PHONE_SEPARATORS in backend/app/core/registration.py; the hyphen
// sits last so it needs no escape, which Python's `[\s\-.()]` does differently
// only for the linter's benefit.
const phoneSeparatorsPattern = /[\s.()-]/g;

// Mirrors PHONE_PATTERN in backend/app/core/registration.py.
//   \+[1-9]\d{6,14}  international: no leading zero after '+', 7-15 digits total
//   \d{7,15}         national format, leading zero allowed (e.g. 0412345678)
const phonePattern = /^(?:\+[1-9]\d{6,14}|\d{7,15})$/;

// Two strings, not one. The hint is always on screen; the error replaces
// nothing and is announced via role="alert". If they were the same sentence, a
// screen reader user would hear the identical text twice and be told nothing
// about what went wrong - and a sighted user would see the hint apparently
// duplicate itself in red.
export const phoneRequirements = 'Optional. For example +61 412 345 678 or 0412 345 678.';

export const phoneInvalidMessage =
  'That does not look like a phone number. Try a format like +61 412 345 678 or 0412 345 678.';

/**
 * Strip human separators. Does not validate - see `isValidPhone`.
 * Mirrors `normalize_phone` in backend/app/core/registration.py.
 */
export function normalizePhone(value) {
  return String(value ?? '').trim().replace(phoneSeparatorsPattern, '');
}

/**
 * Byte-for-byte mirror of `is_valid_phone` in the backend: an empty value is
 * NOT a valid phone number. Use `validatePhone` for the form-level check, where
 * "empty" means "not supplied" rather than "wrong".
 */
export function isValidPhone(value) {
  const normalized = normalizePhone(value);
  return normalized.length > 0 && phonePattern.test(normalized);
}

/** Form-level check: the field is optional, so empty passes. */
export function validatePhone(value) {
  const normalized = normalizePhone(value);
  if (normalized.length === 0) {
    return true;
  }
  return String(value ?? '').trim().length <= phoneMaxLength && phonePattern.test(normalized);
}

/** Form-level check for the free-text fields: optional, length-capped only. */
export function validateOptionalText(value, maxLength) {
  return String(value ?? '').trim().length <= maxLength;
}
