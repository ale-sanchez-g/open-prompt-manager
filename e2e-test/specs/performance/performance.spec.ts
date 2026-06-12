// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, APIRequestContext } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

function uniqueEmail(prefix = 'performance-test'): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}@opm-test.io`;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function createPrompt(
  request: APIRequestContext,
  accessToken: string,
  payload: {
    name: string;
    content: string;
    description: string;
  }
): Promise<any> {
  const response = await request.post('/api/prompts/', {
    data: payload,
    headers: authHeaders(accessToken),
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('Performance and Load Tests', () => {
  let createdPromptIds: number[];
  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    const email = uniqueEmail();
    await request.post('/auth/register', { data: { email, password: STRONG_PASSWORD } });
    const loginResponse = await request.post('/auth/login', { data: { email, password: STRONG_PASSWORD } });
    expect(loginResponse.status()).toBe(200);
    const loginBody = await loginResponse.json();
    accessToken = loginBody.access_token;
  });

  test.beforeEach(async () => {
    createdPromptIds = [];
  });

  test.afterEach(async ({ request }) => {
    for (const promptId of createdPromptIds) {
      const response = await request.delete(`/api/prompts/${promptId}`, { headers: authHeaders(accessToken) });
      expect([204, 404]).toContain(response.status());
    }
  });

  test('Concurrent Request Handling', async ({ request }) => {
    const startTime = Date.now();

    const concurrentResponses = await Promise.all(
      Array.from({ length: 10 }, () => request.get('/api/prompts/', { headers: authHeaders(accessToken) }))
    );

    const totalTime = Date.now() - startTime;

    for (const response of concurrentResponses) {
      expect(response.status()).toBe(200);
    }

    const bodies = await Promise.all(concurrentResponses.map((response) => response.json()));
    for (const body of bodies) {
      expect(Array.isArray(body)).toBe(true);
    }

    expect(totalTime).toBeLessThan(10000);
  });

  test('Large Dataset Pagination', async ({ request }) => {
    const batchSize = 50;
    for (let i = 1; i <= batchSize; i++) {
      const prompt = await createPrompt(request, accessToken, {
        name: uniqueName(`large-dataset-prompt-${i}`),
        content: `Content for large dataset test ${i}`,
        description: `Performance test prompt ${i}`,
      });
      createdPromptIds.push(prompt.id);
    }

    const paginationTests = [
      { skip: 0, limit: 10 },
      { skip: 10, limit: 10 },
      { skip: 20, limit: 10 },
      { skip: 40, limit: 10 },
    ];

    for (const { skip, limit } of paginationTests) {
      const startTime = Date.now();
      const response = await request.get(`/api/prompts/?skip=${skip}&limit=${limit}`, { headers: authHeaders(accessToken) });
      const elapsed = Date.now() - startTime;

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeLessThanOrEqual(limit);
      expect(elapsed).toBeLessThan(5000);
    }
  });
});

test.describe('Rate Limiting Behaviour', () => {
  /**
   * Verifies that the backend rate limiting middleware is active and returns
   * the correct HTTP 429 response format when a client exceeds the configured
   * auth request limit.
   *
   * The RATE_LIMIT_AUTH_PER_MINUTE env var controls the threshold (default 60).
   * This suite sends up to AUTH_BURST requests sequentially until a 429 is
   * received, then validates the response headers and body structure.
   */
  const AUTH_BURST = 25; // above the performance-test CI limit of 20/min; well below e2e-smoke's 500/min

  test('Rate Limiting returns HTTP 429 with correct headers after limit exceeded', async ({ request }) => {
    let rateLimitResponse: any = null;

    for (let i = 0; i < AUTH_BURST; i++) {
      // Use invalid credentials — the rate limiter fires before auth so 401
      // responses still consume quota, and we avoid polluting registered users.
      const r = await request.post('/auth/login', {
        data: {
          email: `rl-probe-${i}-${Date.now()}@opm-test.io`,
          password: 'NotAValidPassword1!',
        },
      });

      if (r.status() === 429) {
        rateLimitResponse = r;
        break;
      }

      // Any status other than 401/404 (credential mismatch) is unexpected
      expect([401, 404, 429]).toContain(r.status());
    }

    expect(rateLimitResponse).not.toBeNull();

    const body = await rateLimitResponse.json();
    expect(body).toHaveProperty('error', 'rate_limit_exceeded');
    expect(body).toHaveProperty('detail');
    expect(typeof body.detail).toBe('string');

    const headers = rateLimitResponse.headers();
    expect(headers['retry-after']).toBeDefined();
    expect(parseInt(headers['retry-after'])).toBeGreaterThan(0);
    expect(headers['x-ratelimit-limit']).toBeDefined();
    expect(parseInt(headers['x-ratelimit-limit'])).toBeGreaterThan(0);
    expect(headers['x-ratelimit-window']).toBe('60');
  });

  test('Health endpoint is never rate-limited', async ({ request }) => {
    // Health is always exempt — 20 rapid calls must all return 200
    for (let i = 0; i < 20; i++) {
      const r = await request.get('/api/health');
      expect(r.status()).toBe(200);
    }
  });

  test('Rate limit response body matches the documented error schema', async ({ request }) => {
    // Send a burst to obtain a 429, then inspect the body schema
    let response429: any = null;

    for (let i = 0; i < AUTH_BURST && !response429; i++) {
      const r = await request.post('/auth/login', {
        data: {
          email: `schema-probe-${i}-${Date.now()}@opm-test.io`,
          password: 'Wrong1!',
        },
      });
      if (r.status() === 429) response429 = r;
    }

    expect(response429).not.toBeNull();
    const body = await response429.json();

    // Schema: { error: string, detail: string }
    expect(Object.keys(body).sort()).toEqual(['detail', 'error'].sort());
    expect(typeof body.error).toBe('string');
    expect(typeof body.detail).toBe('string');
  });
});
