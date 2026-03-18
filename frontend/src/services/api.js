import axios from 'axios';

function resolveApiBaseURL() {
  const raw = (process.env.REACT_APP_API_URL || '').trim();
  if (!raw) return '';

  // Accept values like http://localhost:8000 or http://localhost:8000/api.
  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
}

const api = axios.create({
  baseURL: resolveApiBaseURL(),
  headers: { 'Content-Type': 'application/json' },
});

// ── Prompts ───────────────────────────────────────────────────────────────────
export const promptsApi = {
  list: (params) => api.get('/api/prompts/', { params }),
  get: (id) => api.get(`/api/prompts/${id}`),
  create: (data) => api.post('/api/prompts/', data),
  update: (id, data) => api.put(`/api/prompts/${id}`, data),
  delete: (id) => api.delete(`/api/prompts/${id}`),
  createVersion: (id, data) => api.post(`/api/prompts/${id}/versions`, data),
  getVersions: (id) => api.get(`/api/prompts/${id}/versions`),
  render: (id, variables) => api.post(`/api/prompts/${id}/render`, { variables }),
  createExecution: (id, data) => api.post(`/api/prompts/${id}/executions`, data),
  getExecutions: (id) => api.get(`/api/prompts/${id}/executions`),
  addMetric: (id, data) => api.post(`/api/prompts/${id}/metrics`, data),
  getMetrics: (id) => api.get(`/api/prompts/${id}/metrics`),
};

// ── Tags ──────────────────────────────────────────────────────────────────────
export const tagsApi = {
  list: () => api.get('/api/tags/'),
  create: (data) => api.post('/api/tags/', data),
  delete: (id) => api.delete(`/api/tags/${id}`),
};

// ── Agents ────────────────────────────────────────────────────────────────────
export const agentsApi = {
  list: () => api.get('/api/agents/'),
  get: (id) => api.get(`/api/agents/${id}`),
  create: (data) => api.post('/api/agents/', data),
  update: (id, data) => api.put(`/api/agents/${id}`, data),
  delete: (id) => api.delete(`/api/agents/${id}`),
};

export default api;
