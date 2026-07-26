// Client-side mirror of app/core/registration.py.
//
// The cases below are deliberately the same ones as
// backend/tests/test_registration_contract.py::test_valid_phone_shapes and
// ::test_invalid_phone_shapes. Two suites, one list: if the regexes drift, one
// of them goes red. A divergence here is not cosmetic - the frontend accepting
// something the API rejects is a 422 the user cannot act on, and the frontend
// rejecting something the API would accept is lost data on an optional field.

import {
  companyNameMaxLength,
  isValidPhone,
  jobRoleMaxLength,
  normalizePhone,
  phoneMaxLength,
  validateOptionalText,
  validatePhone,
} from '../utils/authValidation';

describe('extended registration validation', () => {
  it('mirrors the backend column limits', () => {
    expect(companyNameMaxLength).toBe(200);
    expect(jobRoleMaxLength).toBe(120);
    expect(phoneMaxLength).toBe(32);
  });

  describe('phone', () => {
    it.each([
      '+61412345678',
      '+61 412 345 678',
      '(02) 9876 5432',
      '0412-345-678',
      '+1 (555) 123-4567',
    ])('accepts %s', (raw) => {
      expect(isValidPhone(raw)).toBe(true);
      expect(validatePhone(raw)).toBe(true);
    });

    it.each([
      'not a phone',
      '+',
      '123',
      '0412345678901234567',
      '+0412345678', // E.164 has no leading zero after the country code
    ])('rejects %s', (raw) => {
      expect(isValidPhone(raw)).toBe(false);
      expect(validatePhone(raw)).toBe(false);
    });

    it.each(['', '   '])('is not a valid number but is an acceptable blank: %p', (raw) => {
      // is_valid_phone('') is False on the backend too. The difference is what
      // the form does with it: blank means "not supplied", not "wrong", because
      // the field is optional.
      expect(isValidPhone(raw)).toBe(false);
      expect(validatePhone(raw)).toBe(true);
    });

    it('strips the separators a human types', () => {
      expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567');
      expect(normalizePhone('  0412 345 678  ')).toBe('0412345678');
    });

    it('normalises to something that fits VARCHAR(32)', () => {
      expect(normalizePhone('+1 (555) 123-4567').length).toBeLessThanOrEqual(phoneMaxLength);
    });

    it('rejects raw input longer than the column even if it would normalise', () => {
      // 32 is the width of the column; the input attribute caps typing at the
      // same number, and this is the paste/autofill backstop.
      expect(validatePhone(`+61${' '.repeat(40)}412345678`)).toBe(false);
    });

    it('handles null and undefined without throwing', () => {
      expect(normalizePhone(null)).toBe('');
      expect(validatePhone(undefined)).toBe(true);
      expect(isValidPhone(null)).toBe(false);
    });
  });

  describe('optional free text', () => {
    it('accepts anything up to the limit, including blank', () => {
      expect(validateOptionalText('', companyNameMaxLength)).toBe(true);
      expect(validateOptionalText('Acme Ltd', companyNameMaxLength)).toBe(true);
      expect(validateOptionalText('x'.repeat(200), companyNameMaxLength)).toBe(true);
    });

    it('rejects past the limit', () => {
      expect(validateOptionalText('x'.repeat(201), companyNameMaxLength)).toBe(false);
      expect(validateOptionalText('y'.repeat(121), jobRoleMaxLength)).toBe(false);
    });

    it('measures the trimmed value, as the backend does', () => {
      // app.services.registration_service._clean trims before the length check,
      // so padding must not be what pushes a value over the limit.
      expect(validateOptionalText(`  ${'x'.repeat(200)}  `, companyNameMaxLength)).toBe(true);
    });
  });
});
