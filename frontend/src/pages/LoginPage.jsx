import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { validateEmail } from '../utils/authValidation';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateEmail(email)) {
      setError('Enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await login({ email, password });
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to sign in');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl shadow-xl p-8 space-y-6">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-400">Open Prompt Manager</p>
          <h1 className="text-3xl font-bold text-white mt-2">Sign in</h1>
          <p className="text-gray-400 text-sm mt-2">Use your account to access prompts, tags, and agents.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-gray-300">
            Email
            <input
              className="mt-2 w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@opm.io"
            />
          </label>

          <label className="block text-sm text-gray-300">
            Password
            <input
              className="mt-2 w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••"
            />
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-white font-medium transition-colors"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-sm text-gray-400">
          Need an account?{' '}
          <Link to="/register" className="text-blue-400 hover:text-blue-300">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
