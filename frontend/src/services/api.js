import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let accessToken = null;
let refreshRequest = null;
const authFailureListeners = new Set();

function notifyAuthFailure() {
  authFailureListeners.forEach((listener) => listener());
}

// Credential endpoints that must NOT carry the access token: registration and
// login take credentials in the body, while refresh and logout rely on the
// httpOnly refresh-token cookie. Other /auth routes (e.g. /auth/me) are
// token-protected and must receive the Authorization header like /api routes.
const TOKEN_FREE_AUTH_PATHS = ['/auth/register', '/auth/login', '/auth/refresh', '/auth/logout'];

function isAuthPath(url = '') {
  return TOKEN_FREE_AUTH_PATHS.some((path) => url.startsWith(path));
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

export function subscribeToAuthFailures(listener) {
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

async function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = api
      .post('/auth/refresh', null, { _skipAuthFailureNotification: true })
      .then((response) => {
        setAccessToken(response.data.access_token);
        return response.data.access_token;
      })
      .catch((error) => {
        clearAccessToken();
        notifyAuthFailure();
        throw error;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
}

api.interceptors.request.use((config) => {
  const nextConfig = { ...config, headers: config.headers || {} };
  if (accessToken && !nextConfig.headers.Authorization && !isAuthPath(nextConfig.url || '')) {
    nextConfig.headers.Authorization = `Bearer ${accessToken}`;
  }
  return nextConfig;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorCode = error.response?.data?.error;

    if (!originalRequest || error.response?.status !== 401) {
      throw error;
    }

    if (originalRequest.url === '/auth/refresh') {
      clearAccessToken();
      notifyAuthFailure();
      throw error;
    }

    if (errorCode === 'token_expired' && !originalRequest._retry && !isAuthPath(originalRequest.url || '')) {
      originalRequest._retry = true;
      const refreshedToken = await refreshAccessToken();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${refreshedToken}`;
      return api(originalRequest);
    }

    if (!originalRequest._skipAuthFailureNotification && !isAuthPath(originalRequest.url || '')) {
      clearAccessToken();
      notifyAuthFailure();
    }

    throw error;
  },
);

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  refresh: () => api.post('/auth/refresh'),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// ── Admin (user & role management) ──────────────────────────────────────────────
export const adminApi = {
  listUsers: () => api.get('/api/admin/users'),
  createUser: (data) => api.post('/api/admin/users', data),
  updateUser: (id, data) => api.patch(`/api/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/api/admin/users/${id}`),
};

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

// ── Health ────────────────────────────────────────────────────────────────────
export const healthApi = {
  check: () => api.get('/api/health'),
};

export default api;
