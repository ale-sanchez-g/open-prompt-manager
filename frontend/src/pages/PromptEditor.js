import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { promptsApi, tagsApi, agentsApi } from '../services/api';

const VAR_TYPES = ['string', 'number', 'boolean', 'array', 'object'];

function VarRow({ variable, onChange, onDelete, onInsert }) {
  return (
    <div className="flex flex-wrap gap-2 bg-gray-700 p-3 rounded-lg">
      <input
        className="bg-gray-600 text-white text-sm px-2 py-1 rounded w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="name"
        value={variable.name}
        onChange={(e) => onChange({ ...variable, name: e.target.value })}
      />
      <select
        className="bg-gray-600 text-white text-sm px-2 py-1 rounded focus:outline-none"
        value={variable.type}
        onChange={(e) => onChange({ ...variable, type: e.target.value })}
      >
        {VAR_TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
      <label className="flex items-center gap-1 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={variable.required}
          onChange={(e) => onChange({ ...variable, required: e.target.checked })}
        />
        Required
      </label>
      <input
        className="bg-gray-600 text-white text-sm px-2 py-1 rounded flex-1 min-w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="description"
        value={variable.description || ''}
        onChange={(e) => onChange({ ...variable, description: e.target.value })}
      />
      <button
        type="button"
        onClick={() => onInsert(variable.name)}
        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
        title="Insert into content"
      >
        Insert
      </button>
      <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-300">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export default function PromptEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: '',
    description: '',
    content: '',
    version: '1.0.0',
    created_by: '',
    variables: [],
    tag_ids: [],
    agent_ids: [],
  });
  const [tags, setTags] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showVersionModal, setShowVersionModal] = useState(false);
  const contentRef = React.useRef(null);

  const bumpPatchVersion = (version) => {
    const parts = version.split('.');
    if (parts.length === 3) {
      const patch = parseInt(parts[2], 10);
      if (!isNaN(patch)) return `${parts[0]}.${parts[1]}.${patch + 1}`;
    }
    return version;
  };

  useEffect(() => {
    tagsApi.list().then((r) => setTags(r.data)).catch(console.error);
    agentsApi.list().then((r) => setAgents(r.data)).catch(console.error);
    if (isEdit) {
      promptsApi.get(id)
        .then((r) => {
          const p = r.data;
          setForm({
            name: p.name,
            description: p.description || '',
            content: p.content,
            version: p.version,
            created_by: p.created_by || '',
            variables: p.variables || [],
            tag_ids: p.tags.map((t) => t.id),
            agent_ids: p.agents.map((a) => a.id),
          });
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [id, isEdit]);

  const handleVarChange = (idx, val) => {
    const vars = [...form.variables];
    vars[idx] = val;
    setForm({ ...form, variables: vars });
  };

  const handleAddVar = () => {
    setForm({
      ...form,
      variables: [...form.variables, { name: '', type: 'string', required: false, description: '' }],
    });
  };

  const handleDeleteVar = (idx) => {
    setForm({ ...form, variables: form.variables.filter((_, i) => i !== idx) });
  };

  const handleInsertVar = (varName) => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newContent = form.content.slice(0, start) + `{{${varName}}}` + form.content.slice(end);
    setForm({ ...form, content: newContent });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + varName.length + 4, start + varName.length + 4);
    }, 0);
  };

  const toggleId = (field, val) => {
    const arr = form[field];
    setForm({
      ...form,
      [field]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val],
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isEdit) {
      setShowVersionModal(true);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await promptsApi.create(form);
      navigate(`/prompts/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWithVersion = async (bumpVersion) => {
    setShowVersionModal(false);
    setSaving(true);
    setError('');
    try {
      if (bumpVersion) {
        const res = await promptsApi.createVersion(id, {
          content: form.content,
          description: form.description,
          variables: form.variables,
        });
        navigate(`/prompts/${res.data.id}`);
      } else {
        await promptsApi.update(id, form);
        navigate(`/prompts/${id}`);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div className="max-w-3xl space-y-6">
      {showVersionModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-xl border border-gray-700">
            <h3 className="text-white font-semibold text-lg mb-2">Update Version?</h3>
            <p className="text-gray-400 text-sm mb-5">
              Would you like to bump the version from{' '}
              <span className="text-white font-mono">{form.version}</span> to{' '}
              <span className="text-white font-mono">{bumpPatchVersion(form.version)}</span>?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleSaveWithVersion(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Yes, bump to {bumpPatchVersion(form.version)}
              </button>
              <button
                onClick={() => handleSaveWithVersion(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                No, keep version {form.version}
              </button>
              <button
                onClick={() => setShowVersionModal(false)}
                className="text-gray-400 hover:text-white text-sm py-1 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-400 hover:text-white text-sm"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <h2 className="text-2xl font-bold text-white">{isEdit ? 'Edit Prompt' : 'New Prompt'}</h2>

      {error && <div className="bg-red-900/40 border border-red-600 text-red-300 px-4 py-2 rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name *</label>
            <input
              required
              className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Version</label>
            <input
              className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Description</label>
          <input
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Content *</label>
          <textarea
            ref={contentRef}
            required
            rows={10}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-blue-500 font-mono"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="Use {{variable_name}} for variables and {{component:id}} for component references"
          />
        </div>

        {/* Variables */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">Variables</label>
            <button
              type="button"
              onClick={handleAddVar}
              className="flex items-center gap-1 text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
            >
              <Plus size={12} /> Add Variable
            </button>
          </div>
          <div className="space-y-2">
            {form.variables.map((v, idx) => (
              <VarRow
                key={idx}
                variable={v}
                onChange={(val) => handleVarChange(idx, val)}
                onDelete={() => handleDeleteVar(idx)}
                onInsert={handleInsertVar}
              />
            ))}
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Tags</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleId('tag_ids', t.id)}
                  className={`text-xs px-3 py-1 rounded-full border transition-all ${
                    form.tag_ids.includes(t.id)
                      ? 'text-white border-transparent'
                      : 'text-gray-400 border-gray-600 hover:border-gray-400'
                  }`}
                  style={form.tag_ids.includes(t.id) ? { backgroundColor: t.color, borderColor: t.color } : {}}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Agents */}
        {agents.length > 0 && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">Agents</label>
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleId('agent_ids', a.id)}
                  className={`text-xs px-3 py-1 rounded-full border transition-all ${
                    form.agent_ids.includes(a.id)
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'text-gray-400 border-gray-600 hover:border-gray-400'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Prompt'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
