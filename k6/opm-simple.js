// OPM DX1 — k6 Production Load & API Contract Test
//
// This script performs a full-stack load and contract test of the Open Prompt Manager (OPM) API and dashboard.
//
// Key features:
//   • End-to-end coverage: home page, static assets, health, dashboard, prompt list, prompt detail, and prompt render endpoints
//   • Realistic data: random prompt IDs and variable payloads, matching real-world usage
//   • Robust contract validation: checks for HTTP 200, valid JSON, required fields, and error-free responses
//   • Native random helpers: avoids k6/data v2.0.0-rc1 regression by using pure JS random functions
//   • Safe JSON parsing: never throws on null/invalid responses
//   • Per-endpoint tags: enables granular latency/error SLOs in Grafana/k6 Cloud
//   • Scenario-based: includes both baseline soak and stress ramp for capacity testing
//   • Strict thresholds: 16 global and per-endpoint latency/error budgets
//   • Compatible with k6 v2.0.0-rc1 and later
//
// Last updated: 2026-04-29

import { group, sleep, check } from "k6";
import http from "k6/http";

// ---------------------------------------------------------------------------
// Native random helpers (replaces k6/data which has a v2.0.0-rc1 regression)
// ---------------------------------------------------------------------------

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Test data pools
// ---------------------------------------------------------------------------

const PROMPT_IDS = [4, 7, 8, 13, 16];

const PROMPT_VARIABLES = {
  4:  [],
  7:  [],
  8:  [],
  13: [],
  16: ["AGENT_NAME", "ROLE", "DOMAIN", "SYSTEM", "OWNER", "PRIMARY_FUNCTION"],
};

const AGENT_NAMES = [
  "SRE Advisor", "Incident Commander", "Code Reviewer", "Release Manager",
  "Security Auditor", "Cost Optimiser", "Architecture Advisor", "Observability Coach",
];

const ROLES = [
  "Platform Engineer", "Site Reliability Engineer", "DevOps Lead",
  "Engineering Manager", "Staff Engineer", "Principal Architect",
];

const DOMAINS = [
  "observability", "cloud-infrastructure", "security",
  "performance-engineering", "developer-experience", "data-platform",
];

const SYSTEMS = [
  "Dynatrace", "Grafana Cloud", "Datadog", "AWS",
  "GCP", "Azure", "Kubernetes", "Terraform",
];

const OWNERS = [
  "platform-team", "sre-guild", "security-chapter", "dx-enablement", "cloud-ops",
];

const PRIMARY_FUNCTIONS = [
  "incident triage and escalation", "cost anomaly detection",
  "release readiness review",       "security posture assessment",
  "service dependency mapping",     "on-call runbook generation",
];

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    baseline: {
      executor: "ramping-vus",
      stages: [
        { target: 5,  duration: "30s" },
        { target: 5,  duration: "1m"  },
        { target: 0,  duration: "30s" },
      ],
      tags: { scenario: "baseline" },
    },
    stress: {
      executor:  "ramping-vus",
      startTime: "2m30s",
      stages: [
        { target: 5,  duration: "30s" },
        { target: 10, duration: "1m"  },
        { target: 20, duration: "1m"  },
        { target: 30, duration: "1m"  },
        { target: 0,  duration: "30s" },
      ],
      tags: { scenario: "stress" },
    },
  },

  thresholds: {
    // Global
    http_req_duration: ["p(95)<500",  "p(99)<1500"],
    http_req_failed:   ["rate<0.01"],
    // Static assets — CDN-served, tight budget
    "http_req_duration{endpoint:static_css}":      ["p(95)<200"],
    "http_req_duration{endpoint:static_js}":       ["p(95)<200"],
    "http_req_duration{endpoint:favicon}":         ["p(95)<200"],
    // API read endpoints
    "http_req_duration{endpoint:health}":          ["p(95)<200"],
    "http_req_duration{endpoint:prompts_list}":    ["p(95)<500"],
    "http_req_duration{endpoint:tags_list}":       ["p(95)<500"],
    "http_req_duration{endpoint:agents_list}":     ["p(95)<500"],
    "http_req_duration{endpoint:prompt_detail}":   ["p(95)<500"],
    "http_req_duration{endpoint:prompt_versions}": ["p(95)<500"],
    // Render — compute-heavy, wider allowance
    "http_req_duration{endpoint:prompt_render}":   ["p(95)<1500", "p(99)<3000"],
    // Per-endpoint error budgets
    "http_req_failed{endpoint:health}":            ["rate<0.001"],
    "http_req_failed{endpoint:static_css}":        ["rate<0.001"],
    "http_req_failed{endpoint:static_js}":         ["rate<0.001"],
    "http_req_failed{endpoint:prompt_render}":     ["rate<0.02"],
  },

  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = "https://opm-dx1.com";

function tag(endpoint) {
  return { tags: { endpoint } };
}

function jsonHeaders(referer) {
  return {
    headers: {
      accept:  "application/json, text/plain, */*",
      referer: `${BASE}/${referer}`,
    },
  };
}

// Null-safe JSON field access — won't throw on non-JSON or null response
function safeJson(resp, field) {
  if (!resp || !resp.body) return null;
  try {
    const obj = resp.json();
    return field !== undefined ? (obj ? obj[field] : null) : obj;
  } catch (_) {
    return null;
  }
}

// Always wraps in { variables: {} } — FastAPI Pydantic requires the key
// even when no template substitutions are needed (prompts 4, 7, 8, 13).
// Bare {} caused 422 Unprocessable Entity.
function buildRenderPayload(promptId) {
  const required = PROMPT_VARIABLES[promptId] || [];

  if (required.length === 0) {
    return JSON.stringify({ variables: {} });
  }

  const vars = {};
  required.forEach((v) => {
    switch (v) {
      case "AGENT_NAME":       vars[v] = randomItem(AGENT_NAMES);       break;
      case "ROLE":             vars[v] = randomItem(ROLES);             break;
      case "DOMAIN":           vars[v] = randomItem(DOMAINS);           break;
      case "SYSTEM":           vars[v] = randomItem(SYSTEMS);           break;
      case "OWNER":            vars[v] = randomItem(OWNERS);            break;
      case "PRIMARY_FUNCTION": vars[v] = randomItem(PRIMARY_FUNCTIONS); break;
      default:                 vars[v] = "test";
    }
  });

  return JSON.stringify({ variables: vars });
}

// ---------------------------------------------------------------------------
// Default function
// ---------------------------------------------------------------------------

export default function () {
  const promptId = randomItem(PROMPT_IDS);

  // 1. Home
  group("home", function () {
    const r = http.get(`${BASE}/`, {
      headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      ...tag("home"),
    });
    check(r, { "home: 200": (r) => r !== null && r.status === 200 });
  });

  // 2. Static assets (CSS, JS bundle, favicon)
  group("static_assets", function () {
    const css = http.get(`${BASE}/assets/index-DvAy51kB.css`, {
      headers: { origin: BASE, accept: "text/css,*/*;q=0.1", referer: `${BASE}/` },
      ...tag("static_css"),
    });
    const js = http.get(`${BASE}/assets/index-CNt3WxZD.js`, {
      headers: { origin: BASE, accept: "*/*", referer: `${BASE}/` },
      ...tag("static_js"),
    });
    const favicon = http.get(`${BASE}/favicon.ico`, {
      headers: { accept: "image/*,*/*;q=0.8", referer: `${BASE}/` },
      ...tag("favicon"),
    });
    check(css,    { "css: 200":     (r) => r !== null && r.status === 200 });
    check(js,     { "js: 200":      (r) => r !== null && r.status === 200 });
    check(favicon,{ "favicon: 200": (r) => r !== null && r.status === 200 });
  });

  // 3. Health
  group("health", function () {
    const r = http.get(`${BASE}/api/health`, {
      ...jsonHeaders(""),
      ...tag("health"),
    });
    check(r, {
      "health: 200":    (r) => r !== null && r.status === 200,
      "health: body ok":(r) => safeJson(r, "status") !== null,
    });
  });

  // 4. Dashboard bootstrap
  group("dashboard_bootstrap", function () {
    const prompts = http.get(`${BASE}/api/prompts/?limit=200`, { ...jsonHeaders("dashboard"), ...tag("prompts_list") });
    const tags    = http.get(`${BASE}/api/tags/`,              { ...jsonHeaders("dashboard"), ...tag("tags_list")    });
    const agents  = http.get(`${BASE}/api/agents/`,            { ...jsonHeaders("dashboard"), ...tag("agents_list")  });
    const health  = http.get(`${BASE}/api/health`,             { ...jsonHeaders("dashboard"), ...tag("health")       });
    check(prompts, { "dashboard/prompts: 200": (r) => r !== null && r.status === 200 });
    check(tags,    { "dashboard/tags: 200":    (r) => r !== null && r.status === 200 });
    check(agents,  { "dashboard/agents: 200":  (r) => r !== null && r.status === 200 });
    check(health,  { "dashboard/health: 200":  (r) => r !== null && r.status === 200 });
  });

  sleep(randomIntBetween(1, 3));

  // 5. Prompt list
  group("prompt_list", function () {
    const tags    = http.get(`${BASE}/api/tags/`,    { ...jsonHeaders("prompts"), ...tag("tags_list")    });
    const agents  = http.get(`${BASE}/api/agents/`,  { ...jsonHeaders("prompts"), ...tag("agents_list")  });
    const prompts = http.get(`${BASE}/api/prompts/`, { ...jsonHeaders("prompts"), ...tag("prompts_list") });
    check(tags,    { "prompts/tags: 200":    (r) => r !== null && r.status === 200 });
    check(agents,  { "prompts/agents: 200":  (r) => r !== null && r.status === 200 });
    check(prompts, { "prompts/list: 200":    (r) => r !== null && r.status === 200 });
  });

  sleep(randomIntBetween(1, 4));

  // 6. Prompt detail + version history
  group("prompt_detail", function () {
    const detail   = http.get(`${BASE}/api/prompts/${promptId}`,
      { ...jsonHeaders(`prompts/${promptId}`), ...tag("prompt_detail")   });
    const versions = http.get(`${BASE}/api/prompts/${promptId}/versions`,
      { ...jsonHeaders(`prompts/${promptId}`), ...tag("prompt_versions") });
    check(detail,   { "detail: 200":   (r) => r !== null && r.status === 200 });
    check(versions, { "versions: 200": (r) => r !== null && r.status === 200 });
  });

  sleep(randomIntBetween(1, 3));

  // 7. Render — fixed payload, safe checks
  group("prompt_render", function () {
    const payload = buildRenderPayload(promptId);
    const r = http.post(
      `${BASE}/api/prompts/${promptId}/render`,
      payload,
      {
        headers: {
          accept:         "application/json, text/plain, */*",
          "content-type": "application/json",
          origin:         BASE,
          referer:        `${BASE}/prompts/${promptId}`,
        },
        ...tag("prompt_render"),
      },
    );
    check(r, {
      "render: 200":         (r) => r !== null && r.status === 200,
      "render: has body":    (r) => r !== null && r.body && r.body.length > 0,
      "render: no error field": (r) => { if (!r||!r.body) return false; try { const o=r.json(); return o && o.error === undefined; } catch(_){ return false; } },
      "render: has content": (r) => safeJson(r, "rendered_content") !== null,
    });
    if (r && r.status !== 200) {
      console.error(`render FAIL promptId=${promptId} status=${r.status} body=${r.body ? r.body.substring(0, 200) : "null"}`);
    }
  });

  sleep(randomIntBetween(1, 5));
}