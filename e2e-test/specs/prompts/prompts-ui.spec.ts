/**
 * Prompt UI E2E Tests
 *
 * Browser-level Playwright tests for prompt UI interactions that are not pure
 * API calls. Currently covers the inline delete-confirmation flow introduced to
 * replace the unreliable native `window.confirm` dialog (issue #294).
 *
 * Run: cd e2e-test && npx playwright test specs/prompts/prompts-ui.spec.ts
 * Requires: `make up` (full docker-compose stack) before running.
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';

function uniqueEmail(prefix = 'prompt-ui-test'): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}@opm-test.io`;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/** Log in via the React login form and wait until the app redirects away from /login. */
async function loginViaUI(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(STRONG_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);
}

/** Create a prompt via the API and return its id. */
async function createPrompt(request: APIRequestContext, accessToken: string, name: string): Promise<number> {
  const resp = await request.post('/api/prompts/', {
    headers: authHeaders(accessToken),
    data: { name, content: 'Content to be deleted', description: 'UI delete test' },
  });
  expect(resp.status()).toBe(201);
  return (await resp.json()).id;
}

test.describe('Prompt UI — inline delete confirmation', () => {
  let testEmail: string;
  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    testEmail = uniqueEmail();
    await request.post('/auth/register', { data: { email: testEmail, password: STRONG_PASSWORD } });
    const loginResp = await request.post('/auth/login', { data: { email: testEmail, password: STRONG_PASSWORD } });
    expect(loginResp.status()).toBe(200);
    accessToken = (await loginResp.json()).access_token;
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, testEmail);
  });

  test('Delete button reveals an inline confirmation rather than a native dialog', async ({ page, request }) => {
    const promptId = await createPrompt(request, accessToken, uid('to-delete'));

    // Fail the test if any native browser dialog (window.confirm/alert) appears.
    let nativeDialogShown = false;
    page.on('dialog', async (dialog) => {
      nativeDialogShown = true;
      await dialog.dismiss();
    });

    await page.goto(`/prompts/${promptId}`);
    await expect(page.getByTestId('delete-prompt')).toBeVisible();

    await page.getByTestId('delete-prompt').click();

    // Inline confirm/cancel controls appear in place — no dialog, no modal overlay.
    await expect(page.getByTestId('delete-prompt-confirm')).toBeVisible();
    await expect(page.getByTestId('delete-prompt-cancel')).toBeVisible();
    await expect(page.getByText('Delete this prompt?')).toBeVisible();
    expect(nativeDialogShown).toBe(false);

    // Cleanup (the prompt was not deleted in this test).
    await request.delete(`/api/prompts/${promptId}`, { headers: authHeaders(accessToken) });
  });

  test('Cancel keeps the prompt and sends no DELETE request', async ({ page, request }) => {
    const promptId = await createPrompt(request, accessToken, uid('keep'));

    await page.goto(`/prompts/${promptId}`);
    await page.getByTestId('delete-prompt').click();

    let deleteCalled = false;
    page.on('request', (req) => {
      if (req.method() === 'DELETE' && req.url().includes(`/api/prompts/${promptId}`)) deleteCalled = true;
    });

    await page.getByTestId('delete-prompt-cancel').click();
    await expect(page.getByTestId('delete-prompt')).toBeVisible();
    expect(deleteCalled).toBe(false);

    // Prompt should still exist.
    const getResp = await request.get(`/api/prompts/${promptId}`, { headers: authHeaders(accessToken) });
    expect(getResp.status()).toBe(200);

    await request.delete(`/api/prompts/${promptId}`, { headers: authHeaders(accessToken) });
  });

  test('Confirm sends a DELETE request and redirects to the prompt list', async ({ page, request }) => {
    const promptId = await createPrompt(request, accessToken, uid('delete-confirm'));

    await page.goto(`/prompts/${promptId}`);
    await page.getByTestId('delete-prompt').click();

    // Assert the DELETE request actually fires when confirming.
    const [deleteRequest] = await Promise.all([
      page.waitForRequest(
        (req) => req.method() === 'DELETE' && req.url().includes(`/api/prompts/${promptId}`),
      ),
      page.getByTestId('delete-prompt-confirm').click(),
    ]);
    expect(deleteRequest).toBeTruthy();

    // The app navigates back to the prompt list.
    await page.waitForURL(/\/prompts\/?$/);

    // The prompt is gone from the backend.
    const getResp = await request.get(`/api/prompts/${promptId}`, { headers: authHeaders(accessToken) });
    expect(getResp.status()).toBe(404);
  });
});
