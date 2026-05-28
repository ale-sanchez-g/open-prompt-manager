// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, APIRequestContext } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

function uniqueEmail(prefix = 'edge-cases-test'): string {
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

test.describe('Edge Cases and Error Handling Tests', () => {
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

  test('Invalid JSON Payloads', async ({ request }) => {
    const response = await request.fetch('/api/prompts/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
      data: '{ "title": "Broken JSON", "content": }',
    });

    expect([400, 422]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('detail');
  });

  test('Large Payload Handling', async ({ request }) => {
    const largeContent = 'A'.repeat(1024 * 1024 + 1);

    const response = await request.post('/api/prompts/', {
      data: {
        name: uniqueName('large-payload-test'),
        content: largeContent,
        description: 'Testing large payload handling',
      },
      headers: authHeaders(accessToken),
      timeout: 30000,
    });

    expect([200, 201, 400, 413, 422]).toContain(response.status());
    if (response.status() === 201) {
      const body = await response.json();
      createdPromptIds.push(body.id);
    }
  });

  test('Special Characters and Unicode', async ({ request }) => {
    const specialContent =
      'Unicode: 日本語テスト 🚀 Emoji: 🌟💡🎯 Special: <script>alert(1)</script> & "quotes" \'single\' © ® ™ €';

    const prompt = await createPrompt(request, accessToken, {
      name: uniqueName('unicode-special-chars'),
      content: specialContent,
      description: 'Testing special characters: <>&"\'',
    });
    createdPromptIds.push(prompt.id);

    expect(prompt.content).toBe(specialContent);
    expect(prompt.description).toBe('Testing special characters: <>&"\'');

    const getResponse = await request.get(`/api/prompts/${prompt.id}`, { headers: authHeaders(accessToken) });
    expect(getResponse.status()).toBe(200);
    const retrievedBody = await getResponse.json();
    expect(retrievedBody.content).toBe(specialContent);
  });

  test('Invalid HTTP Methods', async ({ request }) => {
    const patchResponse = await request.patch('/api/prompts/', {
      data: {},
      headers: authHeaders(accessToken),
    });
    expect([405, 404, 422]).toContain(patchResponse.status());

    const optionsPromptsResponse = await request.fetch('/api/prompts/', {
      method: 'OPTIONS',
      headers: authHeaders(accessToken),
    });
    expect([200, 204, 404, 405]).toContain(optionsPromptsResponse.status());

    const optionsAgentsResponse = await request.fetch('/api/agents/', {
      method: 'OPTIONS',
      headers: authHeaders(accessToken),
    });
    expect([200, 204, 404, 405]).toContain(optionsAgentsResponse.status());
  });

  test('Boundary Value Testing', async ({ request }) => {
    const limitZeroResponse = await request.get('/api/prompts/?skip=0&limit=0', { headers: authHeaders(accessToken) });
    expect(limitZeroResponse.status()).toBe(422);

    const limit100Response = await request.get('/api/prompts/?skip=0&limit=100', { headers: authHeaders(accessToken) });
    expect(limit100Response.status()).toBe(200);
    const limit100Body = await limit100Response.json();
    expect(Array.isArray(limit100Body)).toBe(true);
    expect(limit100Body.length).toBeLessThanOrEqual(100);

    const limit200Response = await request.get('/api/prompts/?skip=0&limit=200', { headers: authHeaders(accessToken) });
    expect(limit200Response.status()).toBe(200);
    const limit200Body = await limit200Response.json();
    expect(Array.isArray(limit200Body)).toBe(true);

    const limit201Response = await request.get('/api/prompts/?skip=0&limit=201', { headers: authHeaders(accessToken) });
    expect(limit201Response.status()).toBe(422);

    const negativeSkipResponse = await request.get('/api/prompts/?skip=-1&limit=10', { headers: authHeaders(accessToken) });
    expect(negativeSkipResponse.status()).toBe(422);

    const negativeLimitResponse = await request.get('/api/prompts/?skip=0&limit=-1', { headers: authHeaders(accessToken) });
    expect(negativeLimitResponse.status()).toBe(422);
  });

  test('Circular Component References', async ({ request }) => {
    const promptA = await createPrompt(request, accessToken, {
      name: uniqueName('circular-prompt-a'),
      content: 'Prompt A initial content (will update to reference B)',
      description: 'First circular reference prompt',
    });
    createdPromptIds.push(promptA.id);

    const promptB = await createPrompt(request, accessToken, {
      name: uniqueName('circular-prompt-b'),
      content: `Prompt B references A: {{component:${promptA.id}}}`,
      description: 'Second circular reference prompt',
    });
    createdPromptIds.push(promptB.id);

    const updateAResponse = await request.put(`/api/prompts/${promptA.id}`, {
      data: {
        name: promptA.name,
        content: `Prompt A references B: {{component:${promptB.id}}}`,
        description: 'First circular reference prompt',
      },
      headers: authHeaders(accessToken),
    });
    expect(updateAResponse.status()).toBe(200);

    const renderResponse = await request.post(`/api/prompts/${promptA.id}/render`, {
      data: { variables: {} },
      headers: authHeaders(accessToken),
    });
    expect([200, 400, 422, 500]).toContain(renderResponse.status());

    if (renderResponse.status() !== 200) {
      const body = await renderResponse.json();
      expect(body).toHaveProperty('detail');
    } else {
      const body = await renderResponse.json();
      expect(body).toHaveProperty('rendered_content');
    }
  });
});