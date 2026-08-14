// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, type APIRequestContext } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';
const NON_EXISTENT_PROMPT_ID = 99999;
const NON_EXISTENT_PROVIDER_ID = 99999;

// An address nothing listens on inside the backend container's own network
// namespace — a deterministic, dependency-free way to exercise the
// provider-unreachable path (502 + a recorded failed execution) without
// requiring a live Ollama/DeepSeek instance in the test environment.
const UNREACHABLE_BASE_URL = 'http://localhost:19999';

const BOOTSTRAP_ADMIN_EMAIL = 'e2e-admin@opm-test.io';

function uniqueEmail(prefix = 'prompt-test-exec'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}@opm-test.io`;
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function registerUser(request: APIRequestContext, email: string, password = STRONG_PASSWORD) {
  return request.post('/auth/register', { data: { email, password } });
}

async function loginUser(request: APIRequestContext, email: string, password = STRONG_PASSWORD) {
  return request.post('/auth/login', { data: { email, password } });
}

async function tokenFor(request: APIRequestContext, email: string, password = STRONG_PASSWORD): Promise<string> {
  await registerUser(request, email, password);
  const login = await loginUser(request, email, password);
  expect(login.status()).toBe(200);
  return (await login.json()).access_token as string;
}

async function adminToken(request: APIRequestContext): Promise<string> {
  const register = await registerUser(request, BOOTSTRAP_ADMIN_EMAIL, STRONG_PASSWORD);
  expect([201, 409]).toContain(register.status());
  const login = await loginUser(request, BOOTSTRAP_ADMIN_EMAIL, STRONG_PASSWORD);
  expect(login.status()).toBe(200);
  return (await login.json()).access_token as string;
}

async function createProvider(request: APIRequestContext, adminTok: string) {
  const response = await request.post('/api/providers/', {
    headers: authHeader(adminTok),
    data: {
      name: uniqueName('test-exec-provider'),
      provider_type: 'ollama',
      base_url: UNREACHABLE_BASE_URL,
      default_model: 'llama3',
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createPrompt(request: APIRequestContext, token: string) {
  const response = await request.post('/api/prompts/', {
    headers: authHeader(token),
    data: {
      name: uniqueName('test-exec-prompt'),
      content: 'Hello, {{user_name}}! Welcome to {{platform}}.',
      variables: [
        { name: 'user_name', type: 'string', required: true },
        { name: 'platform', type: 'string', required: false, default: 'OPM' },
      ],
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('Prompt test-execution API - auth & validation', () => {
  let token: string;
  let adminTok: string;
  let providerId: number;
  let promptId: number;

  test.beforeAll(async ({ request }) => {
    token = await tokenFor(request, uniqueEmail('validation'));
    adminTok = await adminToken(request);
    const provider = await createProvider(request, adminTok);
    providerId = provider.id;
    const prompt = await createPrompt(request, token);
    promptId = prompt.id;
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/providers/${providerId}`, { headers: authHeader(adminTok) });
    await request.delete(`/api/prompts/${promptId}`, { headers: authHeader(token) });
  });

  test('Prompt test - without a token returns 401', async ({ request }) => {
    const response = await request.post(`/api/prompts/${promptId}/test`, {
      data: { provider_id: providerId, variables: { user_name: 'Alice' } },
    });

    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe('missing_token');
  });

  test('Prompt test - missing required variable returns 422', async ({ request }) => {
    const response = await request.post(`/api/prompts/${promptId}/test`, {
      headers: authHeader(token),
      data: { provider_id: providerId, variables: {} },
    });

    expect(response.status()).toBe(422);
  });

  test('Prompt test - unknown prompt id returns 404', async ({ request }) => {
    const response = await request.post(`/api/prompts/${NON_EXISTENT_PROMPT_ID}/test`, {
      headers: authHeader(token),
      data: { provider_id: providerId, variables: { user_name: 'Alice' } },
    });

    expect(response.status()).toBe(404);
  });

  test('Prompt test - unknown provider id returns 404', async ({ request }) => {
    const response = await request.post(`/api/prompts/${promptId}/test`, {
      headers: authHeader(token),
      data: { provider_id: NON_EXISTENT_PROVIDER_ID, variables: { user_name: 'Alice' } },
    });

    expect(response.status()).toBe(404);
  });

  test('Prompt test - disabled provider returns 400', async ({ request }) => {
    const disable = await request.put(`/api/providers/${providerId}`, {
      headers: authHeader(adminTok),
      data: { enabled: false },
    });
    expect(disable.status()).toBe(200);

    const response = await request.post(`/api/prompts/${promptId}/test`, {
      headers: authHeader(token),
      data: { provider_id: providerId, variables: { user_name: 'Alice' } },
    });
    expect(response.status()).toBe(400);

    // Re-enable for the remaining tests that share this provider.
    await request.put(`/api/providers/${providerId}`, { headers: authHeader(adminTok), data: { enabled: true } });
  });
});

test.describe('Prompt test-execution API - provider failure recording', () => {
  let token: string;
  let adminTok: string;
  let providerId: number;
  let promptId: number;

  test.beforeAll(async ({ request }) => {
    token = await tokenFor(request, uniqueEmail('failure-recording'));
    adminTok = await adminToken(request);
    const provider = await createProvider(request, adminTok);
    providerId = provider.id;
    const prompt = await createPrompt(request, token);
    promptId = prompt.id;
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/providers/${providerId}`, { headers: authHeader(adminTok) });
    await request.delete(`/api/prompts/${promptId}`, { headers: authHeader(token) });
  });

  test('Prompt test - unreachable provider returns 502, records a failed execution, and updates stats', async ({ request }) => {
    const response = await request.post(`/api/prompts/${promptId}/test`, {
      headers: authHeader(token),
      data: { provider_id: providerId, variables: { user_name: 'Alice' } },
    });

    expect(response.status()).toBe(502);
    const body = await response.json();
    expect(typeof body.detail).toBe('string');
    expect(body.detail).not.toContain('Traceback');

    const executions = await request.get(`/api/prompts/${promptId}/executions`, { headers: authHeader(token) });
    expect(executions.status()).toBe(200);
    const executionList = await executions.json();
    expect(executionList.length).toBeGreaterThan(0);
    const failedExecution = executionList.find((e: { success: number }) => e.success === 0);
    expect(failedExecution).toBeTruthy();
    expect(failedExecution.rendered_prompt).toContain('Alice');

    const promptResponse = await request.get(`/api/prompts/${promptId}`, { headers: authHeader(token) });
    const promptBody = await promptResponse.json();
    expect(promptBody.usage_count).toBeGreaterThan(0);
  });

  test('Prompt test - no model resolvable (no override, no provider default) returns 400', async ({ request }) => {
    const bareProvider = await request.post('/api/providers/', {
      headers: authHeader(adminTok),
      data: { name: uniqueName('no-default-model'), provider_type: 'ollama', base_url: UNREACHABLE_BASE_URL },
    });
    expect(bareProvider.status()).toBe(201);
    const bareProviderId = (await bareProvider.json()).id;

    const response = await request.post(`/api/prompts/${promptId}/test`, {
      headers: authHeader(token),
      data: { provider_id: bareProviderId, variables: { user_name: 'Alice' } },
    });

    expect(response.status()).toBe(400);

    await request.delete(`/api/providers/${bareProviderId}`, { headers: authHeader(adminTok) });
  });
});
