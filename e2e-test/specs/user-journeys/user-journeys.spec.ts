/**
 * UI User Journey E2E Tests
 *
 * Browser-level Playwright tests for the 4 step-by-step user journey walkthroughs
 * described on the in-app API Documentation page (/api-docs).  Each describe block
 * exercises the real React frontend running at http://localhost (full docker-compose
 * stack required — run `make up` before executing these tests).
 *
 * Journeys:
 *   1. Create and Render a Prompt
 *   2. Version a Prompt
 *   3. Register an Agent and Track Executions
 *   4. Build a Composable Prompt
 *
 * Run: cd e2e-test && npm run test:user-journeys
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max ms to wait for the "Rendered output:" label to appear after clicking Render. */
const RENDER_TIMEOUT_MS = 10000;

/** Max ms to wait for an element to become visible (e.g. async-loaded pills, cards). */
const VISIBILITY_TIMEOUT_MS = 5000;

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
 * Encapsulates the two-step interaction that is repeated across Journey 1 & 2 tests.
 */
async function addVariable(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Add Variable/ }).click();
  await page.getByPlaceholder('name').first().fill(name);
}

// ── Journey 1: Create and Render a Prompt ─────────────────────────────────────
//
// Users create a tagged prompt with typed variables, then supply runtime values
// and render the resolved output — all through the browser UI.

test.describe('UI Journey 1 — Create and Render a Prompt', () => {
  test('API Docs page shows the Create + Render user journey steps', async ({ page }) => {
    await page.goto('/api-docs');
    await expect(page.getByRole('heading', { name: 'API Documentation' })).toBeVisible();
    // User Journeys section is present
    await expect(page.getByText('User Journeys')).toBeVisible();
    // Journey 1 title and all three step titles are visible
    await expect(page.getByText('1 · Create and render a prompt')).toBeVisible();
    await expect(page.getByText('Create a tag (optional)')).toBeVisible();
    await expect(page.getByText('Create a prompt')).toBeVisible();
    await expect(page.getByText('Render the prompt with variable values')).toBeVisible();
  });

  test('Step 1 — Create a tag on the Tags management page', async ({ page, request }) => {
    const tagName = uid('j1-tag');

    await page.goto('/tags');
    // The only required text input on this page is the tag Name field
    await page.locator('input[required]').fill(tagName);
    await page.getByRole('button', { name: /Create/ }).click();

    // The new tag should appear immediately in the tag list
    await expect(page.getByText(tagName, { exact: true })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Cleanup
    const tags = await fetchList(request, '/api/tags/');
    const tag = tags.find((t: any) => t.name === tagName);
    if (tag) await request.delete(`/api/tags/${tag.id}`);
  });

  test('Step 2 — Create a prompt with a typed variable via the Prompt Editor', async ({ page, request }) => {
    const promptName = uid('j1-prompt');

    await page.goto('/prompts/new');
    // Name is the first required input in the two-column grid
    await page.locator('input[required]').first().fill(promptName);
    // Content is the only textarea in the form
    await page.locator('textarea').fill('Hello, {{user_name}}!');

    // Declare the variable via the Variables section
    await addVariable(page, 'user_name');

    // Submit
    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+/);
    const promptId = promptIdFromUrl(page.url());

    // Verify the detail page shows the prompt and initial version
    await expect(page.getByText(promptName)).toBeVisible();
    await expect(page.getByText('v1.0.0')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${promptId}`);
  });

  test('Step 3 — Render a prompt with a variable value on the Prompt Detail page', async ({ page, request }) => {
    // Create a prompt (with a declared variable) via API so we can focus on the render UI
    const promptName = uid('j1-render');
    const createResp = await request.post('/api/prompts/', {
      data: {
        name: promptName,
        content: 'Hello, {{user_name}}!',
        variables: [{ name: 'user_name', type: 'string', required: false, default: '' }],
      },
    });
    const prompt = await createResp.json();

    await page.goto(`/prompts/${prompt.id}`);
    await expect(page.getByText(promptName)).toBeVisible();

    // The variable input uses id="var-<name>" pattern
    await page.locator('#var-user_name').fill('Alice');
    await page.getByRole('button', { name: /Render/ }).click();

    // Verify the rendered output section appears with the resolved content
    await expect(page.getByText('Rendered output:')).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
    await expect(page.getByText('Hello, Alice!')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${prompt.id}`);
  });

  test('Full journey — create tag, create prompt, render via the browser UI', async ({ page, request }) => {
    const tagName = uid('j1-full-tag');
    const promptName = uid('j1-full-prompt');
    let promptId: number | null = null;

    // Step 1: Create tag via the Tags UI
    await page.goto('/tags');
    await page.locator('input[required]').fill(tagName);
    await page.getByRole('button', { name: /Create/ }).click();
    await expect(page.getByText(tagName, { exact: true })).toBeVisible();

    // Step 2: Create a prompt and associate the new tag via the Prompt Editor UI
    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(promptName);
    await page.locator('textarea').fill('Hi {{user_name}}, welcome to the platform!');

    // Declare a variable
    await addVariable(page, 'user_name');

    // Wait for the tag pills to load, then click the new tag
    await expect(page.getByRole('button', { name: tagName })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.getByRole('button', { name: tagName }).click();

    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+/);
    promptId = promptIdFromUrl(page.url());

    // Verify the tag is shown on the detail page
    await expect(page.getByText(tagName)).toBeVisible();

    // Step 3: Fill the variable and click Render
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
//
// The Prompt Editor shows a version-bump modal when saving an edit, letting users
// create a child version with an auto-incremented semver.  The version history
// sidebar on the Detail page always shows the full lineage.

test.describe('UI Journey 2 — Version a Prompt', () => {
  test('API Docs page shows the Versioning user journey steps', async ({ page }) => {
    await page.goto('/api-docs');
    await expect(page.getByText('2 · Version a prompt')).toBeVisible();
    await expect(page.getByText('Create a new version')).toBeVisible();
    await expect(page.getByText('Inspect the version history')).toBeVisible();
    await expect(page.getByText('Identify the latest version')).toBeVisible();
  });

  test('Step 1 — Edit a prompt and bump the version via the version modal', async ({ page, request }) => {
    // Create the initial prompt via API
    const promptName = uid('j2-modal');
    const createResp = await request.post('/api/prompts/', {
      data: { name: promptName, content: 'Original v1 content.' },
    });
    const v1 = await createResp.json();

    // Navigate to the edit page
    await page.goto(`/prompts/${v1.id}/edit`);
    await expect(page.getByRole('heading', { name: /Edit Prompt/ })).toBeVisible();

    // Change the content
    await page.locator('textarea').fill('Updated content for version bump test.');

    // Save — this triggers the version modal
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Confirm the version bump in the modal
    await expect(page.getByRole('button', { name: /Yes, bump to/ })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.getByRole('button', { name: /Yes, bump to/ }).click();

    // After the bump the page redirects to the new (child) prompt
    await page.waitForURL(/\/prompts\/\d+/);
    const v2Id = promptIdFromUrl(page.url());
    expect(v2Id).not.toBe(v1.id);

    // New version should show v1.0.1
    await expect(page.getByText('v1.0.1')).toBeVisible();

    // "Latest" badge should be shown in the version history sidebar
    await expect(page.getByText('Latest')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${v2Id}`);
    await request.delete(`/api/prompts/${v1.id}`);
  });

  test('Step 2 — Version history sidebar shows all versions with the is_latest badge', async ({ page, request }) => {
    // Create two versions via API
    const promptName = uid('j2-history');
    const v1Resp = await request.post('/api/prompts/', {
      data: { name: promptName, content: 'v1 content.', version: '1.0.0' },
    });
    const v1 = await v1Resp.json();
    const v2Resp = await request.post(`/api/prompts/${v1.id}/versions`, {
      data: { content: 'v1.0.1 content.' },
    });
    const v2 = await v2Resp.json();

    // Navigate to the latest version
    await page.goto(`/prompts/${v2.id}`);
    await expect(page.getByText(promptName)).toBeVisible();

    // Both versions appear in the Version History sidebar
    await expect(page.getByText('v1.0.1')).toBeVisible();
    await expect(page.getByText('v1.0.0')).toBeVisible();
    // Latest badge marks v1.0.1
    await expect(page.getByText('Latest')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${v2.id}`);
    await request.delete(`/api/prompts/${v1.id}`);
  });

  test('Step 3 — Keep-version option saves the edit without creating a child', async ({ page, request }) => {
    const promptName = uid('j2-keep');
    const createResp = await request.post('/api/prompts/', {
      data: { name: promptName, content: 'Original content.' },
    });
    const prompt = await createResp.json();

    await page.goto(`/prompts/${prompt.id}/edit`);
    await page.locator('textarea').fill('In-place edit without version bump.');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Choose NOT to bump the version
    await expect(page.getByRole('button', { name: /No, keep version/ })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.getByRole('button', { name: /No, keep version/ }).click();

    // After saving in-place the URL stays at the same prompt
    await page.waitForURL(new RegExp(`/prompts/${prompt.id}$`));
    await expect(page.getByText('v1.0.0')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${prompt.id}`);
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
    await page.waitForURL(/\/prompts\/\d+/);
    v1Id = promptIdFromUrl(page.url());

    // Step 2: Click Edit and bump the version
    await page.getByRole('link', { name: /Edit/ }).click();
    await page.waitForURL(/\/prompts\/\d+\/edit/);
    await page.locator('textarea').fill('Second version — improved phrasing.');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('button', { name: /Yes, bump to/ })).toBeVisible();
    await page.getByRole('button', { name: /Yes, bump to/ }).click();
    await page.waitForURL(/\/prompts\/\d+/);
    v2Id = promptIdFromUrl(page.url());
    expect(v2Id).not.toBe(v1Id);

    // Step 3: Version history sidebar shows both versions, v1.0.1 is Latest
    await expect(page.getByText('v1.0.1')).toBeVisible();
    await expect(page.getByText('v1.0.0')).toBeVisible();
    await expect(page.getByText('Latest')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${v2Id}`);
    await request.delete(`/api/prompts/${v1Id}`);
  });
});

// ── Journey 3: Register an Agent and Track Executions ─────────────────────────
//
// The Agents page lets users register AI agents; prompts can be associated with
// agents so that execution metrics (success rate, avg rating, usage count) are
// aggregated and shown on the Prompt Detail page.

test.describe('UI Journey 3 — Register an Agent and Track Executions', () => {
  test('API Docs page shows the Agent Execution Tracking user journey steps', async ({ page }) => {
    await page.goto('/api-docs');
    await expect(page.getByText('3 · Register an agent and track executions')).toBeVisible();
    await expect(page.getByText('Register an agent')).toBeVisible();
    await expect(page.getByText('Associate the agent with a prompt')).toBeVisible();
    await expect(page.getByText('Record an execution')).toBeVisible();
    await expect(page.getByText('Review agent stats')).toBeVisible();
  });

  test('Step 1 — Register an agent on the Agents management page', async ({ page, request }) => {
    const agentName = uid('j3-agent');

    await page.goto('/agents');
    // Name is the only required text input in the Register Agent form
    await page.locator('input[required]').fill(agentName);
    await page.getByRole('button', { name: /Register/ }).click();

    // The new agent card should appear in the list
    await expect(
      page.locator('[data-testid="agent-card"]').filter({ hasText: agentName })
    ).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Cleanup
    const agents = await fetchList(request, '/api/agents/');
    const agent = agents.find((a: any) => a.name === agentName);
    if (agent) await request.delete(`/api/agents/${agent.id}`);
  });

  test('Step 2 — Create a prompt associated with an agent via the Prompt Editor', async ({ page, request }) => {
    const agentName = uid('j3-assoc-agent');
    const promptName = uid('j3-assoc-prompt');

    // Create the agent via API (already tested in Step 1)
    const agentResp = await request.post('/api/agents/', { data: { name: agentName } });
    const agent = await agentResp.json();

    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(promptName);
    await page.locator('textarea').fill('Support message for the user.');

    // Wait for agent pills to load, then click the agent to associate it
    await expect(page.getByRole('button', { name: agentName })).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.getByRole('button', { name: agentName }).click();

    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+/);
    const promptId = promptIdFromUrl(page.url());

    // The agent should appear in the Agents sidebar on the detail page
    await expect(page.getByText(agentName)).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${promptId}`);
    await request.delete(`/api/agents/${agent.id}`);
  });

  test('Step 3 — Execution stats are visible on the Prompt Detail page', async ({ page, request }) => {
    // Create agent and prompt then record an execution — all via API
    const agentResp = await request.post('/api/agents/', { data: { name: uid('j3-stats-agent') } });
    const agent = await agentResp.json();

    const promptResp = await request.post('/api/prompts/', {
      data: { name: uid('j3-stats-prompt'), content: 'Static content.', agent_ids: [agent.id] },
    });
    const prompt = await promptResp.json();

    await request.post(`/api/prompts/${prompt.id}/executions`, {
      data: { agent_id: agent.id, success: 1, rating: 5 },
    });

    // Navigate to the prompt detail page and verify stats
    await page.goto(`/prompts/${prompt.id}`);
    await expect(page.getByText(prompt.name)).toBeVisible();

    // After 1 execution with rating=5: avg_rating=5.0 shown in the Avg Rating metric badge
    await expect(page.getByText('5.0')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${prompt.id}`);
    await request.delete(`/api/agents/${agent.id}`);
  });

  test('Step 4 — Agents navigation link is visible in the sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /Agents/ })).toBeVisible();
    await page.getByRole('link', { name: /Agents/ }).click();
    await page.waitForURL(/\/agents/);
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  });

  test('Full journey — register agent via UI, associate with prompt, verify stats after execution', async ({ page, request }) => {
    const agentName = uid('j3-full-agent');
    const promptName = uid('j3-full-prompt');
    let promptId: number | null = null;
    let agentId: number | null = null;

    // Step 1: Register agent via the Agents UI
    await page.goto('/agents');
    await page.locator('input[required]').fill(agentName);
    await page.getByRole('button', { name: /Register/ }).click();
    await expect(
      page.locator('[data-testid="agent-card"]').filter({ hasText: agentName })
    ).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

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
    await page.waitForURL(/\/prompts\/\d+/);
    promptId = promptIdFromUrl(page.url());

    // Verify the agent appears in the Agents sidebar on the detail page
    await expect(page.getByText(agentName)).toBeVisible();

    // Step 3: Record an execution via API and reload to verify updated stats in the UI
    await request.post(`/api/prompts/${promptId}/executions`, {
      data: { agent_id: agentId, success: 1, rating: 4 },
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(promptName)).toBeVisible();
    // avg_rating = 4.0 should now appear in the Avg Rating metric badge
    await expect(page.getByText('4.0')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${promptId}`);
    await request.delete(`/api/agents/${agentId}`);
  });
});

// ── Journey 4: Build a Composable Prompt ──────────────────────────────────────
//
// The Prompt Editor's component-search UI lets users embed {{component:<id>}}
// references into a parent prompt.  At render time the backend resolves each
// reference recursively so the output contains the full inline text.

test.describe('UI Journey 4 — Build a Composable Prompt', () => {
  test('API Docs page shows the Composable Prompt user journey steps', async ({ page }) => {
    await page.goto('/api-docs');
    await expect(page.getByText('4 · Build a composable prompt')).toBeVisible();
    await expect(page.getByText('Create a reusable component prompt')).toBeVisible();
    await expect(page.getByText('Reference the component in a parent prompt')).toBeVisible();
    await expect(page.getByText('Render to see the resolved output')).toBeVisible();
  });

  test('Step 1 — Create a component prompt via the Prompt Editor', async ({ page, request }) => {
    const componentName = uid('j4-component');

    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(componentName);
    await page.locator('textarea').fill('Always consult a professional before acting on this advice.');
    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+/);
    const componentId = promptIdFromUrl(page.url());

    await expect(page.getByText(componentName)).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${componentId}`);
  });

  test('Step 2 — Embed a component via the component-search UI in the Prompt Editor', async ({ page, request }) => {
    const componentName = uid('j4-comp');
    const parentName = uid('j4-parent');

    // Create the component prompt via API
    const compResp = await request.post('/api/prompts/', {
      data: { name: componentName, content: 'Reusable disclaimer text.' },
    });
    const comp = await compResp.json();

    // Navigate to the new-prompt page and insert the component via the search UI
    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(parentName);
    await page.locator('textarea').fill('Intro paragraph. ');

    // Type the component name into the search box
    await page.getByPlaceholder(/Search prompts to insert as components/).fill(componentName);

    // Wait for the search result then click Insert
    await expect(page.getByText(componentName).last()).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });
    await page.getByRole('button', { name: 'Insert' }).first().click();

    // The textarea should now contain the {{component:<id>}} reference
    const contentVal = await page.locator('textarea').inputValue();
    expect(contentVal).toContain(`{{component:${comp.id}}}`);

    // Submit the form
    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+/);
    const parentId = promptIdFromUrl(page.url());

    // The component prompt should be listed in the Components sidebar
    await expect(page.getByText(componentName)).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    // Cleanup
    await request.delete(`/api/prompts/${parentId}`);
    await request.delete(`/api/prompts/${comp.id}`);
  });

  test('Step 3 — Render a parent prompt and verify the component content is resolved', async ({ page, request }) => {
    // Create component and parent via API with the component reference baked in
    const compResp = await request.post('/api/prompts/', {
      data: {
        name: uid('j4-render-comp'),
        content: 'Component inline content resolved at render time.',
      },
    });
    const comp = await compResp.json();

    const parentResp = await request.post('/api/prompts/', {
      data: {
        name: uid('j4-render-parent'),
        content: `Information section. {{component:${comp.id}}}`,
      },
    });
    const parent = await parentResp.json();

    // Navigate to the parent detail page and render (no variables required)
    await page.goto(`/prompts/${parent.id}`);
    await expect(page.getByText(parent.name)).toBeVisible();

    // The component name should appear in the Components sidebar
    await expect(page.getByText(comp.name)).toBeVisible({ timeout: VISIBILITY_TIMEOUT_MS });

    await page.getByRole('button', { name: /Render/ }).click();

    // The rendered output contains the component content expanded inline
    await expect(page.getByText('Rendered output:')).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
    await expect(page.getByText('Component inline content resolved at render time.')).toBeVisible();

    // Cleanup
    await request.delete(`/api/prompts/${parent.id}`);
    await request.delete(`/api/prompts/${comp.id}`);
  });

  test('Full journey — create component via UI, embed via search, render resolved output', async ({ page, request }) => {
    const componentName = uid('j4-full-comp');
    const parentName = uid('j4-full-parent');
    let componentId: number | null = null;
    let parentId: number | null = null;

    // Step 1: Create the component prompt via the Prompt Editor UI
    await page.goto('/prompts/new');
    await page.locator('input[required]').first().fill(componentName);
    await page.locator('textarea').fill('Disclaimer: for informational purposes only.');
    await page.getByRole('button', { name: 'Create Prompt' }).click();
    await page.waitForURL(/\/prompts\/\d+/);
    componentId = promptIdFromUrl(page.url());

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
    await page.waitForURL(/\/prompts\/\d+/);
    parentId = promptIdFromUrl(page.url());

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
