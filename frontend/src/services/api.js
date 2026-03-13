import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});

// ── Prompts ───────────────────────────────────────────────────────────────────
export const promptsApi = {
  list: (params) => api.get('/prompts/', { params }),
  get: (id) => api.get(`/prompts/${id}`),
  create: (data) => api.post('/prompts/', data),
  update: (id, data) => api.put(`/prompts/${id}`, data),
  delete: (id) => api.delete(`/prompts/${id}`),
  createVersion: (id, data) => api.post(`/prompts/${id}/versions`, data),
  getVersions: (id) => api.get(`/prompts/${id}/versions`),
  render: (id, variables) => api.post(`/prompts/${id}/render`, { variables }),
  createExecution: (id, data) => api.post(`/prompts/${id}/executions`, data),
  getExecutions: (id) => api.get(`/prompts/${id}/executions`),
  addMetric: (id, data) => api.post(`/prompts/${id}/metrics`, data),
  getMetrics: (id) => api.get(`/prompts/${id}/metrics`),
};

// ── Tags ──────────────────────────────────────────────────────────────────────
export const tagsApi = {
  list: () => api.get('/tags/'),
  create: (data) => api.post('/tags/', data),
  delete: (id) => api.delete(`/tags/${id}`),
};

// ── Agents ────────────────────────────────────────────────────────────────────
export const agentsApi = {
  list: () => api.get('/agents/'),
  get: (id) => api.get(`/agents/${id}`),
  create: (data) => api.post('/agents/', data),
  update: (id, data) => api.put(`/agents/${id}`, data),
  delete: (id) => api.delete(`/agents/${id}`),
};

export default api;
