// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { randomInt } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';

// randomInt (CSPRNG), not Math.random: this feeds email/sessionId values used
// in auth and flag-bucketing decisions - see auth-api.spec.ts for the same fix.
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomInt(10000)}`;
}

// ── registration_extended_fields (OPM-FLAG-REG-001) ──────────────────────────
//
// These specs run against a deployed E2E_BASE_URL, so the flag state is a
// property of the target environment, not of this file. Two env vars describe
// what the runner arranged:
//
//   E2E_EXTENDED_FIELDS_ENABLED=true      the flag resolves ON in the target for
//                                         the session id below
//   E2E_EXTENDED_FIELDS_SESSION_ID=<uuid> a fixed identifier a Flagsmith segment
//                                         puts in the ON bucket at 100%
//
// Unset (the default, and what CI does today) means the target is flag-OFF: the
// OFF specs run as a regression guard and the ON specs skip. They are skipped,
// never silently passed - a green run with the ON specs skipped has proven
// nothing about the ON path.
const EXTENDED_SESSION_ID = process.env.E2E_EXTENDED_FIELDS_SESSION_ID ?? '';
const EXTENDED_ON = process.env.E2E_EXTENDED_FIELDS_ENABLED === 'true' && EXTENDED_SESSION_ID !== '';

// Must match STORAGE_KEY in frontend/src/featureFlags/sessionIdentity.js. Seeding
// it is the only way to make the browser use a known Flagsmith identity: the app
// mints a random one per visit by design, which would land in an arbitrary bucket.
const FLAG_SESSION_STORAGE_KEY = 'opm.flagSessionId';

async function useFixedFlagIdentity(page: Page): Promise<void> {
  // The init script runs in the browser, but this suite's tsconfig has no DOM
  // lib because it is mostly API-level. A narrow local type is cheaper than
  // widening `lib` for every spec in the suite.
  type BrowserStorage = { setItem(key: string, value: string): void };

  await page.addInitScript(
    ([key, id]) => {
      (globalThis as unknown as { sessionStorage: BrowserStorage }).sessionStorage.setItem(key, id);
    },
    [FLAG_SESSION_STORAGE_KEY, EXTENDED_SESSION_ID] as const,
  );
}

// getByLabel does a case-insensitive *substring* match. With the flag on, the
// marketing consent label starts "Email me occasional product updates…", so a
// bare getByLabel('Email') resolves to two elements and every register spec
// below dies on a strict-mode violation. exact:true pins it to the email input.
function emailField(page: Page) {
  return page.getByLabel('Email', { exact: true });
}

test.describe('Auth UI Tests', () => {
  // ── Login page ─────────────────────────────────────────────────────────────

  test('Auth UI - Login page renders', async ({ page }) => {
    // 1. Navigate to /login
    await page.goto('/login');

    // expect: "Sign in" heading is visible
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    // expect: email input is visible
    await expect(page.getByPlaceholder('user@opm.io')).toBeVisible();
    // expect: Sign in button is visible
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    // expect: Register link is visible
    await expect(page.getByRole('link', { name: 'Register' })).toBeVisible();
  });

  // ── Register page ──────────────────────────────────────────────────────────

  test('Auth UI - Register page renders', async ({ page }) => {
    // 1. Navigate to /register
    await page.goto('/register');

    // expect: "Create account" heading is visible
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    // expect: Create account button is visible
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    // expect: Sign in link is visible
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  // ── Route guards ───────────────────────────────────────────────────────────

  test('Auth UI - Unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    // 1. Navigate to /dashboard without being logged in
    await page.goto('/dashboard');

    // expect: URL changes to /login
    await expect(page).toHaveURL(/\/login/);
  });

  test('Auth UI - Unauthenticated access to /prompts redirects to /login', async ({ page }) => {
    // 1. Navigate to /prompts without being logged in
    await page.goto('/prompts');

    // expect: URL changes to /login
    await expect(page).toHaveURL(/\/login/);
  });

  // ── Register validation ────────────────────────────────────────────────────

  test('Auth UI - Register with invalid email shows client-side error', async ({ page }) => {
    // 1. Navigate to /register
    await page.goto('/register');

    // 2. Fill invalid email (has @ but no dot in domain — passes HTML5 type=email
    //    constraint but fails the custom validateEmail regex)
    await emailField(page).fill('not-an-email@nodomain');

    // 3. Fill strong password in password field
    await page.getByLabel('Password').fill(STRONG_PASSWORD);

    // 4. Click "Create account" button
    await page.getByRole('button', { name: 'Create account' }).click();

    // expect: "Enter a valid email address" error is visible
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
  });

  test('Auth UI - Register with weak password shows client-side error', async ({ page }) => {
    // 1. Navigate to /register
    await page.goto('/register');

    // 2. Fill valid email in email field
    await emailField(page).fill(`${uid('weak')}@opm-test.io`);

    // 3. Fill weak password "weakpass" in password field
    await page.getByLabel('Password').fill('weakpass');

    // 4. Click "Create account" button
    await page.getByRole('button', { name: 'Create account' }).click();

    // expect: password complexity error is visible
    // Use nth(1) because the same text also appears as a permanent hint paragraph
    // above the field; nth(1) targets the validation error paragraph specifically.
    await expect(page.getByText(/Password must be at least 10 characters/).nth(1)).toBeVisible();
  });

  test('Auth UI - Register successfully shows success message', async ({ page }) => {
    const email = `${uid('reg-ui')}@opm-test.io`;

    // 1. Navigate to /register
    await page.goto('/register');

    // 2. Fill a unique valid email
    await emailField(page).fill(email);

    // 3. Fill strong password
    await page.getByLabel('Password').fill(STRONG_PASSWORD);

    // 4. Click "Create account" button
    await page.getByRole('button', { name: 'Create account' }).click();

    // expect: "Registration successful. You can now sign in." is visible
    await expect(page.getByText('Registration successful. You can now sign in.')).toBeVisible();
  });

  test('Auth UI - Register with duplicate email shows server error', async ({ page, request }) => {
    const email = `${uid('dup-ui')}@opm-test.io`;

    // 1. Pre-register via API
    await request.post('/auth/register', { data: { email, password: STRONG_PASSWORD } });

    // 2. Navigate to /register and attempt to register with the same email
    await page.goto('/register');
    await emailField(page).fill(email);
    await page.getByLabel('Password').fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // expect: server error about duplicate email. Must be an exact match: the
    // page footer always contains "Already registered? Sign in", so a broad
    // /already registered/i regex resolves to two elements (Playwright strict
    // mode violation) the moment the real error renders.
    await expect(page.getByText('Email already registered', { exact: true })).toBeVisible();
  });

  // ── Login flow ─────────────────────────────────────────────────────────────

  test('Auth UI - Login with invalid credentials shows error', async ({ page }) => {
    // 1. Navigate to /login
    await page.goto('/login');

    // 2. Fill unknown email and wrong password
    await emailField(page).fill('nobody@unknown-opm.io');
    await page.getByLabel('Password').fill('Whatever!9999');

    // 3. Click "Sign in" button
    await page.getByRole('button', { name: 'Sign in' }).click();

    // expect: error message is visible
    await expect(page.getByText(/Unable to sign in|Invalid credentials/)).toBeVisible();
  });

  test('Auth UI - Login successfully redirects to /dashboard', async ({ page, request }) => {
    const email = `${uid('login-ui')}@opm-test.io`;

    // 1. Register a user via API
    await request.post('/auth/register', { data: { email, password: STRONG_PASSWORD } });

    // 2. Navigate to /login
    await page.goto('/login');

    // 3. Fill registered email and password
    await emailField(page).fill(email);
    await page.getByLabel('Password').fill(STRONG_PASSWORD);

    // 4. Click "Sign in" button
    await page.getByRole('button', { name: 'Sign in' }).click();

    // expect: URL changes to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Auth UI - After login /login redirects to /dashboard', async ({ page, request }) => {
    const email = `${uid('redir-ui')}@opm-test.io`;

    // 1. Register and login via UI
    await request.post('/auth/register', { data: { email, password: STRONG_PASSWORD } });
    await page.goto('/login');
    await emailField(page).fill(email);
    await page.getByLabel('Password').fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // 2. Navigate back to /login while authenticated
    await page.goto('/login');

    // expect: redirected away from /login to /dashboard (PublicOnlyRoute guard)
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // ── Logout flow ────────────────────────────────────────────────────────────

  test('Auth UI - Logout clears session and redirects to /login', async ({ page, request }) => {
    const email = `${uid('logout-ui')}@opm-test.io`;

    // 1. Register via API then login via UI
    await request.post('/auth/register', { data: { email, password: STRONG_PASSWORD } });
    await page.goto('/login');
    await emailField(page).fill(email);
    await page.getByLabel('Password').fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // 2. Click Logout button in sidebar
    await page.getByRole('button', { name: 'Logout' }).click();

    // expect: URL changes to /login
    await expect(page).toHaveURL(/\/login/);
  });

  // ── Extended registration fields (registration_extended_fields) ────────────

  test('Auth UI - Register page has no extended fields while the flag is off', async ({ page }) => {
    test.skip(EXTENDED_ON, 'target environment has registration_extended_fields enabled');

    // 1. Navigate to /register with the flag off (the default in every environment)
    await page.goto('/register');
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

    // expect: guardrail 2 — the form is what it was before the flag existed
    await expect(page.getByLabel('Company name')).toHaveCount(0);
    await expect(page.getByLabel('Job role')).toHaveCount(0);
    await expect(page.getByLabel('Phone number')).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('group')).toHaveCount(0);
  });

  test('Auth UI - Register page shows the extended fields while the flag is on', async ({ page }) => {
    test.skip(!EXTENDED_ON, 'needs E2E_EXTENDED_FIELDS_ENABLED and a 100% segment for the test identity');

    // 1. Pin the Flagsmith identity, then navigate to /register
    await useFixedFlagIdentity(page);
    await page.goto('/register');

    // expect: all four fields render, each reachable by its label
    await expect(page.getByLabel('Company name')).toBeVisible();
    await expect(page.getByLabel('Job role')).toBeVisible();
    await expect(page.getByLabel('Phone number')).toBeVisible();

    // expect: the opt-in is unchecked — consent has to be an affirmative act
    await expect(page.getByRole('checkbox')).not.toBeChecked();
  });

  test('Auth UI - Register with extended fields succeeds while the flag is on', async ({ page }) => {
    test.skip(!EXTENDED_ON, 'needs E2E_EXTENDED_FIELDS_ENABLED and a 100% segment for the test identity');
    const email = `${uid('reg-ext-ui')}@opm-test.io`;

    // 1. Pin the identity and fill the whole form
    await useFixedFlagIdentity(page);
    await page.goto('/register');
    await emailField(page).fill(email);
    await page.getByLabel('Password').fill(STRONG_PASSWORD);
    await page.getByLabel('Company name').fill('Acme Ltd');
    await page.getByLabel('Job role').fill('Platform Engineer');
    await page.getByLabel('Phone number').fill('+61 412 345 678');
    await page.getByRole('checkbox').check();

    // 2. Submit
    await page.getByRole('button', { name: 'Create account' }).click();

    // expect: registration succeeds. Whether the values landed in the columns is
    // matrix row 3 and needs DB access, which this suite does not have.
    await expect(page.getByText('Registration successful. You can now sign in.')).toBeVisible();
  });

  test('Auth UI - Register with a malformed phone shows a client-side error', async ({ page }) => {
    test.skip(!EXTENDED_ON, 'needs E2E_EXTENDED_FIELDS_ENABLED and a 100% segment for the test identity');

    // 1. Pin the identity and submit a phone number the contract rejects
    await useFixedFlagIdentity(page);
    await page.goto('/register');
    await emailField(page).fill(`${uid('reg-ext-bad')}@opm-test.io`);
    await page.getByLabel('Password').fill(STRONG_PASSWORD);
    await page.getByLabel('Phone number').fill('call me');
    await page.getByRole('button', { name: 'Create account' }).click();

    // expect: caught in the browser, so the account is never created
    await expect(page.getByText(/does not look like a phone number/)).toBeVisible();
    await expect(page.getByText('Registration successful. You can now sign in.')).toHaveCount(0);
  });
});
