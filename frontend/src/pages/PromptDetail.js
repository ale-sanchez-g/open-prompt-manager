import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Edit, Trash2, Copy, Play, Star, Activity, Clock, GitBranch
} from 'lucide-react';
import { promptsApi } from '../services/api';

function MetricBadge({ label, value }) {
  return (
    <div className="bg-gray-700 rounded-lg px-4 py-3 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}

export default function PromptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(null);
  const [versions, setVersions] = useState([]);
  const [variables, setVariables] = useState({});
  const [rendered, setRendered] = useState('');
  const [renderError, setRenderError] = useState('');
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    promptsApi.get(id).then((r) => {
      setPrompt(r.data);
      // Init variable inputs with defaults
      const defaults = {};
      (r.data.variables || []).forEach((v) => {
        defaults[v.name] = v.default !== null && v.default !== undefined ? v.default : '';
      });
      setVariables(defaults);
    }).catch(console.error);

    promptsApi.getVersions(id).then((r) => setVersions(r.data)).catch(console.error);
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this prompt?')) return;
    await promptsApi.delete(id);
    navigate('/prompts');
  };

  const handleRender = async () => {
    setRendering(true);
    setRenderError('');
    try {
      const res = await promptsApi.render(id, variables);
      setRendered(res.data.rendered_content);
    } catch (err) {
      setRenderError(err.response?.data?.detail || 'Render failed');
    } finally {
      setRendering(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!prompt) return <div className="text-gray-400">Loading...</div>;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate('/prompts')}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-2"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h2 className="text-2xl font-bold text-white">{prompt.name}</h2>
          <p className="text-gray-400 text-sm mt-1">v{prompt.version}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy} className="flex items-center gap-1 text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg transition-colors">
            <Copy size={14} /> {copied ? 'Copied!' : 'Copy'}
          </button>
          <Link to={`/prompts/${id}/edit`} className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors">
            <Edit size={14} /> Edit
          </Link>
          <button onClick={handleDelete} className="flex items-center gap-1 text-sm bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition-colors">
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {prompt.description && (
            <p className="text-gray-300">{prompt.description}</p>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <MetricBadge label="Avg Rating" value={
              <span className="flex items-center justify-center gap-1">
                <Star size={14} className="text-yellow-400" />
                {prompt.avg_rating.toFixed(1)}
              </span>
            } />
            <MetricBadge label="Executions" value={
              <span className="flex items-center justify-center gap-1">
                <Activity size={14} className="text-blue-400" />
                {prompt.usage_count}
              </span>
            } />
            <MetricBadge label="Success Rate" value={`${(prompt.success_rate * 100).toFixed(0)}%`} />
          </div>

          {/* Content */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Content</h3>
            <pre className="bg-gray-800 text-gray-200 text-sm p-4 rounded-xl overflow-x-auto whitespace-pre-wrap border border-gray-700">
              {prompt.content}
            </pre>
          </div>

          {/* Variables & Tags */}
          {prompt.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {prompt.tags.map((t) => (
                  <span key={t.id} className="text-xs px-3 py-1 rounded-full text-white" style={{ backgroundColor: t.color }}>
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Test interface */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Play size={14} /> Test Rendering
            </h3>
            {(prompt.variables || []).length > 0 ? (
              <div className="space-y-3 mb-4">
                {prompt.variables.map((v) => (
                  <div key={v.name}>
                    <label className="block text-xs text-gray-400 mb-1">
                      {v.name}
                      {v.required && <span className="text-red-400 ml-1">*</span>}
                      {v.description && <span className="text-gray-500 ml-2">— {v.description}</span>}
                    </label>
                    <input
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
                      value={variables[v.name] || ''}
                      onChange={(e) => setVariables({ ...variables, [v.name]: e.target.value })}
                      placeholder={v.default !== undefined ? String(v.default) : ''}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm mb-4">No variables defined.</p>
            )}
            <button
              onClick={handleRender}
              disabled={rendering}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Play size={14} /> {rendering ? 'Rendering...' : 'Render'}
            </button>
            {renderError && (
              <div className="mt-3 text-red-400 text-sm bg-red-900/30 px-3 py-2 rounded-lg">{renderError}</div>
            )}
            {rendered && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-1">Rendered output:</p>
                <pre className="bg-gray-900 text-green-300 text-sm p-3 rounded-lg whitespace-pre-wrap border border-gray-700">
                  {rendered}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Version history */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <GitBranch size={14} /> Version History
            </h3>
            {versions.length === 0 ? (
              <p className="text-gray-500 text-sm">No versions.</p>
            ) : (
              <ul className="space-y-1">
                {versions.map((v) => (
                  <li key={v.id}>
                    <Link
                      to={`/prompts/${v.id}`}
                      className={`flex justify-between text-sm px-2 py-1.5 rounded-lg transition-colors ${
                        v.id === parseInt(id, 10)
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <span className="truncate">{v.name}</span>
                      <span className="text-xs ml-2 flex-shrink-0">v{v.version}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Agents */}
          {prompt.agents.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Agents</h3>
              <ul className="space-y-1">
                {prompt.agents.map((a) => (
                  <li key={a.id} className="text-sm text-gray-300 flex items-center justify-between">
                    <span>{a.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.status === 'active' ? 'bg-green-900 text-green-300' :
                      a.status === 'inactive' ? 'bg-gray-700 text-gray-400' :
                      'bg-red-900 text-red-300'
                    }`}>{a.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Variables */}
          {(prompt.variables || []).length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Variables</h3>
              <ul className="space-y-2">
                {prompt.variables.map((v) => (
                  <li key={v.name} className="text-sm">
                    <div className="flex items-center gap-2">
                      <code className="text-blue-300">{`{{${v.name}}}`}</code>
                      <span className="text-xs text-gray-500">{v.type}</span>
                      {v.required && <span className="text-xs text-red-400">required</span>}
                    </div>
                    {v.description && <p className="text-xs text-gray-500 mt-0.5">{v.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Meta */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Clock size={14} /> Metadata
            </h3>
            <div className="space-y-1 text-xs text-gray-400">
              <p>ID: #{prompt.id}</p>
              {prompt.created_by && <p>By: {prompt.created_by}</p>}
              <p>Created: {new Date(prompt.created_at).toLocaleDateString()}</p>
              <p>Updated: {new Date(prompt.updated_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
