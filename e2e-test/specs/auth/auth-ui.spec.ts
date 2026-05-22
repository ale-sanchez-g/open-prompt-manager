// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
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
    await page.getByLabel('Email').fill('not-an-email@nodomain');

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
    await page.getByLabel('Email').fill(`${uid('weak')}@opm-test.io`);

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
    await page.getByLabel('Email').fill(email);

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
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // expect: server error about duplicate email
    await expect(page.getByText(/already registered/i)).toBeVisible();
  });

  // ── Login flow ─────────────────────────────────────────────────────────────

  test('Auth UI - Login with invalid credentials shows error', async ({ page }) => {
    // 1. Navigate to /login
    await page.goto('/login');

    // 2. Fill unknown email and wrong password
    await page.getByLabel('Email').fill('nobody@unknown-opm.io');
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
    await page.getByLabel('Email').fill(email);
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
    await page.getByLabel('Email').fill(email);
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
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // 2. Click Logout button in sidebar
    await page.getByRole('button', { name: 'Logout' }).click();

    // expect: URL changes to /login
    await expect(page).toHaveURL(/\/login/);
  });
});
