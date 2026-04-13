import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Edit, Trash2, Copy, Play, Star, Activity, Clock, GitBranch, ArrowLeftRight, X, Puzzle
} from 'lucide-react';
import { promptsApi } from '../services/api';

// Compute a line-level unified diff between two text strings.
// Returns an array of { type: 'unchanged'|'removed'|'added', text: string }.
function computeLineDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const m = oldLines.length;
  const n = newLines.length;
  // LCS DP table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  // Backtrack to build diff
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', text: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

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
  const [diffTarget, setDiffTarget] = useState(null);   // { prompt, diff[] }
  const [diffLoading, setDiffLoading] = useState(false);
  const [componentPrompts, setComponentPrompts] = useState([]);

  const handleCompare = async (otherId) => {
    setDiffLoading(true);
    try {
      const res = await promptsApi.get(otherId);
      const other = res.data;
      const diff = computeLineDiff(other.content, prompt.content);
      setDiffTarget({ prompt: other, diff });
    } catch (err) {
      console.error(err);
    } finally {
      setDiffLoading(false);
    }
  };

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

  useEffect(() => {
    if (!prompt) return;
    // Clear stale component data immediately so the UI never shows components
    // from a previously viewed prompt while the new fetch is in flight.
    setComponentPrompts([]);
    const ids = [
      ...new Set(
        [...prompt.content.matchAll(/\{\{component:(\d+)\}\}/g)].map((m) => parseInt(m[1], 10))
      ),
    ];
    if (ids.length === 0) return;
    Promise.all(ids.map((cid) => promptsApi.get(cid)))
      .then((results) => {
        const comps = results.map((r) => r.data);
        setComponentPrompts(comps);
        // Merge component variables' defaults into variables state without
        // overwriting values the user may have already typed for the parent prompt.
        setVariables((prev) => {
          const next = { ...prev };
          comps.forEach((comp) => {
            (comp.variables || []).forEach((v) => {
              if (!(v.name in next)) {
                next[v.name] = v.default !== null && v.default !== undefined ? String(v.default) : '';
              }
            });
          });
          return next;
        });
      })
      .catch((err) => {
        // On error, ensure stale components are not left in state.
        setComponentPrompts([]);
        console.error(err);
      });
  }, [prompt?.id, prompt?.content]);

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

  // Merge parent variables with variables from all component prompts (deduplicated by name).
  // All of these are required by the backend renderer when {{component:id}} refs are present.
  // Must be declared before the early return to satisfy Rules of Hooks.
  const allVariables = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const v of (prompt?.variables || [])) {
      if (!seen.has(v.name)) { seen.add(v.name); result.push(v); }
    }
    for (const comp of componentPrompts) {
      for (const v of (comp.variables || [])) {
        if (!seen.has(v.name)) { seen.add(v.name); result.push({ ...v, _fromComponent: comp.name }); }
      }
    }
    return result;
  }, [prompt?.variables, componentPrompts]);

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
            {allVariables.length > 0 ? (
              <div className="space-y-3 mb-4">
                {allVariables.map((v) => (
                  <div key={v.name}>
                    <label htmlFor={`var-${v.name}`} className="block text-xs text-gray-400 mb-1">
                      {v.name}
                      {v.required && <span className="text-red-400 ml-1">*</span>}
                      {v.description && <span className="text-gray-500 ml-2">— {v.description}</span>}
                      {v._fromComponent && (
                        <span className="text-purple-400 ml-2">from: {v._fromComponent}</span>
                      )}
                    </label>
                    <input
                      id={`var-${v.name}`}
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
                  <li key={v.id} className="flex items-center gap-1">
                    <Link
                      to={`/prompts/${v.id}`}
                      className={`flex-1 flex justify-between items-start gap-2 text-sm px-2 py-1.5 rounded-lg transition-colors ${
                        v.id === parseInt(id, 10)
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <span className="min-w-0 whitespace-normal break-words leading-snug">{v.name}</span>
                      <span className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {v.is_latest && (
                          <span
                            className="text-xs bg-green-700 text-green-100 px-1.5 py-0.5 rounded-full font-medium"
                            aria-label="Latest version"
                          >
                            Latest
                          </span>
                        )}
                        <span className="text-xs">v{v.version}</span>
                      </span>
                    </Link>
                    {v.id !== parseInt(id, 10) && (
                      <button
                        onClick={() => handleCompare(v.id)}
                        disabled={diffLoading}
                        title={`Compare v${v.version} → v${prompt.version}`}
                        className="flex-shrink-0 text-gray-400 hover:text-blue-300 disabled:opacity-40 p-1 rounded transition-colors"
                      >
                        <ArrowLeftRight size={13} />
                      </button>
                    )}
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

          {/* Components */}
          {componentPrompts.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Puzzle size={14} className="text-purple-400" /> Components
              </h3>
              <ul className="space-y-1">
                {componentPrompts.map((comp) => (
                  <li key={comp.id}>
                    <Link
                      to={`/prompts/${comp.id}`}
                      className="flex items-center justify-between gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <span className="truncate">{comp.name}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">v{comp.version}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Variables */}
          {allVariables.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Variables</h3>
              <ul className="space-y-2">
                {allVariables.map((v) => (
                  <li key={v.name} className="text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-blue-300">{`{{${v.name}}}`}</code>
                      <span className="text-xs text-gray-500">{v.type}</span>
                      {v.required && <span className="text-xs text-red-400">required</span>}
                      {v._fromComponent && (
                        <span className="text-xs text-purple-400">from: {v._fromComponent}</span>
                      )}
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

      {/* Diff modal */}
      {diffTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-auto">
          <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-4xl shadow-2xl mt-8 mb-8">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <ArrowLeftRight size={16} className="text-blue-400" />
                <span className="text-white font-semibold">
                  Diff: v{diffTarget.prompt.version}
                  <span className="text-gray-400 mx-2">→</span>
                  v{prompt.version}
                </span>
                <span className="text-xs text-gray-500 ml-1">
                  ({diffTarget.diff.filter(l => l.type !== 'unchanged').length} change(s))
                </span>
              </div>
              <button
                onClick={() => setDiffTarget(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 px-5 py-2 bg-gray-800 border-b border-gray-700 text-xs">
              <span className="flex items-center gap-1.5 text-red-400"><span className="w-3 h-3 rounded-sm bg-red-900 inline-block" /> Removed from v{diffTarget.prompt.version}</span>
              <span className="flex items-center gap-1.5 text-green-400"><span className="w-3 h-3 rounded-sm bg-green-900 inline-block" /> Added in v{prompt.version}</span>
              <span className="flex items-center gap-1.5 text-gray-400"><span className="w-3 h-3 rounded-sm bg-gray-700 inline-block" /> Unchanged</span>
            </div>

            {/* Diff content */}
            <div className="p-5 overflow-x-auto">
              {diffTarget.diff.every(l => l.type === 'unchanged') ? (
                <p className="text-gray-400 text-sm italic text-center py-6">No differences found between these versions.</p>
              ) : (
                <pre className="text-sm font-mono leading-relaxed">
                  {diffTarget.diff.map((line, idx) => (
                    <div
                      key={idx}
                      className={
                        line.type === 'removed'
                          ? 'bg-red-950 text-red-300'
                          : line.type === 'added'
                          ? 'bg-green-950 text-green-300'
                          : 'text-gray-400'
                      }
                    >
                      <span className={`select-none mr-2 w-4 inline-block text-center ${
                        line.type === 'removed' ? 'text-red-500' :
                        line.type === 'added' ? 'text-green-500' : 'text-gray-600'
                      }`}>
                        {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
                      </span>
                      {line.text || '\u00a0'}
                    </div>
                  ))}
                </pre>
              )}
            </div>

            {/* Audit footer */}
            <div className="px-5 py-3 border-t border-gray-700 bg-gray-800 rounded-b-xl text-xs text-gray-500 flex justify-between">
              <span>Audit comparison — {diffTarget.prompt.name} v{diffTarget.prompt.version} → v{prompt.version}</span>
              <span>Generated: {new Date().toISOString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
