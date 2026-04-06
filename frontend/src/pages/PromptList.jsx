import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Star, Activity, Trash2, Edit } from 'lucide-react';
import { promptsApi, tagsApi, agentsApi } from '../services/api';

export default function PromptList() {
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState([]);
  const [tags, setTags] = useState([]);
  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPrompts = () => {
    const params = {};
    if (search) params.search = search;
    if (tagFilter) params.tag_id = tagFilter;
    if (agentFilter) params.agent_id = agentFilter;
    promptsApi.list(params).then((r) => setPrompts(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    tagsApi.list().then((r) => setTags(r.data)).catch(console.error);
    agentsApi.list().then((r) => setAgents(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    fetchPrompts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tagFilter, agentFilter]);

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Delete this prompt?')) return;
    await promptsApi.delete(id);
    fetchPrompts();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Prompts</h2>
        <Link
          to="/prompts/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Prompt
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 text-white pl-9 pr-3 py-2 rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm border border-gray-700 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-4">No prompts found.</p>
          <Link to="/prompts/new" className="text-blue-400 hover:text-blue-300">
            Create your first prompt
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {prompts.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/prompts/${p.id}`)}
              className="bg-gray-800 rounded-xl p-5 cursor-pointer hover:bg-gray-750 hover:ring-1 hover:ring-blue-500 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-white truncate pr-2">{p.name}</h3>
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded flex-shrink-0">
                  v{p.version}
                </span>
              </div>
              {p.description && (
                <p className="text-sm text-gray-400 line-clamp-2 mb-3">{p.description}</p>
              )}

              {/* Tags */}
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {p.tags.map((t) => (
                    <span
                      key={t.id}
                      className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: t.color }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Star size={12} className="text-yellow-400" />
                    {p.avg_rating.toFixed(1)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Activity size={12} />
                    {p.usage_count}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/prompts/${p.id}/edit`); }}
                    className="p-1 hover:text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(p.id, e)}
                    className="p-1 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
