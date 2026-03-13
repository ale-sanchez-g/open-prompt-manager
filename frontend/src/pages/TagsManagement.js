import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { tagsApi } from '../services/api';

const PRESET_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16',
];

export default function TagsManagement() {
  const [tags, setTags] = useState([]);
  const [form, setForm] = useState({ name: '', color: '#3B82F6' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchTags = () => tagsApi.list().then((r) => setTags(r.data)).catch(console.error);

  useEffect(() => { fetchTags(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await tagsApi.create(form);
      setForm({ name: '', color: '#3B82F6' });
      fetchTags();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create tag');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this tag?')) return;
    await tagsApi.delete(id);
    fetchTags();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Tags</h2>

      {/* Create form */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Create Tag</h3>
        {error && (
          <div className="mb-3 text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{error}</div>
        )}
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input
              required
              className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-blue-500 w-40"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="w-10 h-9 rounded cursor-pointer bg-gray-700 border border-gray-600"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
              <div className="flex gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      form.color === c ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm({ ...form, color: c })}
                  />
                ))}
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} /> {saving ? 'Creating...' : 'Create'}
          </button>
        </form>
      </div>

      {/* Tag list */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          All Tags ({tags.length})
        </h3>
        {tags.length === 0 ? (
          <p className="text-gray-500 text-sm">No tags yet. Create your first tag above.</p>
        ) : (
          <div className="space-y-2">
            {tags.map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-gray-700 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-white font-medium">{t.name}</span>
                  <code className="text-xs text-gray-400">{t.color}</code>
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
