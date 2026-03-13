import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Tag, Bot } from 'lucide-react';

import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import PromptList from './pages/PromptList';
import PromptEditor from './pages/PromptEditor';
import PromptDetail from './pages/PromptDetail';
import TagsManagement from './pages/TagsManagement';
import AgentsManagement from './pages/AgentsManagement';

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

function AppLayout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-800 flex flex-col py-6 px-3 gap-2">
        <div className="px-4 mb-4">
          <h1 className="text-lg font-bold text-white">Prompt Manager</h1>
          <p className="text-xs text-gray-400">v1.0.0</p>
        </div>
        <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
        <NavItem to="/prompts" icon={FileText} label="Prompts" />
        <NavItem to="/tags" icon={Tag} label="Tags" />
        <NavItem to="/agents" icon={Bot} label="Agents" />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-900 p-6">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/prompts" element={<PromptList />} />
          <Route path="/prompts/new" element={<PromptEditor />} />
          <Route path="/prompts/:id/edit" element={<PromptEditor />} />
          <Route path="/prompts/:id" element={<PromptDetail />} />
          <Route path="/tags" element={<TagsManagement />} />
          <Route path="/agents" element={<AgentsManagement />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/*" element={<AppLayout />} />
      </Routes>
    </Router>
  );
}
