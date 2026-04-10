import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { agentsApi } from '../services/api';

const STATUS_OPTIONS = ['active', 'inactive', 'deprecated'];

const statusStyle = {
  active: 'bg-green-900 text-green-300',
  inactive: 'bg-gray-700 text-gray-400',
  deprecated: 'bg-red-900 text-red-300',
};

const emptyForm = { name: '', description: '', type: '', status: 'active' };

export default function AgentsManagement() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchAgents = () => agentsApi.list().then((r) => setAgents(r.data)).catch(console.error);

  useEffect(() => { fetchAgents(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await agentsApi.update(editId, form);
        setEditId(null);
      } else {
        await agentsApi.create(form);
      }
      setForm(emptyForm);
      fetchAgents();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to register agent');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (agent) => {
    setEditId(agent.id);
    setForm({ name: agent.name, description: agent.description || '', type: agent.type || '', status: agent.status });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm(emptyForm);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this agent?')) return;
    await agentsApi.delete(id);
    fetchAgents();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Agents</h2>

      {/* Form */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          {editId ? 'Edit Agent' : 'Register Agent'}
        </h3>
        {error && (
          <div className="mb-3 text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
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
              {editId ? <><Check size={14} /> Save</> : <><Plus size={14} /> Register</>}
            </button>
            {editId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                <X size={14} /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Agent list */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          All Agents ({agents.length})
        </h3>
        {agents.length === 0 ? (
          <p className="text-gray-500 text-sm">No agents yet.</p>
        ) : (
          <div className="space-y-3">
            {agents.map((a) => (
              <div
                key={a.id}
                data-testid="agent-card"
                onClick={() => navigate(`/agents/${a.id}`)}
                className="bg-gray-700 rounded-xl p-4 flex items-start justify-between cursor-pointer hover:ring-1 hover:ring-blue-500 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-white">{a.name}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle[a.status] || statusStyle.inactive}`}>
                      {a.status}
                    </span>
                    {a.type && (
                      <span className="text-xs text-gray-400 bg-gray-600 px-2 py-0.5 rounded">{a.type}</span>
                    )}
                  </div>
                  {a.description && <p className="text-sm text-gray-400">{a.description}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    Created {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(a); }}
                    className="text-gray-400 hover:text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                    className="text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
