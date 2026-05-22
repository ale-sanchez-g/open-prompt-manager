// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, type APIRequestContext } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';

function uniqueEmail(prefix = 'pw-auth'): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}@opm-test.io`;
}

async function registerUser(
  request: APIRequestContext,
  email: string,
  password = STRONG_PASSWORD,
) {
  return request.post('/auth/register', { data: { email, password } });
}

async function loginUser(
  request: APIRequestContext,
  email: string,
  password = STRONG_PASSWORD,
) {
  return request.post('/auth/login', { data: { email, password } });
}

test.describe('Auth API Tests', () => {
  // ── Register ───────────────────────────────────────────────────────────────

  test('Auth - Register successfully', async ({ request }) => {
    // 1. POST /auth/register with valid email and strong password
    const response = await registerUser(request, uniqueEmail('reg-ok'));

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('number');
  });

  test('Auth - Register with duplicate email', async ({ request }) => {
    // 1. POST /auth/register with the same email twice
    const email = uniqueEmail('reg-dup');
    const first = await registerUser(request, email);
    expect(first.status()).toBe(201);

    const second = await registerUser(request, email);
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body).toHaveProperty('error');
    expect((body.error as string).toLowerCase()).toContain('already registered');
  });

  test('Auth - Register with weak password', async ({ request }) => {
    // 1. POST /auth/register with simple password that fails complexity rules
    const response = await registerUser(request, uniqueEmail('reg-weak'), 'password');

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('Auth - Register with invalid email', async ({ request }) => {
    // 1. POST /auth/register with malformed email "not-an-email"
    const response = await registerUser(request, 'not-an-email');

    expect(response.status()).toBe(422);
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  test('Auth - Login successfully', async ({ request }) => {
    // 1. Register a new user via POST /auth/register
    const email = uniqueEmail('login-ok');
    await registerUser(request, email);

    // 2. POST /auth/login with the same credentials
    const response = await loginUser(request, email);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('access_token');
    expect(typeof body.access_token).toBe('string');
    expect(body.access_token.length).toBeGreaterThan(0);
    expect(body).toHaveProperty('token_type');
    expect(body.token_type).toBe('Bearer');
    expect(body).toHaveProperty('expires_in');
    expect(typeof body.expires_in).toBe('number');

    // expect: refresh_token cookie is set in the response
    const setCookieHeader = response.headers()['set-cookie'] ?? '';
    expect(setCookieHeader).toContain('refresh_token');
  });

  test('Auth - Login with invalid credentials', async ({ request }) => {
    // 1. POST /auth/login with non-existent email
    const response = await loginUser(request, 'nobody@unknown-opm.io', 'Whatever!9999');

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('Auth - Login with wrong password', async ({ request }) => {
    // 1. Register a new user
    const email = uniqueEmail('login-wrongpw');
    await registerUser(request, email);

    // 2. POST /auth/login with correct email but wrong password
    const response = await loginUser(request, email, 'WrongPass!9999');

    expect(response.status()).toBe(401);
  });

  // ── Refresh Token ──────────────────────────────────────────────────────────

  test('Auth - Refresh token successfully', async ({ request }) => {
    // 1. Register and login to get refresh cookie in request context
    const email = uniqueEmail('refresh-ok');
    await registerUser(request, email);
    await loginUser(request, email);

    // 2. POST /auth/refresh — cookie is automatically sent by the request context
    const response = await request.post('/auth/refresh');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('access_token');
    expect(typeof body.access_token).toBe('string');
    expect(body.access_token.length).toBeGreaterThan(0);
  });

  test('Auth - Refresh without cookie returns 401', async ({ request }) => {
    // 1. POST /auth/refresh without any cookie (fresh request context)
    const response = await request.post('/auth/refresh');

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  test('Auth - Logout successfully', async ({ request }) => {
    // 1. Register and login to obtain session
    const email = uniqueEmail('logout-ok');
    await registerUser(request, email);
    const loginResponse = await loginUser(request, email);
    const { access_token } = await loginResponse.json();

    // 2. POST /auth/logout with Bearer token and refresh_token cookie
    const response = await request.post('/auth/logout', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    expect(response.status()).toBe(204);
  });

  // ── Protected Endpoint Access ──────────────────────────────────────────────

  test('Auth - Access protected endpoint without token returns 401', async ({ request }) => {
    // 1. GET /api/prompts/ without Authorization header
    const response = await request.get('/api/prompts/');

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toBe('missing_token');
  });

  test('Auth - Access protected endpoint with valid token returns 200', async ({ request }) => {
    // 1. Register and login to obtain access token
    const email = uniqueEmail('protected-ok');
    await registerUser(request, email);
    const loginResponse = await loginUser(request, email);
    const { access_token } = await loginResponse.json();

    // 2. GET /api/prompts/ with Authorization: Bearer {access_token}
    const response = await request.get('/api/prompts/', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
