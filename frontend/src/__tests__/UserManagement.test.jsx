import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import UserManagement from '../pages/UserManagement';
import { adminApi } from '../services/api';
import * as authContext from '../context/AuthContext';

jest.mock('../services/api');
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockUsers = [
  { id: 'usr_admin', email: 'admin@opm.io', role: 'admin', created_at: '2026-01-01T00:00:00' },
  { id: 'usr_member', email: 'member@opm.io', role: 'user', created_at: '2026-02-01T00:00:00' },
];

beforeEach(() => {
  authContext.useAuth.mockReturnValue({ user: { id: 'usr_admin', email: 'admin@opm.io', role: 'admin' } });
  adminApi.listUsers.mockResolvedValue({ data: mockUsers });
  adminApi.createUser.mockResolvedValue({ data: { id: 'usr_new', email: 'new@opm.io', role: 'user' } });
  adminApi.updateUser.mockResolvedValue({ data: {} });
  adminApi.deleteUser.mockResolvedValue({});
  adminApi.unlockUser.mockResolvedValue({ data: {} });
});

afterEach(() => {
  jest.clearAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><UserManagement /></MemoryRouter>);
}

describe('UserManagement', () => {
  it('renders the page heading', async () => {
    renderPage();
    expect(await screen.findByText('User Management')).toBeInTheDocument();
  });

  it('lists existing users with their roles', async () => {
    renderPage();
    expect(await screen.findByText('admin@opm.io')).toBeInTheDocument();
    expect(await screen.findByText('member@opm.io')).toBeInTheDocument();
    expect(await screen.findByText('All Users (2)')).toBeInTheDocument();
  });

  it('submits the create-user form with email, password, and role', async () => {
    renderPage();
    await screen.findByText('member@opm.io');

    fireEvent.change(screen.getByLabelText('Email', { selector: 'input' }), {
      target: { value: 'new@opm.io' },
    });
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), {
      target: { value: 'Str0ng!Pass1' },
    });
    fireEvent.change(screen.getByLabelText('New user role'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add User' }));

    await waitFor(() => {
      expect(adminApi.createUser).toHaveBeenCalledWith({
        email: 'new@opm.io',
        password: 'Str0ng!Pass1',
        role: 'admin',
      });
    });
  });

  it('updates a user role via the role selector', async () => {
    renderPage();
    await screen.findByText('member@opm.io');

    fireEvent.change(screen.getByLabelText('Role for member@opm.io'), { target: { value: 'admin' } });

    await waitFor(() => {
      expect(adminApi.updateUser).toHaveBeenCalledWith('usr_member', { role: 'admin' });
    });
  });

  it('deletes a user after inline confirmation', async () => {
    renderPage();
    await screen.findByText('member@opm.io');

    fireEvent.click(screen.getByLabelText('Delete member@opm.io'));
    fireEvent.click(screen.getByTestId('delete-user-usr_member-confirm'));

    await waitFor(() => {
      expect(adminApi.deleteUser).toHaveBeenCalledWith('usr_member');
    });
  });

  it('disables role change and delete for the current admin (self)', async () => {
    renderPage();
    await screen.findByText('admin@opm.io');

    expect(screen.getByLabelText('Role for admin@opm.io')).toBeDisabled();
    expect(screen.getByLabelText('Delete admin@opm.io')).toBeDisabled();
  });

  it('shows an error when user creation fails', async () => {
    adminApi.createUser.mockRejectedValue({ response: { data: { error: 'Email already registered' } } });
    renderPage();
    await screen.findByText('member@opm.io');

    fireEvent.change(screen.getByLabelText('Email', { selector: 'input' }), {
      target: { value: 'admin@opm.io' },
    });
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), {
      target: { value: 'Str0ng!Pass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add User' }));

    expect(await screen.findByText('Email already registered')).toBeInTheDocument();
  });

  it('does not show an Unlock button or lockout badge for users that are not locked out', async () => {
    renderPage();
    await screen.findByText('member@opm.io');

    expect(screen.queryByLabelText('Unlock member@opm.io')).not.toBeInTheDocument();
    expect(screen.queryByText('Locked out')).not.toBeInTheDocument();
  });

  it('shows an Unlock button for a locked-out user and clears the lockout', async () => {
    const lockedUsers = [
      mockUsers[0],
      { ...mockUsers[1], is_locked: true },
    ];
    adminApi.listUsers.mockResolvedValue({ data: lockedUsers });
    renderPage();
    await screen.findByText('member@opm.io');

    expect(screen.getByText('Locked out')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Unlock member@opm.io'));

    await waitFor(() => {
      expect(adminApi.unlockUser).toHaveBeenCalledWith('usr_member');
    });
    // Refetches the user list after unlocking.
    expect(adminApi.listUsers).toHaveBeenCalledTimes(2);
  });

  it('shows an error when unlocking a user fails', async () => {
    const lockedUsers = [
      mockUsers[0],
      { ...mockUsers[1], is_locked: true },
    ];
    adminApi.listUsers.mockResolvedValue({ data: lockedUsers });
    adminApi.unlockUser.mockRejectedValue({ response: { data: { error: 'User not found' } } });
    renderPage();
    await screen.findByText('member@opm.io');

    fireEvent.click(screen.getByLabelText('Unlock member@opm.io'));

    expect(await screen.findByText('User not found')).toBeInTheDocument();
  });
});
