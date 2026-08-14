// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, type APIRequestContext } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';
const NON_EXISTENT_PROVIDER_ID = 99999;

// An address nothing listens on inside the backend container's own network
// namespace. Used to deterministically exercise the "provider unreachable"
// code path (connection refused) without depending on a live Ollama/DeepSeek
// instance being available in the test environment.
const UNREACHABLE_BASE_URL = 'http://localhost:19999';

// Must match the ADMIN_EMAILS value configured for the stack under test
// (see docker-compose.yml — defaults to this address).
const BOOTSTRAP_ADMIN_EMAIL = 'e2e-admin@opm-test.io';

function uniqueEmail(prefix = 'providers-api'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}@opm-test.io`;
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
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

// Registration is idempotent here: a 409 simply means a prior test already
// created the bootstrap admin, in which case logging in still yields an admin token.
async function adminToken(request: APIRequestContext): Promise<string> {
  const register = await registerUser(request, BOOTSTRAP_ADMIN_EMAIL, STRONG_PASSWORD);
  expect([201, 409]).toContain(register.status());
  const login = await loginUser(request, BOOTSTRAP_ADMIN_EMAIL, STRONG_PASSWORD);
  expect(login.status()).toBe(200);
  return (await login.json()).access_token as string;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createProvider(
  request: APIRequestContext,
  adminTok: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request.post('/api/providers/', {
    headers: authHeader(adminTok),
    data: {
      name: uniqueName('provider'),
      provider_type: 'ollama',
      base_url: UNREACHABLE_BASE_URL,
      ...overrides,
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('Providers API - presets & access control', () => {
  test('Providers - presets endpoint returns known providers without auth', async ({ request }) => {
    const response = await request.get('/api/providers/presets');

    expect(response.status()).toBe(200);
    const presets = await response.json();
    expect(Array.isArray(presets)).toBe(true);
    const keys = presets.map((p: { key: string }) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['deepseek', 'groq', 'openrouter']));
    for (const preset of presets) {
      expect(typeof preset.name).toBe('string');
      expect(typeof preset.base_url).toBe('string');
      expect(preset.base_url.startsWith('http')).toBe(true);
    }
  });

  test('Providers - listing without a token returns 401', async ({ request }) => {
    const response = await request.get('/api/providers/');

    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe('missing_token');
  });

  test('Providers - creating without a token returns 401', async ({ request }) => {
    const response = await request.post('/api/providers/', {
      data: { name: 'x', provider_type: 'ollama', base_url: UNREACHABLE_BASE_URL },
    });

    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe('missing_token');
  });

  test('Providers - a standard (non-admin) user cannot create a provider (403)', async ({ request }) => {
    const token = await tokenFor(request, uniqueEmail('nonadmin-create'));

    const response = await request.post('/api/providers/', {
      headers: authHeader(token),
      data: { name: uniqueName('blocked'), provider_type: 'ollama', base_url: UNREACHABLE_BASE_URL },
    });

    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe('admin_required');
  });

  test('Providers - a standard (non-admin) user can still list providers', async ({ request }) => {
    const token = await tokenFor(request, uniqueEmail('nonadmin-list'));

    const response = await request.get('/api/providers/', { headers: authHeader(token) });

    expect(response.status()).toBe(200);
    expect(Array.isArray(await response.json())).toBe(true);
  });
});

test.describe('Providers API - CRUD & key handling (admin)', () => {
  let adminTok: string;
  const createdProviderIds: number[] = [];

  test.beforeAll(async ({ request }) => {
    adminTok = await adminToken(request);
  });

  test.afterEach(async ({ request }) => {
    while (createdProviderIds.length > 0) {
      const id = createdProviderIds.pop();
      await request.delete(`/api/providers/${id}`, { headers: authHeader(adminTok) });
    }
  });

  test('Providers - create an Ollama provider without an API key', async ({ request }) => {
    const provider = await createProvider(request, adminTok, { provider_type: 'ollama' });
    createdProviderIds.push(provider.id);

    expect(provider.provider_type).toBe('ollama');
    expect(provider.api_key_masked).toBeNull();
    expect(provider.enabled).toBe(true);
    expect(Object.keys(provider)).not.toContain('api_key');
    expect(Object.keys(provider)).not.toContain('api_key_encrypted');
  });

  test('Providers - create with an API key masks it in the response', async ({ request }) => {
    const rawKey = 'sk-e2e-test-secret-0123456789';
    const provider = await createProvider(request, adminTok, {
      provider_type: 'openai_compatible',
      api_key: rawKey,
    });
    createdProviderIds.push(provider.id);

    expect(provider.api_key_masked).toBeTruthy();
    expect(provider.api_key_masked).not.toBe(rawKey);
    expect(JSON.stringify(provider)).not.toContain(rawKey);
  });

  test('Providers - list responses never contain plaintext key material', async ({ request }) => {
    const rawKey = 'sk-e2e-list-leak-check-987654321';
    const provider = await createProvider(request, adminTok, {
      provider_type: 'openai_compatible',
      api_key: rawKey,
    });
    createdProviderIds.push(provider.id);

    const response = await request.get('/api/providers/', { headers: authHeader(adminTok) });
    expect(response.status()).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).not.toContain(rawKey);
    expect(bodyText).toContain(String(provider.id));
  });

  test('Providers - updating cost fields and default_model', async ({ request }) => {
    const provider = await createProvider(request, adminTok);
    createdProviderIds.push(provider.id);

    const response = await request.put(`/api/providers/${provider.id}`, {
      headers: authHeader(adminTok),
      data: { default_model: 'llama3', cost_per_1k_input_tokens: 0.001, cost_per_1k_output_tokens: 0.002 },
    });

    expect(response.status()).toBe(200);
    const updated = await response.json();
    expect(updated.default_model).toBe('llama3');
    expect(updated.cost_per_1k_input_tokens).toBe(0.001);
    expect(updated.cost_per_1k_output_tokens).toBe(0.002);
  });

  test('Providers - update with a blank api_key keeps the existing masked key unchanged', async ({ request }) => {
    const rawKey = 'sk-e2e-keep-existing-key-abc123';
    const created = await createProvider(request, adminTok, {
      provider_type: 'openai_compatible',
      api_key: rawKey,
    });
    createdProviderIds.push(created.id);

    const response = await request.put(`/api/providers/${created.id}`, {
      headers: authHeader(adminTok),
      data: { name: uniqueName('renamed'), api_key: '' },
    });

    expect(response.status()).toBe(200);
    const updated = await response.json();
    expect(updated.api_key_masked).toBe(created.api_key_masked);
  });

  test('Providers - a standard (non-admin) user cannot update or delete (403)', async ({ request }) => {
    const provider = await createProvider(request, adminTok);
    createdProviderIds.push(provider.id);
    const userToken = await tokenFor(request, uniqueEmail('nonadmin-write'));

    const updateResponse = await request.put(`/api/providers/${provider.id}`, {
      headers: authHeader(userToken),
      data: { default_model: 'should-not-apply' },
    });
    expect(updateResponse.status()).toBe(403);

    const deleteResponse = await request.delete(`/api/providers/${provider.id}`, { headers: authHeader(userToken) });
    expect(deleteResponse.status()).toBe(403);
  });

  test('Providers - delete removes the provider from the list', async ({ request }) => {
    const provider = await createProvider(request, adminTok);

    const deleteResponse = await request.delete(`/api/providers/${provider.id}`, { headers: authHeader(adminTok) });
    expect(deleteResponse.status()).toBe(204);

    const list = await request.get('/api/providers/', { headers: authHeader(adminTok) });
    const stillThere = (await list.json()).some((p: { id: number }) => p.id === provider.id);
    expect(stillThere).toBe(false);
  });

  test('Providers - updating an unknown provider returns 404', async ({ request }) => {
    const response = await request.put(`/api/providers/${NON_EXISTENT_PROVIDER_ID}`, {
      headers: authHeader(adminTok),
      data: { default_model: 'x' },
    });

    expect(response.status()).toBe(404);
    expect((await response.json()).detail).toContain(String(NON_EXISTENT_PROVIDER_ID));
  });

  test('Providers - deleting an unknown provider returns 404', async ({ request }) => {
    const response = await request.delete(`/api/providers/${NON_EXISTENT_PROVIDER_ID}`, { headers: authHeader(adminTok) });

    expect(response.status()).toBe(404);
  });
});

test.describe('Providers API - live connectivity error handling', () => {
  let adminTok: string;
  let userTok: string;
  let unreachableProviderId: number;

  test.beforeAll(async ({ request }) => {
    adminTok = await adminToken(request);
    userTok = await tokenFor(request, uniqueEmail('connectivity'));
    const provider = await createProvider(request, adminTok, { provider_type: 'ollama' });
    unreachableProviderId = provider.id;
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/providers/${unreachableProviderId}`, { headers: authHeader(adminTok) });
  });

  test('Providers - health check on an unreachable provider reports ok:false (not a 500/502)', async ({ request }) => {
    const response = await request.post(`/api/providers/${unreachableProviderId}/test`, { headers: authHeader(userTok) });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(typeof body.detail).toBe('string');
    expect(body.detail.length).toBeGreaterThan(0);
  });

  test('Providers - listing models from an unreachable provider returns 502 with a clean message', async ({ request }) => {
    const response = await request.get(`/api/providers/${unreachableProviderId}/models`, { headers: authHeader(userTok) });

    expect(response.status()).toBe(502);
    const body = await response.json();
    expect(typeof body.detail).toBe('string');
    // Normalized provider error, never a raw exception repr or traceback.
    expect(body.detail).not.toContain('Traceback');
    expect(body.detail).not.toMatch(/at 0x[0-9a-f]+/i);
  });

  test('Providers - models proxy on an unknown provider id returns 404', async ({ request }) => {
    const response = await request.get(`/api/providers/${NON_EXISTENT_PROVIDER_ID}/models`, { headers: authHeader(userTok) });

    expect(response.status()).toBe(404);
  });

  test('Providers - health check on an unknown provider id returns 404', async ({ request }) => {
    const response = await request.post(`/api/providers/${NON_EXISTENT_PROVIDER_ID}/test`, { headers: authHeader(userTok) });

    expect(response.status()).toBe(404);
  });
});
