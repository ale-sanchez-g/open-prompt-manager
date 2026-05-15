import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { passwordRequirements, validateEmail, validatePassword } from '../utils/authValidation';

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (!validateEmail(form.email)) {
      nextErrors.email = 'Enter a valid email address';
    }
    if (!validatePassword(form.password)) {
      nextErrors.password = passwordRequirements;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    setServerError('');

    try {
      await register(form);
      setSuccessMessage('Registration successful. You can now sign in.');
      setForm({ email: '', password: '' });
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
              className="mt-2 w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="mt-2 w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="password"
              value={form.password}
              onChange={handleChange('password')}
              placeholder="Str0ng!Pass"
            />
          </label>
          <p className="text-xs text-gray-500">{passwordRequirements}</p>
          {errors.password ? <p className="text-sm text-red-400">{errors.password}</p> : null}
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
