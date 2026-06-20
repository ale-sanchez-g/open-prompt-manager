// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, type APIRequestContext } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';
const OTHER_PASSWORD = 'Other@9876Secure!';

// Must match the ADMIN_EMAILS value configured for the stack under test
// (see docker-compose.yml — defaults to this address). Registering it yields a
// deterministic admin regardless of which test registers a user first.
const BOOTSTRAP_ADMIN_EMAIL = 'e2e-admin@opm-test.io';

function uniqueEmail(prefix = 'pw-admin'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}@opm-test.io`;
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

// Obtain an admin access token by registering/logging in the bootstrap admin.
// Registration is idempotent here: a 409 simply means a prior test already
// created it, in which case logging in still yields an admin token.
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

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
}

test.describe('Admin API - identity & role claims', () => {
  test('Admin - /auth/me returns the user identity and role', async ({ request }) => {
    const email = uniqueEmail('me-ok');
    const token = await tokenFor(request, email);

    const response = await request.get('/auth/me', { headers: authHeader(token) });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(email);
    expect(body).toHaveProperty('id');
    expect((body.id as string).startsWith('usr_')).toBe(true);
    expect(['admin', 'user']).toContain(body.role);
  });

  test('Admin - /auth/me without a token returns 401', async ({ request }) => {
    const response = await request.get('/auth/me');

    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe('missing_token');
  });

  test('Admin - access token carries a role claim', async ({ request }) => {
    const token = await tokenFor(request, uniqueEmail('role-claim'));

    const payload = decodeJwtPayload(token);

    expect(payload).toHaveProperty('role');
    expect(['admin', 'user']).toContain(payload.role);
  });

  test('Admin - the bootstrap admin email is granted the admin role', async ({ request }) => {
    const token = await adminToken(request);

    const me = await request.get('/auth/me', { headers: authHeader(token) });
    expect(me.status()).toBe(200);
    expect((await me.json()).role).toBe('admin');
  });
});

test.describe('Admin API - access control (non-admin)', () => {
  test('Admin - non-admin cannot list users (403)', async ({ request }) => {
    const token = await tokenFor(request, uniqueEmail('nonadmin-list'));

    const response = await request.get('/api/admin/users', { headers: authHeader(token) });

    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe('admin_required');
  });

  test('Admin - non-admin cannot create a user (403)', async ({ request }) => {
    const token = await tokenFor(request, uniqueEmail('nonadmin-create'));

    const response = await request.post('/api/admin/users', {
      headers: authHeader(token),
      data: { email: uniqueEmail('blocked'), password: OTHER_PASSWORD, role: 'user' },
    });

    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe('admin_required');
  });

  test('Admin - admin endpoints require a token (401)', async ({ request }) => {
    const response = await request.get('/api/admin/users');

    expect(response.status()).toBe(401);
    expect((await response.json()).error).toBe('missing_token');
  });
});

test.describe('Admin API - user & role management (admin)', () => {
  test('Admin - list users returns an array including the admin', async ({ request }) => {
    const token = await adminToken(request);

    const response = await request.get('/api/admin/users', { headers: authHeader(token) });

    expect(response.status()).toBe(200);
    const users = await response.json();
    expect(Array.isArray(users)).toBe(true);
    const admin = users.find((u: { email: string }) => u.email === BOOTSTRAP_ADMIN_EMAIL);
    expect(admin).toBeTruthy();
    expect(admin.role).toBe('admin');
  });

  test('Admin - create a user with a chosen role', async ({ request }) => {
    const token = await adminToken(request);
    const email = uniqueEmail('created');

    const response = await request.post('/api/admin/users', {
      headers: authHeader(token),
      data: { email, password: OTHER_PASSWORD, role: 'user' },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.email).toBe(email);
    expect(body.role).toBe('user');
    expect((body.id as string).startsWith('usr_')).toBe(true);

    // The created standard user is denied admin endpoints.
    const userLogin = await loginUser(request, email, OTHER_PASSWORD);
    const userToken = (await userLogin.json()).access_token;
    const denied = await request.get('/api/admin/users', { headers: authHeader(userToken) });
    expect(denied.status()).toBe(403);
  });

  test('Admin - creating a duplicate email returns 409', async ({ request }) => {
    const token = await adminToken(request);
    const email = uniqueEmail('dup');
    await request.post('/api/admin/users', {
      headers: authHeader(token),
      data: { email, password: OTHER_PASSWORD, role: 'user' },
    });

    const response = await request.post('/api/admin/users', {
      headers: authHeader(token),
      data: { email, password: OTHER_PASSWORD, role: 'user' },
    });

    expect(response.status()).toBe(409);
    expect((await response.json()).error.toLowerCase()).toContain('already registered');
  });

  test('Admin - creating a user with an invalid role returns 422', async ({ request }) => {
    const token = await adminToken(request);

    const response = await request.post('/api/admin/users', {
      headers: authHeader(token),
      data: { email: uniqueEmail('badrole'), password: OTHER_PASSWORD, role: 'superuser' },
    });

    expect(response.status()).toBe(422);
    expect((await response.json()).error).toBe('Invalid role');
  });

  test('Admin - promote a standard user to admin', async ({ request }) => {
    const adminTok = await adminToken(request);
    const email = uniqueEmail('promote');
    await registerUser(request, email);
    const created = await request.get('/api/admin/users', { headers: authHeader(adminTok) });
    const target = (await created.json()).find((u: { email: string }) => u.email === email);
    expect(target).toBeTruthy();

    const response = await request.patch(`/api/admin/users/${target.id}`, {
      headers: authHeader(adminTok),
      data: { role: 'admin' },
    });

    expect(response.status()).toBe(200);
    expect((await response.json()).role).toBe('admin');

    // The promoted user can now reach admin endpoints.
    const promotedLogin = await loginUser(request, email);
    const promotedToken = (await promotedLogin.json()).access_token;
    const allowed = await request.get('/api/admin/users', { headers: authHeader(promotedToken) });
    expect(allowed.status()).toBe(200);
  });

  test('Admin - reset a user password', async ({ request }) => {
    const adminTok = await adminToken(request);
    const email = uniqueEmail('pwreset');
    await registerUser(request, email, STRONG_PASSWORD);
    const listed = await request.get('/api/admin/users', { headers: authHeader(adminTok) });
    const target = (await listed.json()).find((u: { email: string }) => u.email === email);

    const response = await request.patch(`/api/admin/users/${target.id}`, {
      headers: authHeader(adminTok),
      data: { password: OTHER_PASSWORD },
    });
    expect(response.status()).toBe(200);

    // Old password rejected, new password accepted.
    expect((await loginUser(request, email, STRONG_PASSWORD)).status()).toBe(401);
    expect((await loginUser(request, email, OTHER_PASSWORD)).status()).toBe(200);
  });

  test('Admin - updating a missing user returns 404', async ({ request }) => {
    const token = await adminToken(request);

    const response = await request.patch('/api/admin/users/usr_doesnotexist', {
      headers: authHeader(token),
      data: { role: 'user' },
    });

    expect(response.status()).toBe(404);
    expect((await response.json()).error).toBe('User not found');
  });

  test('Admin - delete a user', async ({ request }) => {
    const adminTok = await adminToken(request);
    const email = uniqueEmail('todelete');
    await registerUser(request, email);
    const listed = await request.get('/api/admin/users', { headers: authHeader(adminTok) });
    const target = (await listed.json()).find((u: { email: string }) => u.email === email);

    const response = await request.delete(`/api/admin/users/${target.id}`, { headers: authHeader(adminTok) });
    expect(response.status()).toBe(204);

    const after = await request.get('/api/admin/users', { headers: authHeader(adminTok) });
    const stillThere = (await after.json()).some((u: { id: string }) => u.id === target.id);
    expect(stillThere).toBe(false);
  });

  test('Admin - cannot delete their own account (400)', async ({ request }) => {
    const token = await adminToken(request);
    const me = await request.get('/auth/me', { headers: authHeader(token) });
    const adminId = (await me.json()).id;

    const response = await request.delete(`/api/admin/users/${adminId}`, { headers: authHeader(token) });

    expect(response.status()).toBe(400);
    expect((await response.json()).error.toLowerCase()).toContain('cannot delete');
  });

  test('Admin - cannot remove their own admin role (400)', async ({ request }) => {
    const token = await adminToken(request);
    const me = await request.get('/auth/me', { headers: authHeader(token) });
    const adminId = (await me.json()).id;

    const response = await request.patch(`/api/admin/users/${adminId}`, {
      headers: authHeader(token),
      data: { role: 'user' },
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).error.toLowerCase()).toContain('own admin role');
  });
});
