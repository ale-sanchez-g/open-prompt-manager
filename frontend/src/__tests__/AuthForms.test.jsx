import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import * as authContext from '../context/AuthContext';

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
});
