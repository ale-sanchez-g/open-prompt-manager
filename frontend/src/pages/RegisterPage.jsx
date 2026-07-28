import React, { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useAuth } from '../context/AuthContext';
import { MARKETING_CONSENT_COPY } from '../constants/registrationConsent';
import { FLAGS } from '../featureFlags/config';
import { useFeatureFlag, useFlagIdentity } from '../featureFlags/FeatureFlagProvider';
import { getTargetingTraits } from '../featureFlags/targetingStrategy';
import {
  companyNameMaxLength,
  jobRoleMaxLength,
  normalizePhone,
  passwordRequirements,
  phoneInvalidMessage,
  phoneMaxLength,
  phoneRequirements,
  validateEmail,
  validateOptionalText,
  validatePassword,
  validatePhone,
} from '../utils/authValidation';

const emptyExtended = { companyName: '', jobRole: '', phone: '', marketingOptIn: false };

const fieldClassName =
  'mt-2 w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function RegisterPage() {
  const { register } = useAuth();
  // Flag OFF (and whenever Flagsmith is disabled, unreachable, or still loading)
  // => false => nothing below mounts and the form is byte-identical to today.
  const extendedFlagEnabled = useFeatureFlag(FLAGS.REGISTRATION_EXTENDED_FIELDS, false);
  // `{}` for every visitor except one who arrived via an explicit
  // `?opm_target=device|geo` link (§13.2/§13.3) - the default case sends no
  // traits at all, identical to before these strategies existed.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reads only the URL, stable for the page's lifetime
  const targetingTraits = useMemo(() => getTargetingTraits(), []);
  const hasTargetingTraits = Object.keys(targetingTraits).length > 0;
  // Same identifier the browser used with Flagsmith; sent so the API can
  // re-evaluate the same flag for the same identity (§4.2). Null when flags are
  // disabled, in which case it is omitted from the payload entirely.
  const sessionId = useFlagIdentity(hasTargetingTraits ? { traits: targetingTraits } : undefined);

  // No identity, no fields - even if the flag reads true. §4.2 makes the API's
  // decision the one that counts, and the API resolves an absent `sessionId` to
  // false. Rendering the fields anyway would collect data the API is guaranteed
  // to discard: the visitor fills them in, the registration succeeds, and the
  // values vanish silently. That is worse than not asking. It happens when the
  // environment default turns the flag on for an anonymous visitor whose browser
  // gave us no CSPRNG to mint an identifier with.
  const showExtended = extendedFlagEnabled && Boolean(sessionId);

  const [form, setForm] = useState({ email: '', password: '' });
  const [extended, setExtended] = useState(emptyExtended);
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerError('');
    setSuccessMessage('');
  };

  const handleExtendedChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setExtended((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerError('');
    setSuccessMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (!validateEmail(form.email)) {
      nextErrors.email = 'Enter a valid email address';
    }
    if (!validatePassword(form.password)) {
      nextErrors.password = passwordRequirements;
    }

    // Only validate what is actually on screen. With the flag off these fields
    // cannot hold anything a user typed, and validating hidden state could block
    // a submit for a reason the user cannot see.
    if (showExtended) {
      if (!validateOptionalText(extended.companyName, companyNameMaxLength)) {
        nextErrors.companyName = `Company name must be ${companyNameMaxLength} characters or fewer`;
      }
      if (!validateOptionalText(extended.jobRole, jobRoleMaxLength)) {
        nextErrors.jobRole = `Job role must be ${jobRoleMaxLength} characters or fewer`;
      }
      if (!validatePhone(extended.phone)) {
        nextErrors.phone = phoneInvalidMessage;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    setServerError('');

    // Built explicitly rather than spreading form state, so the OFF payload stays
    // exactly {email, password} (+ sessionId) and no extra key can leak in.
    const payload = { email: form.email, password: form.password };
    if (sessionId) {
      payload.sessionId = sessionId;
      // Only ever present when an explicit ?opm_target= link asked for it, so
      // the default visitor's payload is unchanged from before §13 existed.
      if (hasTargetingTraits) {
        payload.flagTraits = targetingTraits;
      }
    }
    if (showExtended) {
      payload.extended = {
        companyName: extended.companyName.trim() || null,
        jobRole: extended.jobRole.trim() || null,
        // Normalised the same way the backend normalises it, so what we validated
        // is what gets stored.
        phone: normalizePhone(extended.phone) || null,
        marketingOptIn: extended.marketingOptIn,
      };
    }

    try {
      await register(payload);
      setSuccessMessage('Registration successful. You can now sign in.');
      setForm({ email: '', password: '' });
      setExtended(emptyExtended);
    } catch (requestError) {
      setServerError(requestError.response?.data?.error || 'Unable to register');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl shadow-xl p-8 space-y-6">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-400">Open Prompt Manager</p>
          <h1 className="text-3xl font-bold text-white mt-2">Create account</h1>
          <p className="text-gray-400 text-sm mt-2">Register to manage prompts through the secured dashboard.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-gray-300">
            Email
            <input
              className={fieldClassName}
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              placeholder="user@opm.io"
            />
          </label>
          {errors.email ? <p className="text-sm text-red-400">{errors.email}</p> : null}

          <label className="block text-sm text-gray-300">
            Password
            <input
              className={fieldClassName}
              type="password"
              value={form.password}
              onChange={handleChange('password')}
              placeholder="Str0ng!Pass"
            />
          </label>
          <p className="text-xs text-gray-500">{passwordRequirements}</p>
          {errors.password ? <p className="text-sm text-red-400">{errors.password}</p> : null}

          {showExtended ? (
            <fieldset
              className="space-y-4 border-t border-gray-700 pt-4"
              aria-describedby="extended-fields-hint"
            >
              <legend className="text-sm text-gray-300">About you (optional)</legend>
              <p id="extended-fields-hint" className="text-xs text-gray-500">
                These help us tailor your onboarding. You can leave them all blank.
              </p>

              <div>
                <label className="block text-sm text-gray-300" htmlFor="companyName">
                  Company name
                </label>
                <input
                  id="companyName"
                  name="companyName"
                  className={fieldClassName}
                  type="text"
                  maxLength={companyNameMaxLength}
                  value={extended.companyName}
                  onChange={handleExtendedChange('companyName')}
                  autoComplete="organization"
                  aria-invalid={errors.companyName ? 'true' : undefined}
                  aria-describedby={errors.companyName ? 'companyName-error' : undefined}
                />
                {errors.companyName ? (
                  <p id="companyName-error" role="alert" className="mt-1 text-sm text-red-400">
                    {errors.companyName}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm text-gray-300" htmlFor="jobRole">
                  Job role
                </label>
                <input
                  id="jobRole"
                  name="jobRole"
                  className={fieldClassName}
                  type="text"
                  maxLength={jobRoleMaxLength}
                  value={extended.jobRole}
                  onChange={handleExtendedChange('jobRole')}
                  autoComplete="organization-title"
                  aria-invalid={errors.jobRole ? 'true' : undefined}
                  aria-describedby={errors.jobRole ? 'jobRole-error' : undefined}
                />
                {errors.jobRole ? (
                  <p id="jobRole-error" role="alert" className="mt-1 text-sm text-red-400">
                    {errors.jobRole}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm text-gray-300" htmlFor="phone">
                  Phone number
                </label>
                <input
                  id="phone"
                  name="phone"
                  className={fieldClassName}
                  type="tel"
                  maxLength={phoneMaxLength}
                  value={extended.phone}
                  onChange={handleExtendedChange('phone')}
                  autoComplete="tel"
                  aria-invalid={errors.phone ? 'true' : undefined}
                  aria-describedby={errors.phone ? 'phone-hint phone-error' : 'phone-hint'}
                />
                <p id="phone-hint" className="mt-1 text-xs text-gray-500">
                  {phoneRequirements}
                </p>
                {errors.phone ? (
                  <p id="phone-error" role="alert" className="mt-1 text-sm text-red-400">
                    {errors.phone}
                  </p>
                ) : null}
              </div>

              <div className="flex items-start gap-3">
                <input
                  id="marketingOptIn"
                  name="marketingOptIn"
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-700 bg-gray-900 text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  checked={extended.marketingOptIn}
                  onChange={handleExtendedChange('marketingOptIn')}
                />
                {/* Copy comes from the versioned constant so the exact text the
                    user agreed to can be evidenced later (guardrail 8). Never
                    inline it here. */}
                <label className="text-sm text-gray-300" htmlFor="marketingOptIn">
                  {MARKETING_CONSENT_COPY}
                </label>
              </div>
            </fieldset>
          ) : null}

          {serverError ? <p className="text-sm text-red-400">{serverError}</p> : null}
          {successMessage ? <p className="text-sm text-green-400">{successMessage}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-white font-medium transition-colors"
          >
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-gray-400">
          Already registered?{' '}
          <Link to="/login" className="text-blue-400 hover:text-blue-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
