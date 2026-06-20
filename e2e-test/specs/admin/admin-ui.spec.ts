// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';

// Must match the ADMIN_EMAILS value configured for the stack under test
// (see docker-compose.yml — defaults to this address).
const BOOTSTRAP_ADMIN_EMAIL = 'e2e-admin@opm-test.io';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function ensureUser(request: APIRequestContext, email: string, password = STRONG_PASSWORD) {
  const response = await request.post('/auth/register', { data: { email, password } });
  expect([201, 409]).toContain(response.status());
}

async function loginViaUi(page: Page, email: string, password = STRONG_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('Admin UI - access control', () => {
  test('Admin UI - unauthenticated access to /admin redirects to /login', async ({ page }) => {
    // 1. Navigate to /admin without being logged in
    await page.goto('/admin');

    // expect: redirected to /login by the auth guard
    await expect(page).toHaveURL(/\/login/);
  });

  test('Admin UI - standard user does not see the Admin nav link', async ({ page, request }) => {
    const email = `${uid('nav-nonadmin')}@opm-test.io`;
    await ensureUser(request, email);

    // 1. Log in as a standard (non-admin) user
    await loginViaUi(page, email);

    // expect: the regular navigation is present
    await expect(page.getByRole('link', { name: 'Prompts' })).toBeVisible();
    // expect: the Admin nav link is NOT rendered for non-admins
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  });

  test('Admin UI - standard user navigating to /admin is redirected to /dashboard', async ({ page, request }) => {
    const email = `${uid('guard-nonadmin')}@opm-test.io`;
    await ensureUser(request, email);

    // 1. Log in as a standard user, then navigate directly to /admin
    await loginViaUi(page, email);
    await page.goto('/admin');

    // expect: AdminRoute guard redirects non-admins to /dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('Admin UI - user management (admin)', () => {
  test.beforeEach(async ({ request }) => {
    await ensureUser(request, BOOTSTRAP_ADMIN_EMAIL);
  });

  test('Admin UI - admin sees the Admin nav link and opens User Management', async ({ page }) => {
    // 1. Log in as the bootstrap admin
    await loginViaUi(page, BOOTSTRAP_ADMIN_EMAIL);

    // 2. The Admin nav link is visible; click it
    const adminLink = page.getByRole('link', { name: 'Admin' });
    await expect(adminLink).toBeVisible();
    await adminLink.click();

    // expect: User Management page is shown and lists users
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
    await expect(page.getByText(/All Users \(\d+\)/)).toBeVisible();
    await expect(page.getByText(BOOTSTRAP_ADMIN_EMAIL).first()).toBeVisible();
  });

  test('Admin UI - admin creates a new user via the form', async ({ page }) => {
    const newEmail = `${uid('ui-created')}@opm-test.io`;

    // 1. Log in as admin and open the admin panel
    await loginViaUi(page, BOOTSTRAP_ADMIN_EMAIL);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

    // 2. Fill the Add User form and submit
    await page.getByLabel('Email').fill(newEmail);
    await page.getByLabel('Password').fill(STRONG_PASSWORD);
    await page.getByLabel('New user role').selectOption('user');
    await page.getByRole('button', { name: 'Add User' }).click();

    // expect: the newly created user appears in the list
    await expect(page.getByText(newEmail)).toBeVisible();
  });

  test('Admin UI - admin cannot delete or demote their own account', async ({ page }) => {
    // 1. Log in as admin and open the admin panel
    await loginViaUi(page, BOOTSTRAP_ADMIN_EMAIL);
    await page.goto('/admin');
    await expect(page.getByText(BOOTSTRAP_ADMIN_EMAIL).first()).toBeVisible();

    // expect: the admin's own row has its role selector and delete button disabled
    await expect(page.getByLabel(`Role for ${BOOTSTRAP_ADMIN_EMAIL}`)).toBeDisabled();
    await expect(page.getByLabel(`Delete ${BOOTSTRAP_ADMIN_EMAIL}`)).toBeDisabled();
  });
});
