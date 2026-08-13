// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { randomInt } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';

// randomInt (CSPRNG), not Math.random: these values end up in email/sessionId
// fields that flow into auth and flag-bucketing decisions, which CodeQL flags
// as a security-sensitive use of an insecure RNG.
function uniqueEmail(prefix = 'pw-auth'): string {
  return `${prefix}-${randomInt(1000000)}@opm-test.io`;
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

// ── registration_extended_fields (OPM-FLAG-REG-001) ──────────────────────────
//
// See the same block in auth-ui.spec.ts. E2E_EXTENDED_FIELDS_SESSION_ID is an
// identifier a Flagsmith segment puts in the ON bucket at 100% in the target
// environment; without it the ON specs skip rather than pretend.
//
// The specs that are *not* gated are the ones whose expected result is the same
// whichever way the flag resolves. Those are the interesting ones: the contract
// says an extended block must never be a hard failure, so a 201 is correct both
// when the API honours the block and when it discards it.
const EXTENDED_SESSION_ID = process.env.E2E_EXTENDED_FIELDS_SESSION_ID ?? '';
const EXTENDED_ON = process.env.E2E_EXTENDED_FIELDS_ENABLED === 'true' && EXTENDED_SESSION_ID !== '';

const VALID_EXTENDED = {
  companyName: 'Acme Ltd',
  jobRole: 'Platform Engineer',
  phone: '+61412345678',
  marketingOptIn: false,
};

/** A throwaway identity, so the flag resolves however the segment says it should. */
function randomSessionId(): string {
  return `e2e-${Date.now()}-${randomInt(1000000)}`;
}

test.describe('Auth API Tests', () => {
  // ── Register ───────────────────────────────────────────────────────────────

  test('Auth - Register successfully', async ({ request }) => {
    // 1. POST /auth/register with valid email and strong password
    const response = await registerUser(request, uniqueEmail('reg-ok'));

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('string');
    expect((body.id as string).startsWith('usr_')).toBe(true);
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

  // ── Register: extended fields (registration_extended_fields) ───────────────

  test('Auth - Register without sessionId still returns 201 (guardrail 2)', async ({ request }) => {
    // 1. POST /auth/register the way every client before this change did
    const response = await request.post('/auth/register', {
      data: { email: uniqueEmail('reg-legacy'), password: STRONG_PASSWORD },
    });

    // expect: unchanged. Making sessionId required would break a public,
    // unauthenticated endpoint; absent means no identity, which means flag off.
    expect(response.status()).toBe(201);
    expect(await response.json()).toHaveProperty('id');
  });

  test('Auth - Register with sessionId but no extended block returns 201', async ({ request }) => {
    // 1. POST /auth/register the way the new bundle does when the flag is off
    const response = await request.post('/auth/register', {
      data: {
        email: uniqueEmail('reg-sid'),
        password: STRONG_PASSWORD,
        sessionId: randomSessionId(),
      },
    });

    // expect: sessionId is an accepted, optional, inert field
    expect(response.status()).toBe(201);
    expect(await response.json()).toHaveProperty('id');
  });

  test('Auth - Register with an extended block never hard-fails, whatever the flag says', async ({ request }) => {
    // Matrix rows 2 and 13. The flag can flip between the form rendering and the
    // POST landing, so a valid extended block arriving at a flag-off backend must
    // be discarded silently, not rejected. Ungated on purpose: 201 is the right
    // answer in both states, which is exactly the property worth asserting.

    // 1. POST /auth/register with a valid extended block and a random identity
    const response = await request.post('/auth/register', {
      data: {
        email: uniqueEmail('reg-ext-any'),
        password: STRONG_PASSWORD,
        sessionId: randomSessionId(),
        extended: VALID_EXTENDED,
      },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toHaveProperty('id');
  });

  test('Auth - Register with an extended block and no sessionId returns 201', async ({ request }) => {
    // No identity means the flag resolves false, so the block is discarded.
    // A 422 here would mean the backend validated a block it had already decided
    // to ignore.
    const response = await request.post('/auth/register', {
      data: {
        email: uniqueEmail('reg-ext-nosid'),
        password: STRONG_PASSWORD,
        extended: VALID_EXTENDED,
      },
    });

    expect(response.status()).toBe(201);
  });

  test('Auth - Register with a valid extended block returns 201 while the flag is on', async ({ request }) => {
    test.skip(!EXTENDED_ON, 'needs E2E_EXTENDED_FIELDS_ENABLED and a 100% segment for the test identity');

    // 1. POST /auth/register with the identity the segment targets
    const response = await request.post('/auth/register', {
      data: {
        email: uniqueEmail('reg-ext-on'),
        password: STRONG_PASSWORD,
        sessionId: EXTENDED_SESSION_ID,
        extended: { ...VALID_EXTENDED, marketingOptIn: true },
      },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toHaveProperty('id');
  });

  test('Auth - Register with an invalid extended block returns 422 while the flag is on', async ({ request }) => {
    test.skip(!EXTENDED_ON, 'needs E2E_EXTENDED_FIELDS_ENABLED and a 100% segment for the test identity');
    const email = uniqueEmail('reg-ext-422');

    // 1. POST /auth/register with a phone number that fails the shared contract
    const response = await request.post('/auth/register', {
      data: {
        email,
        password: STRONG_PASSWORD,
        sessionId: EXTENDED_SESSION_ID,
        extended: { ...VALID_EXTENDED, phone: 'not a phone' },
      },
    });

    expect(response.status()).toBe(422);
    expect(await response.json()).toHaveProperty('error');

    // expect: matrix row 4 — no partial write. The account must not exist, which
    // a successful re-registration on the same email proves.
    const retry = await registerUser(request, email);
    expect(retry.status()).toBe(201);
  });

  test('Auth - The same sessionId gets the same decision twice', async ({ request }) => {
    // Matrix row 7's client-side half: bucketing is deterministic per identity,
    // so two identical requests must not disagree. Ungated - the assertion is
    // that the two agree, not what they agree on.
    const sessionId = randomSessionId();
    const payload = (email: string) => ({
      email,
      password: STRONG_PASSWORD,
      sessionId,
      extended: { ...VALID_EXTENDED, phone: 'not a phone' },
    });

    const first = await request.post('/auth/register', { data: payload(uniqueEmail('det-1')) });
    const second = await request.post('/auth/register', { data: payload(uniqueEmail('det-2')) });

    // Either both 201 (flag off, block discarded) or both 422 (flag on, phone
    // rejected). A split means the identity landed in different buckets.
    expect(second.status()).toBe(first.status());
    expect([201, 422]).toContain(first.status());
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
