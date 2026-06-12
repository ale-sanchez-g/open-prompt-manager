// OPM CI Performance Test
//
// Validates API performance under sustained load in the CI docker-compose environment.
// Authenticates as a real user and exercises the full authenticated API surface.
//
// Duration: ~2 minutes (30s warmup + 60s sustained + 30s ramp-down)
// VUs:      up to 10
// Target:   BASE_URL env var (default: http://localhost)
//
// Usage:
//   k6 run k6/opm-ci.js
//   k6 run --env BASE_URL=http://localhost:8000 k6/opm-ci.js
//
// Last updated: 2026-06-12

import { group, sleep, check, fail } from 'k6';
import http from 'k6/http';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE = __ENV.BASE_URL || 'http://localhost';
const SETUP_USER_EMAIL = 'k6-ci-perf@opm-ci.io';
const SETUP_USER_PASSWORD = 'K6CiPerf@2026!';

export const options = {
  scenarios: {
    warmup: {
      executor: 'constant-vus',
      vus: 2,
      duration: '30s',
      tags: { scenario: 'warmup' },
    },
    sustained: {
      executor: 'ramping-vus',
      startTime: '30s',
      stages: [
        { target: 5,  duration: '20s' },
        { target: 10, duration: '40s' },
        { target: 5,  duration: '20s' },
        { target: 0,  duration: '10s' },
      ],
      tags: { scenario: 'sustained' },
    },
  },

  thresholds: {
    // Global latency budget
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    // Health — must be very fast (exempt from rate limiting)
    'http_req_duration{endpoint:health}': ['p(95)<200', 'p(99)<500'],
    // Authenticated list endpoint
    'http_req_duration{endpoint:prompts_list}': ['p(95)<1000'],
    // Render — compute-heavy, wider budget
    'http_req_duration{endpoint:prompt_render}': ['p(95)<2000'],
    // Health must never fail
    'http_req_failed{endpoint:health}': ['rate<0.01'],
    // Allow a small number of non-2xx from rate limiting (429) on auth-heavy paths
    'http_req_failed{endpoint:prompts_list}': ['rate<0.05'],
  },

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function safeJson(r, field) {
  if (!r || !r.body) return null;
  try {
    const obj = r.json();
    return field !== undefined ? (obj ? obj[field] : null) : obj;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Setup — runs once before all VUs start
// ---------------------------------------------------------------------------

export function setup() {
  // Register the CI test user (tolerate 409 conflict on re-runs)
  const regRes = http.post(
    `${BASE}/auth/register`,
    JSON.stringify({ email: SETUP_USER_EMAIL, password: SETUP_USER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (regRes.status !== 201 && regRes.status !== 409) {
    fail(`Setup: register failed with status ${regRes.status}: ${regRes.body}`);
  }

  // Login to obtain access token
  const loginRes = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: SETUP_USER_EMAIL, password: SETUP_USER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (loginRes.status !== 200) {
    fail(`Setup: login failed with status ${loginRes.status}: ${loginRes.body}`);
  }
  const accessToken = safeJson(loginRes, 'access_token');
  if (!accessToken) {
    fail('Setup: access_token missing from login response');
  }

  // Create a small pool of test prompts
  const promptIds = [];
  const authH = jsonHeaders(accessToken);
  for (let i = 1; i <= 3; i++) {
    const r = http.post(
      `${BASE}/api/prompts/`,
      JSON.stringify({
        name: `k6-ci-prompt-${i}-${Date.now()}`,
        content: `Performance test prompt {{topic}} — variant ${i}`,
        description: `k6 CI load test prompt ${i}`,
      }),
      { headers: authH },
    );
    if (r.status === 201) {
      const id = safeJson(r, 'id');
      if (id) promptIds.push(id);
    }
  }

  return { accessToken, promptIds };
}

// ---------------------------------------------------------------------------
// Default VU function
// ---------------------------------------------------------------------------

export default function (data) {
  const { accessToken, promptIds } = data;
  const authH = jsonHeaders(accessToken);

  // 1. Health check — always exempt from rate limiting
  group('health', function () {
    const r = http.get(`${BASE}/api/health`, { tags: { endpoint: 'health' } });
    check(r, {
      'health: 200':     (r) => r !== null && r.status === 200,
      'health: body ok': (r) => safeJson(r, 'status') === 'ok',
    });
  });

  // 2. Authenticated list endpoints (simulates dashboard bootstrap)
  group('dashboard_bootstrap', function () {
    const prompts = http.get(
      `${BASE}/api/prompts/?limit=20`,
      { headers: authH, tags: { endpoint: 'prompts_list' } },
    );
    const tags = http.get(
      `${BASE}/api/tags/`,
      { headers: authH, tags: { endpoint: 'tags_list' } },
    );
    check(prompts, { 'prompts: 200 or 429': (r) => r !== null && (r.status === 200 || r.status === 429) });
    check(tags,    { 'tags: 200 or 429':    (r) => r !== null && (r.status === 200 || r.status === 429) });
  });

  sleep(0.3);

  // 3. Prompt detail + render (only if setup created prompts)
  if (promptIds && promptIds.length > 0) {
    const promptId = promptIds[Math.floor(Math.random() * promptIds.length)];

    group('prompt_detail', function () {
      const r = http.get(
        `${BASE}/api/prompts/${promptId}`,
        { headers: authH, tags: { endpoint: 'prompt_detail' } },
      );
      check(r, { 'detail: 200 or 429': (r) => r !== null && (r.status === 200 || r.status === 429) });
    });

    group('prompt_render', function () {
      const r = http.post(
        `${BASE}/api/prompts/${promptId}/render`,
        JSON.stringify({ variables: { topic: 'performance testing' } }),
        { headers: authH, tags: { endpoint: 'prompt_render' } },
      );
      // 200 = rendered, 422 = variable mismatch, 429 = rate limited — all acceptable in CI load
      check(r, { 'render: acceptable status': (r) => r !== null && [200, 422, 429].includes(r.status) });
    });
  }

  sleep(0.5);
}

// ---------------------------------------------------------------------------
// Teardown — clean up test data
// ---------------------------------------------------------------------------

export function teardown(data) {
  if (!data || !data.accessToken || !data.promptIds) return;
  const authH = jsonHeaders(data.accessToken);
  for (const id of data.promptIds) {
    http.del(`${BASE}/api/prompts/${id}`, null, { headers: authH });
  }
}
