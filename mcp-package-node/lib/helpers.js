/**
 * HTTP helper functions for Open Prompt Manager MCP server.
 * Configuration is read from environment variables at call time.
 */

export function buildHeaders(apiKey = "") {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  if (apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  return h;
}

function getBackendUrl() {
  return (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/+$/, "");
}

function getApiKey() {
  return process.env.API_KEY ?? "";
}

export async function apiGet(path, params) {
  let url = `${getBackendUrl()}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  try {
    const res = await fetch(url, { headers: buildHeaders(getApiKey()) });
    if (!res.ok) return { error: `HTTP ${res.status}: ${await res.text()}` };
    return res.json();
  } catch (err) {
    return { error: String(err) };
  }
}

export async function apiPost(path, payload) {
  try {
    const res = await fetch(`${getBackendUrl()}${path}`, {
      method: "POST",
      headers: buildHeaders(getApiKey()),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { error: `HTTP ${res.status}: ${await res.text()}` };
    return res.json();
  } catch (err) {
    return { error: String(err) };
  }
}

export async function apiPut(path, payload) {
  try {
    const res = await fetch(`${getBackendUrl()}${path}`, {
      method: "PUT",
      headers: buildHeaders(getApiKey()),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { error: `HTTP ${res.status}: ${await res.text()}` };
    return res.json();
  } catch (err) {
    return { error: String(err) };
  }
}

export async function apiDelete(path) {
  try {
    const res = await fetch(`${getBackendUrl()}${path}`, {
      method: "DELETE",
      headers: buildHeaders(getApiKey()),
    });
    if (res.status === 204) return { success: true };
    if (!res.ok) return { error: `HTTP ${res.status}: ${await res.text()}` };
    return res.json();
  } catch (err) {
    return { error: String(err) };
  }
}
