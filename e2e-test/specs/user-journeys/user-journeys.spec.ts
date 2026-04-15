/**
 * UI User Journey E2E Tests
 *
 * Browser-level Playwright tests for the 4 user journey walkthroughs described
 * on the in-app API Documentation page (/api-docs).  Each describe block
 * contains exactly two tests:
 *
 *   1. API Docs page — verifies the journey is documented in the in-app guide.
 *   2. Full E2E journey — navigates the real React frontend end-to-end, from
 *      creating data through verifying the rendered output.
 *
 * Journeys:
 *   1. Create and Render a Prompt
 *   2. Version a Prompt
 *   3. Register an Agent and Track Executions
 *   4. Build a Composable Prompt
 *
 * Run: cd e2e-test && npm run test:user-journeys
 * Requires: `make up` (full docker-compose stack) before running.
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max ms to wait for the "Rendered output:" label to appear after clicking Render. */
const RENDER_TIMEOUT_MS = 10000;

/** Max ms to wait for an element to become visible (e.g. async-loaded pills, cards). */
const VISIBILITY_TIMEOUT_MS = 10000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a collision-free display name for test data. */
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/** Extract the numeric prompt ID from a URL like /prompts/42 or /prompts/42/edit. */
function promptIdFromUrl(url: string): number {
  const m = url.match(/\/prompts\/(\d+)/);
  if (!m) throw new Error(`No prompt ID in URL: ${url}`);
  return parseInt(m[1], 10);
}

/** Fetch a JSON list from the given API path. */
async function fetchList(request: APIRequestContext, path: string): Promise<any[]> {
  return (await request.get(path)).json();
}

/**
 * Click "Add Variable" and fill in the variable name field.
 * Uses exact placeholder match so only the variable-name input is targeted
 * (the content textarea has a longer placeholder containing "variable_name").
 */
async function addVariable(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Add Variable/ }).click();
  await page.getByPlaceholder('name', { exact: true }).fill(name);
}

// ── Journey 1: Create and Render a Prompt ─────────────────────────────────────

test.describe('UI Journey 1 — Create and Render a Prompt', () => {
  test('API Docs page shows the Create + Render user journey steps', async ({ page }) => {
    await page.goto('/api-docs');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1').filter({ hasText: 'API Documentation' })).toBeVisible();
    // "User Journeys" appears in both the sticky nav and as a section heading; target heading
    await expect(page.getByRole('heading', { name: 'User Journeys' })).toBeVisible();
    await expect(page.getByText('1 · Create and render a prompt')).toBeVisible();
    await expect(page.getByText('Create a tag (optional)')).toBeVisible();
    // "Create a prompt" also appears as an endpoint accordion summary; use .first()
    await expect(page.getByText('Create a prompt').first()).toBeVisible();
    await expect(page.getByText('Render the prompt with variable values')).toBeVisible();
  });

  test('Full journey — create tag, create prompt with variable, render via the browser UI', async ({ page, request }) => {
    const tagName = uid('j1-tag');
    const promptName = uid('j1-prompt');
    let promptId: number | null = null;

    // Step 1: Create tag via the Tags UI
    await page.goto('/tags');
    await page.locator('input[required]').fill(tagName);
    await page.getByRole('button', { name: /Create/ }).click();
    await expect(page.getByText(tagName, { exact: true })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Step 2: Create a prompt with a variable and associate the new tag via the Prompt Editor
    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(promptName);
    await page.locator('textarea').fill('Hi {{user_name}}, welcome to the platform!');

    // Declare the variable
    await addVariable(page, 'user_name');

    // Wait for the tag pills to load, then click the new tag
    await expect(page.getByRole('button', { name: tagName })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.getByRole('button', { name: tagName }).click();

    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+\/?$/);
    promptId = promptIdFromUrl(page.url());
    await page.waitForLoadState('networkidle');

    // Verify the tag is shown on the detail page
    await expect(page.getByText(tagName)).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Step 3: Fill the variable input and click Render
    await page.locator('#var-user_name').fill('Carol');
    await page.getByRole('button', { name: /Render/ }).click();

    await expect(page.getByText('Rendered output:')).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
    await expect(page.getByText('Hi Carol, welcome to the platform!')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${promptId}`);
    const tags = await fetchList(request, '/api/tags/');
    const tag = tags.find((t: any) => t.name === tagName);
    if (tag) await request.delete(`/api/tags/${tag.id}`);
  });
});

// ── Journey 2: Version a Prompt ───────────────────────────────────────────────

test.describe('UI Journey 2 — Version a Prompt', () => {
  test('API Docs page shows the Versioning user journey steps', async ({ page }) => {
    await page.goto('/api-docs');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('2 · Version a prompt')).toBeVisible();
    // "Create a new version" also appears as an endpoint accordion summary; use .first()
    await expect(page.getByText('Create a new version').first()).toBeVisible();
    await expect(page.getByText('Inspect the version history')).toBeVisible();
    await expect(page.getByText('Identify the latest version')).toBeVisible();
  });

  test('Full journey — create prompt via UI, edit, bump version, verify history', async ({ page, request }) => {
    const promptName = uid('j2-full');
    let v1Id: number | null = null;
    let v2Id: number | null = null;

    // Step 1: Create prompt via the Prompt Editor UI
    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(promptName);
    await page.locator('textarea').fill('First version content.');
    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+\/?$/);
    v1Id = promptIdFromUrl(page.url());

    // Step 2: Click Edit and bump the version
    await page.getByRole('link', { name: /Edit/ }).click();
    await page.waitForURL(/\/prompts\/\d+\/edit/);
    // Wait for the edit form to finish loading before interacting
    await expect(page.getByRole('heading', { name: /Edit Prompt/ })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.locator('textarea').fill('Second version — improved phrasing.');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('button', { name: /Yes, bump to/ })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.getByRole('button', { name: /Yes, bump to/ }).click();
    // $ anchor prevents matching /prompts/42/edit (current URL) — waits for /prompts/43
    await page.waitForURL(/\/prompts\/\d+\/?$/);
    v2Id = promptIdFromUrl(page.url());
    expect(v2Id).not.toBe(v1Id);
    await page.waitForLoadState('networkidle');

    // Step 3: Version history sidebar shows both versions, v1.0.1 is Latest
    await expect(page.getByText('v1.0.1').first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await expect(page.getByText('v1.0.0').first()).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await expect(page.getByText('Latest')).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Cleanup
    await request.delete(`/api/prompts/${v2Id}`);
    await request.delete(`/api/prompts/${v1Id}`);
  });
});

// ── Journey 3: Register an Agent and Track Executions ─────────────────────────

test.describe('UI Journey 3 — Register an Agent and Track Executions', () => {
  test('API Docs page shows the Agent Execution Tracking user journey steps', async ({ page }) => {
    await page.goto('/api-docs');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('3 · Register an agent and track executions')).toBeVisible();
    await expect(page.getByText('Register an agent', { exact: true })).toBeVisible();
    await expect(page.getByText('Associate the agent with a prompt', { exact: true })).toBeVisible();
    // "Record an execution" also appears as an endpoint accordion summary; use .first()
    await expect(page.getByText('Record an execution').first()).toBeVisible();
    await expect(page.getByText('Review agent stats')).toBeVisible();
  });

  test('Full journey — register agent via UI, associate with prompt, verify stats after execution', async ({ page, request }) => {
    const agentName = uid('j3-agent');
    const promptName = uid('j3-prompt');
    let promptId: number | null = null;
    let agentId: number | null = null;

    // Step 1: Register agent via the Agents UI
    await page.goto('/agents');
    await page.locator('input[required]').fill(agentName);
    await page.getByRole('button', { name: /Register/ }).click();
    await expect(
      page.locator('[data-testid="agent-card"]').filter({ hasText: agentName })
    ).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Retrieve the created agent's ID via API
    const agents = await fetchList(request, '/api/agents/');
    const agent = agents.find((a: any) => a.name === agentName);
    agentId = agent.id;

    // Step 2: Create a prompt and associate the agent via the Prompt Editor UI
    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(promptName);
    await page.locator('textarea').fill('Support response content.');

    await expect(page.getByRole('button', { name: agentName })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.getByRole('button', { name: agentName }).click();

    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+\/?$/);
    promptId = promptIdFromUrl(page.url());
    await page.waitForLoadState('networkidle');

    // The agent should appear in the Agents sidebar on the detail page
    await expect(page.getByText(agentName)).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Step 3: Record an execution via API and reload to verify updated stats
    await request.post(`/api/prompts/${promptId}/executions`, {
      data: { agent_id: agentId, success: 1, rating: 4 },
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Wait for the prompt heading to confirm the page has fully rendered
    await expect(page.getByRole('heading', { name: promptName })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Verify the Avg Rating metric badge shows "4.0"
    // Target the metric card by its label text, then assert the numeric value
    await expect(
      page.locator('.rounded-lg.text-center').filter({ hasText: 'Avg Rating' })
    ).toContainText('4.0', { timeout: VISIBILITY_TIMEOUT_MS });

    // Step 4: Verify Agents nav link works
    await expect(page.locator('a[href="/agents"]')).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Cleanup
    await request.delete(`/api/prompts/${promptId}`);
    await request.delete(`/api/agents/${agentId}`);
  });
});

// ── Journey 4: Build a Composable Prompt ──────────────────────────────────────

test.describe('UI Journey 4 — Build a Composable Prompt', () => {
  test('API Docs page shows the Composable Prompt user journey steps', async ({ page }) => {
    await page.goto('/api-docs');
    await expect(page.getByText('4 · Build a composable prompt')).toBeVisible();
    await expect(page.getByText('Create a reusable component prompt')).toBeVisible();
    await expect(page.getByText('Reference the component in a parent prompt')).toBeVisible();
    await expect(page.getByText('Render to see the resolved output')).toBeVisible();
  });

  test('Full journey — create component via UI, embed via search, render resolved output', async ({ page, request }) => {
    const componentName = uid('j4-comp');
    const parentName = uid('j4-parent');
    let componentId: number | null = null;
    let parentId: number | null = null;

    // Step 1: Create the component prompt via the Prompt Editor UI
    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(componentName);
    await page.locator('textarea').fill('Disclaimer: for informational purposes only.');
    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+\/?$/);
    componentId = promptIdFromUrl(page.url());
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(componentName)).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Step 2: Create the parent prompt and embed the component via the search UI
    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(parentName);
    await page.locator('textarea').fill('Information about the topic. ');

    await page.getByPlaceholder(/Search prompts to insert as components/).fill(componentName);
    await expect(page.getByText(componentName).last()).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.getByRole('button', { name: 'Insert' }).first().click();

    // Confirm the {{component:<id>}} reference was inserted into the textarea
    const content = await page.locator('textarea').inputValue();
    expect(content).toContain(`{{component:${componentId}}}`);

    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+\/?$/);
    parentId = promptIdFromUrl(page.url());
    await page.waitForLoadState('networkidle');

    // The PromptDetail page fetches component prompts in a second useEffect that
    // runs after the main prompt loads.  Wait for the "Components" sidebar heading
    // to appear before asserting the component name — this confirms the second
    // API call has completed and componentPrompts state has been set.
    await expect(
      page.locator('h3').filter({ hasText: 'Components' })
    ).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Component is listed in the Components sidebar on the detail page
    await expect(page.getByText(componentName)).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Step 3: Render and verify the component content is resolved inline
    await page.getByRole('button', { name: /Render/ }).click();
    await expect(page.getByText('Rendered output:')).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
    await expect(page.getByText('Disclaimer: for informational purposes only.')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${parentId}`);
    await request.delete(`/api/prompts/${componentId}`);
  });
});
