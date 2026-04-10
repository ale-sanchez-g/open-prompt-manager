import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Edit, Trash2, Activity, Clock, Check, X, FileText, RefreshCw,
} from 'lucide-react';
import { agentsApi } from '../services/api';

const STATUS_OPTIONS = ['active', 'inactive', 'deprecated'];

const statusStyle = {
  active: 'bg-green-900 text-green-300',
  inactive: 'bg-gray-700 text-gray-400',
  deprecated: 'bg-red-900 text-red-300',
};

function MetricBadge({ label, value }) {
  return (
    <div className="bg-gray-700 rounded-lg px-4 py-3 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', type: '', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAgent = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await agentsApi.get(id);
      setAgent(r.data);
      setForm({
        name: r.data.name,
        description: r.data.description || '',
        type: r.data.type || '',
        status: r.data.status,
      });
    } catch (err) {
      setAgent(null);
      setLoadError(err.response?.data?.detail || 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAgent();
  }, [loadAgent]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this agent?')) return;
    setError('');
    try {
      await agentsApi.delete(id);
      navigate('/agents');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete agent');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await agentsApi.update(id, form);
      const res = await agentsApi.get(id);
      setAgent(res.data);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="max-w-4xl min-h-[60vh] flex items-center justify-center px-4">
        <div role="alert" className="w-full max-w-3xl bg-gray-900/80 border border-gray-700 rounded-2xl p-8 md:p-10">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-red-400 text-sm tracking-wide mb-2">ERROR</p>
              <h2 className="text-4xl md:text-5xl font-semibold text-white leading-tight mb-4">Oops.</h2>
              <p className="text-gray-300 text-sm md:text-base mb-2">We could not load this agent right now.</p>
              <p className="text-gray-500 text-sm mb-6">{loadError}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={loadAgent}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <RefreshCw size={14} /> Try again
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/agents')}
                  className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  <ArrowLeft size={14} /> Back to agents
                </button>
              </div>
            </div>
            <div className="hidden md:flex justify-center">
              <div className="w-48 h-48 rounded-2xl border border-dashed border-gray-600 bg-gray-800/70 flex items-center justify-center text-gray-500 text-6xl font-semibold">
                404
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="text-gray-400">Loading...</div>;
  if (!agent) return <div className="text-red-400">Agent not found.</div>;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate('/agents')}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-2"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-white">{agent.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle[agent.status] || statusStyle.inactive}`}>
              {agent.status}
            </span>
            {agent.type && (
              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
                {agent.type}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(!editing)}
            className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <Edit size={14} /> Edit
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 text-sm bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</div>
      )}

      {/* Inline edit form */}
      {editing && (
        <div className="bg-gray-800 rounded-xl p-5 border border-blue-600">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Edit Agent</h3>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input
                required
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <input
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
                placeholder="e.g. chatbot, classifier"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Status</label>
              <select
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Check size={14} /> {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setError(''); }}
                className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                <X size={14} /> Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {agent.description && (
            <p className="text-gray-300">{agent.description}</p>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <MetricBadge label="Executions" value={
              <span className="flex items-center justify-center gap-1">
                <Activity size={14} className="text-blue-400" />
                {agent.execution_count}
              </span>
            } />
            <MetricBadge label="Success Rate" value={`${(agent.success_rate * 100).toFixed(0)}%`} />
            <MetricBadge label="Avg Rating" value={agent.avg_rating.toFixed(1)} />
          </div>

          {/* Associated Prompts */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <FileText size={14} /> Associated Prompts
            </h3>
            {agent.prompts.length === 0 ? (
              <p className="text-gray-500 text-sm">No prompts associated with this agent.</p>
            ) : (
              <div className="space-y-2">
                {agent.prompts.map((p) => (
                  <Link
                    key={p.id}
                    to={`/prompts/${p.id}`}
                    className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3 border border-gray-700 hover:border-blue-500 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      {p.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{p.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded ml-3 flex-shrink-0">
                      v{p.version}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Metadata */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Clock size={14} /> Metadata
            </h3>
            <div className="space-y-1 text-xs text-gray-400">
              <p>ID: #{agent.id}</p>
              <p>Status: {agent.status}</p>
              {agent.type && <p>Type: {agent.type}</p>}
              <p>Created: {new Date(agent.created_at).toLocaleDateString()}</p>
              <p>Updated: {new Date(agent.updated_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
