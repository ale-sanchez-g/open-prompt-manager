// Extended registration fields with `registration_extended_fields` ON.
//
// The OFF state lives in AuthForms.test.jsx and is deliberately NOT mocked -
// frontend/.env.test forces flags off, which is what makes it a real regression
// guard. This file is the mirror image: it mocks the flag module per
// docs/FEATURE_FLAGS.md §9, because there is no other way to reach the ON path
// without a live Flagsmith.
//
// Both hooks the page consumes must be mocked together. useFlagIdentity comes
// from the same module, so a factory that only stubs useFeatureFlag leaves the
// page importing `undefined` and the failure looks nothing like its cause.

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import RegisterPage from '../pages/RegisterPage';
import * as authContext from '../context/AuthContext';
import { MARKETING_CONSENT_COPY } from '../constants/registrationConsent';
import { useFeatureFlag, useFlagIdentity } from '../featureFlags/FeatureFlagProvider';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../featureFlags/FeatureFlagProvider', () => ({
  useFeatureFlag: jest.fn(),
  useFlagIdentity: jest.fn(),
}));

const SESSION_ID = '3f1d5c9e-0b47-4a2f-9d1e-6c8a2b7f4e10';
const EMAIL = 'user@opm.io';
const PASSWORD = 'Str0ng!Pass1';

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

/** Fill the two legacy fields so the extended assertions are the only variable. */
function fillCredentials() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: EMAIL } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
}

describe('registration extended fields (flag ON)', () => {
  let register;

  beforeEach(() => {
    jest.clearAllMocks();
    register = jest.fn().mockResolvedValue({ data: { id: 'usr_123' } });
    authContext.useAuth.mockReturnValue({ login: jest.fn(), register });
    useFeatureFlag.mockReturnValue(true);
    useFlagIdentity.mockReturnValue(SESSION_ID);
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the four extended fields', () => {
    renderRegisterPage();

    expect(screen.getByLabelText('Company name')).toBeInTheDocument();
    expect(screen.getByLabelText('Job role')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.getByLabelText(MARKETING_CONSENT_COPY)).toBeInTheDocument();
  });

  it('renders the marketing opt-in unchecked and from the versioned consent copy', () => {
    renderRegisterPage();

    const optIn = screen.getByLabelText(MARKETING_CONSENT_COPY);
    expect(optIn).toHaveAttribute('type', 'checkbox');
    // Consent must be an affirmative act. A pre-ticked box is not consent, and
    // the API defaults marketing_opt_in to false to match.
    expect(optIn).not.toBeChecked();

    // Asserted against the imported constant, not a literal: the copy is
    // versioned and backend/tests/test_registration_contract.py pins the two
    // sides together. Inlining the string here would let the page drift from
    // the version that gets persisted without anything failing.
    expect(screen.getByText(MARKETING_CONSENT_COPY)).toBeInTheDocument();
  });

  // ── Submission ─────────────────────────────────────────────────────────────

  it('submits the extended block and the sessionId', async () => {
    renderRegisterPage();
    fillCredentials();

    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Acme Ltd' } });
    fireEvent.change(screen.getByLabelText('Job role'), { target: { value: 'Platform Engineer' } });
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+61 412 345 678' } });
    fireEvent.click(screen.getByLabelText(MARKETING_CONSENT_COPY));

    submit();

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
      sessionId: SESSION_ID,
      extended: {
        companyName: 'Acme Ltd',
        jobRole: 'Platform Engineer',
        // Separators stripped the same way app.core.registration.normalize_phone
        // strips them, so the value we validated is the value that gets stored.
        phone: '+61412345678',
        marketingOptIn: true,
      },
    });
  });

  it('sends nulls rather than empty strings for fields left blank', async () => {
    renderRegisterPage();
    fillCredentials();
    submit();

    await waitFor(() => expect(register).toHaveBeenCalled());
    // All four are optional: an untouched form must still register. Empty
    // strings would be persisted as empty strings; null means "not supplied".
    expect(register.mock.calls[0][0].extended).toEqual({
      companyName: null,
      jobRole: null,
      phone: null,
      marketingOptIn: false,
    });
  });

  it('never sends the extended block without an identity to evaluate it against', async () => {
    // §4.2: the API resolves an absent sessionId to flag-off and discards the
    // block. Collecting the fields anyway would lose the data silently.
    useFlagIdentity.mockReturnValue(null);
    renderRegisterPage();

    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();

    fillCredentials();
    submit();

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
  });

  it('keeps an in-flight submission alive when the flag flips off (guardrail 6)', async () => {
    let resolveRegister;
    register.mockImplementation(
      () => new Promise((resolve) => {
        resolveRegister = resolve;
      }),
    );

    const { rerender } = renderRegisterPage();
    fillCredentials();
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Acme Ltd' } });
    submit();

    await waitFor(() => expect(register).toHaveBeenCalled());

    // The flag goes off mid-flight; Flagsmith polls and the page re-renders
    // while the POST is still open.
    useFeatureFlag.mockReturnValue(false);
    rerender(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();

    // The payload was frozen at submit time, so the request is unaffected, and
    // the API ignores an extended block it no longer wants rather than 422ing.
    expect(register.mock.calls[0][0].extended.companyName).toBe('Acme Ltd');

    resolveRegister({ data: { id: 'usr_123' } });
    expect(
      await screen.findByText('Registration successful. You can now sign in.'),
    ).toBeInTheDocument();
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('rejects a malformed phone number without blocking the other fields', async () => {
    renderRegisterPage();
    fillCredentials();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: 'call me' } });
    submit();

    expect(await screen.findByText(/does not look like a phone number/)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('accepts a national-format phone number', async () => {
    renderRegisterPage();
    fillCredentials();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '(02) 9876 5432' } });
    submit();

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][0].extended.phone).toBe('0298765432');
  });

  it('rejects over-long free text at the same limits as the API', async () => {
    renderRegisterPage();
    fillCredentials();
    // maxLength stops a human typing this; fireEvent sets the value directly,
    // which is also what a paste-and-autofill path can produce.
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'x'.repeat(201) } });
    fireEvent.change(screen.getByLabelText('Job role'), { target: { value: 'y'.repeat(121) } });
    submit();

    expect(await screen.findByText(/Company name must be 200 characters or fewer/)).toBeInTheDocument();
    expect(screen.getByText(/Job role must be 120 characters or fewer/)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the field is edited', async () => {
    renderRegisterPage();
    fillCredentials();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: 'call me' } });
    submit();

    await screen.findByText(/does not look like a phone number/);

    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+61412345678' } });
    await waitFor(() => {
      expect(screen.getByLabelText('Phone number')).not.toHaveAttribute('aria-invalid');
    });
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('gives every extended input an accessible name from a real label', () => {
      const { container } = renderRegisterPage();

      // Every control in the form must be reachable by its label. This catches a
      // new input added without one, which getByLabelText assertions elsewhere
      // would simply never look for.
      const controls = [...container.querySelectorAll('form input')];
      expect(controls).toHaveLength(6);
      controls.forEach((control) => {
        expect(control).toHaveAccessibleName();
      });
    });

    it('describes the optional group and the phone format', () => {
      renderRegisterPage();

      expect(screen.getByRole('group', { name: /About you/ })).toHaveAccessibleDescription(
        /You can leave them all blank/,
      );
      expect(screen.getByLabelText('Phone number')).toHaveAccessibleDescription(
        /For example \+61 412 345 678/,
      );
    });

    it('associates each error with its input and announces it', async () => {
      renderRegisterPage();
      fillCredentials();
      fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: 'call me' } });
      fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'x'.repeat(201) } });
      submit();

      const phone = await screen.findByLabelText('Phone number');
      expect(phone).toHaveAttribute('aria-invalid', 'true');
      // The hint must survive the error rather than be replaced by it - the user
      // needs the format to fix the problem.
      expect(phone).toHaveAccessibleDescription(
        /For example[\s\S]*does not look like a phone number/,
      );

      const company = screen.getByLabelText('Company name');
      expect(company).toHaveAttribute('aria-invalid', 'true');
      expect(company).toHaveAccessibleDescription(/Company name must be 200 characters or fewer/);

      // role="alert" is what makes the error reach a screen reader user who is
      // not focused on the field.
      const alerts = screen.getAllByRole('alert');
      expect(alerts.map((node) => node.textContent)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Company name must be 200 characters or fewer/),
          expect.stringMatching(/does not look like a phone number/),
        ]),
      );
    });

    it('places the extended fields in a logical tab order', async () => {
      const user = userEvent.setup();
      renderRegisterPage();

      const expectedOrder = [
        screen.getByLabelText('Email'),
        screen.getByLabelText('Password'),
        screen.getByLabelText('Company name'),
        screen.getByLabelText('Job role'),
        screen.getByLabelText('Phone number'),
        screen.getByLabelText(MARKETING_CONSENT_COPY),
        screen.getByRole('button', { name: /create account/i }),
      ];

      for (const element of expectedOrder) {
        await user.tab();
        expect(element).toHaveFocus();
      }
    });

    it('can be completed and submitted with the keyboard alone', async () => {
      const user = userEvent.setup();
      renderRegisterPage();

      await user.tab();
      await user.keyboard(EMAIL);
      await user.tab();
      await user.keyboard(PASSWORD);
      await user.tab();
      await user.keyboard('Acme Ltd');
      await user.tab();
      await user.keyboard('Platform Engineer');
      await user.tab();
      await user.keyboard('+61412345678');
      await user.tab();
      await user.keyboard(' '); // toggle the opt-in
      await user.tab();
      await user.keyboard('{Enter}'); // activate "Create account"

      await waitFor(() => expect(register).toHaveBeenCalled());
      expect(register).toHaveBeenCalledWith({
        email: EMAIL,
        password: PASSWORD,
        sessionId: SESSION_ID,
        extended: {
          companyName: 'Acme Ltd',
          jobRole: 'Platform Engineer',
          phone: '+61412345678',
          marketingOptIn: true,
        },
      });
    });
  });
});
