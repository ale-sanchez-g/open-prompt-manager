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