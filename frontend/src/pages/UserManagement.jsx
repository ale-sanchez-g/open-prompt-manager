import React, { useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2, User as UserIcon } from 'lucide-react';

import { adminApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ConfirmButton from '../components/ConfirmButton';

const ROLES = ['user', 'admin'];

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: '', password: '', role: 'user' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');

  const fetchUsers = () =>
    adminApi
      .listUsers()
      .then((r) => {
        setUsers(r.data);
        setListError('');
      })
      .catch((err) => setListError(err.response?.data?.error || 'Failed to load users'));

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.createUser(form);
      setForm({ email: '', password: '', role: 'user' });
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (id, role) => {
    try {
      await adminApi.updateUser(id, { role });
      fetchUsers();
    } catch (err) {
      setListError(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleDelete = async (id) => {
    try {
      await adminApi.deleteUser(id);
      fetchUsers();
    } catch (err) {
      setListError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">User Management</h2>
        <p className="text-sm text-gray-400 mt-1">Add, update, and remove users and their roles.</p>
      </div>

      {/* Create form */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Add User</h3>
        {error && (
          <div className="mb-3 text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</div>
        )}
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="new-user-email" className="block text-xs text-gray-400 mb-1">Email</label>
            <input
              id="new-user-email"
              required
              type="email"
              className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-blue-500 w-56"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="new-user-password" className="block text-xs text-gray-400 mb-1">Password</label>
            <input
              id="new-user-password"
              required
              type="password"
              className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-blue-500 w-48"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="new-user-role" className="block text-xs text-gray-400 mb-1">Role</label>
            <select
              id="new-user-role"
              aria-label="New user role"
              className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} /> {saving ? 'Adding...' : 'Add User'}
          </button>
        </form>
      </div>

      {/* User list */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          All Users ({users.length})
        </h3>
        {listError && (
          <div className="mb-3 text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{listError}</div>
        )}
        {users.length === 0 ? (
          <p className="text-gray-500 text-sm">No users found.</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id;
              return (
                <div key={u.id} className="flex items-center justify-between bg-gray-700 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    {u.role === 'admin' ? (
                      <ShieldCheck size={18} className="text-amber-400" />
                    ) : (
                      <UserIcon size={18} className="text-gray-400" />
                    )}
                    <span className="text-white font-medium">{u.email}</span>
                    {isSelf && <span className="text-xs text-blue-300">(you)</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      aria-label={`Role for ${u.email}`}
                      className="bg-gray-800 text-white px-2 py-1 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <ConfirmButton
                      onConfirm={() => handleDelete(u.id)}
                      ariaLabel={`Delete ${u.email}`}
                      promptLabel="Delete this user? This cannot be undone."
                      confirmLabel="Delete"
                      busyLabel="Deleting…"
                      icon={<Trash2 size={16} />}
                      variant="danger"
                      disabled={isSelf}
                      className="text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
                      title="Delete user"
                      testId={`delete-user-${u.id}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
