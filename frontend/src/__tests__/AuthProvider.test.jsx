import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { ProtectedRoute } from '../App';
import * as apiService from '../services/api';

function RoleProbe() {
  const { isAdmin, user } = useAuth();
  return <div>{`role:${user?.role || 'none'}:admin:${String(isAdmin)}`}</div>;
}

jest.mock('../services/api', () => ({
  authApi: {
    refresh: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  },
  getAccessToken: jest.fn(() => null),
  setAccessToken: jest.fn(),
  clearAccessToken: jest.fn(),
  subscribeToAuthFailures: jest.fn(() => () => {}),
}));

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restores authentication from the refresh endpoint on app load', async () => {
    apiService.authApi.refresh.mockResolvedValue({
      data: { access_token: 'fresh-token', token_type: 'Bearer', expires_in: 900 },
    });
    apiService.authApi.me.mockResolvedValue({ data: { id: 'usr_1', email: 'user@opm.io', role: 'user' } });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute><div>Dashboard</div></ProtectedRoute>} />
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(apiService.authApi.refresh).toHaveBeenCalled();
    expect(apiService.setAccessToken).toHaveBeenCalledWith('fresh-token');
  });

  it('redirects to login when refresh fails on app load', async () => {
    apiService.authApi.refresh.mockRejectedValue(new Error('No session'));

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute><div>Dashboard</div></ProtectedRoute>} />
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(apiService.clearAccessToken).toHaveBeenCalled();
  });

  it('exposes the role and isAdmin flag loaded from the me endpoint', async () => {
    apiService.authApi.refresh.mockResolvedValue({
      data: { access_token: 'fresh-token', token_type: 'Bearer', expires_in: 900 },
    });
    apiService.authApi.me.mockResolvedValue({ data: { id: 'usr_1', email: 'admin@opm.io', role: 'admin' } });

    render(
      <MemoryRouter>
        <AuthProvider>
          <RoleProbe />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('role:admin:admin:true')).toBeInTheDocument();
  });
});
