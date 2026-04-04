import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Tag, Bot, Star, TrendingUp, Clock } from 'lucide-react';
import { promptsApi, tagsApi, agentsApi } from '../services/api';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [prompts, setPrompts] = useState([]);
  const [tags, setTags] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      promptsApi.list({ limit: 200 }),
      tagsApi.list(),
      agentsApi.list(),
    ])
      .then(([p, t, a]) => {
        setPrompts(p.data);
        setTags(t.data);
        setAgents(a.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalUsage = prompts.reduce((s, p) => s + (p.usage_count || 0), 0);
  const avgRating =
    prompts.length > 0
      ? (prompts.reduce((s, p) => s + (p.avg_rating || 0), 0) / prompts.length).toFixed(1)
      : '0.0';
  const recentPrompts = [...prompts].slice(0, 5);

  if (loading) {
    return <div className="text-gray-400">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Dashboard</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total Prompts" value={prompts.length} color="bg-blue-600" />
        <StatCard icon={Tag} label="Tags" value={tags.length} color="bg-purple-600" />
        <StatCard icon={Bot} label="Agents" value={agents.length} color="bg-green-600" />
        <StatCard icon={TrendingUp} label="Total Executions" value={totalUsage} color="bg-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Prompts */}
        <div className="bg-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Clock size={16} /> Recent Prompts
            </h3>
            <Link to="/prompts" className="text-blue-400 text-sm hover:text-blue-300">
              View all
            </Link>
          </div>
          {recentPrompts.length === 0 ? (
            <p className="text-gray-400 text-sm">No prompts yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentPrompts.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/prompts/${p.id}`}
                    className="flex items-center justify-between hover:bg-gray-700 px-3 py-2 rounded-lg transition-colors"
                  >
                    <span className="text-sm text-gray-200 truncate">{p.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{p.version}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Avg Rating */}
        <div className="bg-gray-800 rounded-xl p-5">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
            <Star size={16} className="text-yellow-400" /> Quality Overview
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Avg Rating</span>
              <span className="text-white font-medium">{avgRating} / 5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Active Agents</span>
              <span className="text-white font-medium">
                {agents.filter((a) => a.status === 'active').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Total Executions</span>
              <span className="text-white font-medium">{totalUsage}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
