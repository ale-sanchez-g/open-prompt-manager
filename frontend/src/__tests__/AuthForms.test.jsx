import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import * as authContext from '../context/AuthContext';
import { MARKETING_CONSENT_COPY } from '../constants/registrationConsent';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

describe('auth pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the server error when login fails', async () => {
    authContext.useAuth.mockReturnValue({
      login: jest.fn().mockRejectedValue({ response: { data: { error: 'Invalid credentials' } } }),
      register: jest.fn(),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@opm.io' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Wrong!Pass1' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('prevents register submission when the password is weak', async () => {
    const register = jest.fn();
    authContext.useAuth.mockReturnValue({ login: jest.fn(), register });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@opm.io' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect((await screen.findAllByText(/password must be at least 10 characters/i)).length).toBeGreaterThan(1);
    expect(register).not.toHaveBeenCalled();
  });

  it('navigates to the dashboard after a successful login', async () => {
    authContext.useAuth.mockReturnValue({
      login: jest.fn().mockResolvedValue({ data: { access_token: 'token' } }),
      register: jest.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@opm.io' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Str0ng!Pass1' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('shows a confirmation message after successful registration', async () => {
    authContext.useAuth.mockReturnValue({
      login: jest.fn(),
      register: jest.fn().mockResolvedValue({ data: { id: 'usr_123' } }),
    });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@opm.io' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Str0ng!Pass1' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Registration successful. You can now sign in.')).toBeInTheDocument();
    });
  });

  // ── registration_extended_fields OFF (guardrail 2) ─────────────────────────
  //
  // Deliberately unmocked. frontend/.env.test sets VITE_FLAGSMITH_ENABLED=false,
  // so useFeatureFlag short-circuits to its default and useFlagIdentity returns
  // null for real - the same code path a browser takes when Flagsmith is
  // unreachable or the flag is off. Mocking the flag here would turn the only
  // genuine regression guard in the suite into a restatement of the mock.
  //
  // The assertions above this comment are the OFF-state behaviour contract; they
  // are intentionally left byte-for-byte as they were before the flag existed.

  it('mounts no extended fields and asks Flagsmith nothing while the flag is off', async () => {
    authContext.useAuth.mockReturnValue({ login: jest.fn(), register: jest.fn() });

    const { container } = render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    // The whole extended block, by every handle a user or a test could grab it by.
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Job role')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(MARKETING_CONSENT_COPY)).not.toBeInTheDocument();

    // Structural, not textual: the legacy form is exactly two inputs and one
    // button. A new control of any kind, labelled or not, fails here.
    expect(container.querySelectorAll('form input')).toHaveLength(2);
    expect(container.querySelectorAll('form button')).toHaveLength(1);
  });

  it('posts only email and password while the flag is off', async () => {
    const register = jest.fn().mockResolvedValue({ data: { id: 'usr_123' } });
    authContext.useAuth.mockReturnValue({ login: jest.fn(), register });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@opm.io' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Str0ng!Pass1' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(register).toHaveBeenCalled());

    // Guardrail 2's testable definition is "identical request payload". With
    // flags disabled there is no identity either, so not even sessionId appears.
    expect(register).toHaveBeenCalledWith({ email: 'user@opm.io', password: 'Str0ng!Pass1' });
    expect(Object.keys(register.mock.calls[0][0])).toEqual(['email', 'password']);
  });
});
