import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AdminRoute, ProtectedRoute, PublicOnlyRoute } from '../App';
import * as authContext from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

describe('auth route guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects unauthenticated users to /login for protected routes', () => {
    authContext.useAuth.mockReturnValue({ isAuthenticated: false, isReady: true });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><div>Dashboard</div></ProtectedRoute>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('redirects authenticated users away from public auth routes', () => {
    authContext.useAuth.mockReturnValue({ isAuthenticated: true, isReady: true });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><div>Login Page</div></PublicOnlyRoute>} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows a loading message while auth state is being restored', () => {
    authContext.useAuth.mockReturnValue({ isAuthenticated: false, isReady: false });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Dashboard</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText(/restoring your session/i)).toBeInTheDocument();
  });

  function renderAdminRoute() {
    return render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminRoute><div>Admin Panel</div></AdminRoute>} />
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders admin content for an authenticated admin user', () => {
    authContext.useAuth.mockReturnValue({ isAuthenticated: true, isReady: true, isAdmin: true });

    renderAdminRoute();

    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
  });

  it('redirects a non-admin user from admin routes to the dashboard', () => {
    authContext.useAuth.mockReturnValue({ isAuthenticated: true, isReady: true, isAdmin: false });

    renderAdminRoute();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('redirects an unauthenticated user from admin routes to login', () => {
    authContext.useAuth.mockReturnValue({ isAuthenticated: false, isReady: true, isAdmin: false });

    renderAdminRoute();

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});
