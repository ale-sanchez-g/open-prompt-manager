import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { BrowserRouter as Router, Navigate, Routes, Route, NavLink, Link } from 'react-router-dom';
import { BookOpen, Bot, FileText, LayoutDashboard, LogOut, ShieldCheck, Tag } from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import { FeatureFlagProvider } from './featureFlags/FeatureFlagProvider';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import PromptList from './pages/PromptList';
import PromptEditor from './pages/PromptEditor';
import PromptDetail from './pages/PromptDetail';
import TagsManagement from './pages/TagsManagement';
import AgentsManagement from './pages/AgentsManagement';
import AgentDetail from './pages/AgentDetail';
import ApiDocs from './pages/ApiDocs';
import UserManagement from './pages/UserManagement';
import { healthApi } from './services/api';

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

function AuthGate({ children }) {
  return <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">{children}</div>;
}

export function ProtectedRoute({ children }) {
  const { isAuthenticated, isReady } = useAuth();

  if (!isReady) {
    return <AuthGate>Restoring your session...</AuthGate>;
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

ProtectedRoute.propTypes = { children: PropTypes.node.isRequired };

export function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isReady } = useAuth();

  if (!isReady) {
    return <AuthGate>Checking your session...</AuthGate>;
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

PublicOnlyRoute.propTypes = { children: PropTypes.node.isRequired };

export function AdminRoute({ children }) {
  const { isAuthenticated, isReady, isAdmin } = useAuth();

  if (!isReady) {
    return <AuthGate>Restoring your session...</AuthGate>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return isAdmin ? children : <Navigate to="/dashboard" replace />;
}

AdminRoute.propTypes = { children: PropTypes.node.isRequired };

export function AppLayout() {
  const { logout, isAdmin } = useAuth();
  const [appVersion, setAppVersion] = useState('Loading...');

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await healthApi.check();
        setAppVersion(response.data.version);
      } catch (error) {
        console.error('Failed to fetch version:', error);
        setAppVersion('Unknown');
      }
    };

    fetchVersion();
  }, []);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="w-56 flex-shrink-0 bg-gray-800 flex flex-col py-6 px-3 gap-2">
        <div className="px-4 mb-4">
          <Link to="/" className="block hover:opacity-80 transition-opacity">
            <h1 className="text-lg font-bold text-white">Prompt Manager</h1>
            <p className="text-xs text-gray-400">v{appVersion}</p>
          </Link>
        </div>
        <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
        <NavItem to="/prompts" icon={FileText} label="Prompts" />
        <NavItem to="/tags" icon={Tag} label="Tags" />
        <NavItem to="/agents" icon={Bot} label="Agents" />
        <NavItem to="/api-docs" icon={BookOpen} label="API Docs" />
        {isAdmin && <NavItem to="/admin" icon={ShieldCheck} label="Admin" />}
        <button
          type="button"
          onClick={logout}
          className="mt-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      <main className="flex-1 overflow-auto bg-gray-900 p-6">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/prompts" element={<PromptList />} />
          <Route path="/prompts/new" element={<PromptEditor />} />
          <Route path="/prompts/:id/edit" element={<PromptEditor />} />
          <Route path="/prompts/:id" element={<PromptDetail />} />
          <Route path="/tags" element={<TagsManagement />} />
          <Route path="/agents" element={<AgentsManagement />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/api-docs" element={<ApiDocs />} />
          <Route path="/admin" element={<AdminRoute><UserManagement /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <FeatureFlagProvider>
          <Routes>
            <Route
              path="/login"
              element={(
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              )}
            />
            <Route
              path="/register"
              element={(
                <PublicOnlyRoute>
                  <RegisterPage />
                </PublicOnlyRoute>
              )}
            />
            <Route
              path="/"
              element={(
                <ProtectedRoute>
                  <LandingPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/*"
              element={(
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              )}
            />
          </Routes>
        </FeatureFlagProvider>
      </AuthProvider>
    </Router>
  );
}
