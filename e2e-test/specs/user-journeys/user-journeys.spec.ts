// User Journey E2E Tests
// Covers the 4 step-by-step walkthroughs described in the in-app API Documentation page (/api-docs):
//   1. Create and Render a Prompt
//   2. Version a Prompt
//   3. Register an Agent and Track Executions
//   4. Build a Composable Prompt
//
// Each describe block mirrors the exact sequence of API calls shown in the user journey guide
// so these tests serve both as regression coverage and as living documentation.

import { test, expect, APIRequestContext } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function createTag(request: APIRequestContext, name: string, color = '#10B981'): Promise<any> {
  const response = await request.post('/api/tags/', { data: { name, color } });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createAgent(
  request: APIRequestContext,
  payload: { name: string; description?: string; type?: string; status?: string }
): Promise<any> {
  const response = await request.post('/api/agents/', { data: payload });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createPrompt(request: APIRequestContext, payload: Record<string, unknown>): Promise<any> {
  const response = await request.post('/api/prompts/', { data: payload });
  expect(response.status()).toBe(201);
  return response.json();
}

// ── Journey 1: Create and Render a Prompt ─────────────────────────────────────

test.describe('User Journey 1 — Create and Render a Prompt', () => {
  const createdPromptIds: number[] = [];
  const createdTagIds: number[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdPromptIds.reverse()) {
      await request.delete(`/api/prompts/${id}`);
    }
    createdPromptIds.length = 0;
    for (const id of createdTagIds) {
      await request.delete(`/api/tags/${id}`);
    }
    createdTagIds.length = 0;
  });

  test('Step 1 — Create a tag', async ({ request }) => {
    const tag = await createTag(request, uniqueName('journey1-tag'));
    createdTagIds.push(tag.id);

    expect(tag).toHaveProperty('id');
    expect(tag.color).toBe('#10B981');
  });

  test('Step 2 — Create a prompt with typed variables', async ({ request }) => {
    const tag = await createTag(request, uniqueName('journey1-tag'));
    createdTagIds.push(tag.id);

    const prompt = await createPrompt(request, {
      name: uniqueName('customer-greeting'),
      description: 'Generates a personalised greeting.',
      content: 'Hello, {{user_name}}! Welcome to {{platform}}.',
      version: '1.0.0',
      variables: [
        { name: 'user_name', type: 'string', required: true, description: "User's first name." },
        { name: 'platform', type: 'string', required: false, default: 'our platform', description: 'Platform name.' },
      ],
      tag_ids: [tag.id],
    });
    createdPromptIds.push(prompt.id);

    expect(prompt).toHaveProperty('id');
    expect(prompt.version).toBe('1.0.0');
    expect(prompt.is_latest).toBe(true);
    expect(Array.isArray(prompt.variables)).toBe(true);
    expect(prompt.variables).toHaveLength(2);
    expect(prompt.tags).toHaveLength(1);
    expect(prompt.tags[0].id).toBe(tag.id);
  });

  test('Step 3 — Render the prompt with all variable values supplied', async ({ request }) => {
    const prompt = await createPrompt(request, {
      name: uniqueName('greeting-render'),
      content: 'Hello, {{user_name}}! Welcome to {{platform}}.',
      variables: [
        { name: 'user_name', type: 'string', required: true },
        { name: 'platform', type: 'string', required: false, default: 'our platform' },
      ],
    });
    createdPromptIds.push(prompt.id);

    const renderResponse = await request.post(`/api/prompts/${prompt.id}/render`, {
      data: { variables: { user_name: 'Alice', platform: 'PromptHub' } },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toBe('Hello, Alice! Welcome to PromptHub.');
    expect(body.variables_used).toContain('user_name');
    expect(body.variables_used).toContain('platform');
    expect(Array.isArray(body.components_resolved)).toBe(true);
    expect(body.components_resolved).toHaveLength(0);
  });

  test('Step 3a — Render uses variable default when optional variable omitted', async ({ request }) => {
    const prompt = await createPrompt(request, {
      name: uniqueName('greeting-default'),
      content: 'Hello, {{user_name}}! Welcome to {{platform}}.',
      variables: [
        { name: 'user_name', type: 'string', required: true },
        { name: 'platform', type: 'string', required: false, default: 'our platform' },
      ],
    });
    createdPromptIds.push(prompt.id);

    const renderResponse = await request.post(`/api/prompts/${prompt.id}/render`, {
      data: { variables: { user_name: 'Bob' } },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('our platform');
  });

  test('Step 3b — Render returns 422 when a required variable is missing', async ({ request }) => {
    const prompt = await createPrompt(request, {
      name: uniqueName('greeting-required-check'),
      content: 'Hello, {{user_name}}!',
      variables: [{ name: 'user_name', type: 'string', required: true }],
    });
    createdPromptIds.push(prompt.id);

    const renderResponse = await request.post(`/api/prompts/${prompt.id}/render`, {
      data: { variables: {} },
    });
    expect(renderResponse.status()).toBe(422);
  });

  test('Full journey — tag → prompt → render (happy path)', async ({ request }) => {
    // Step 1: create tag
    const tag = await createTag(request, uniqueName('journey1-full-tag'));
    createdTagIds.push(tag.id);

    // Step 2: create prompt
    const prompt = await createPrompt(request, {
      name: uniqueName('full-greeting'),
      description: 'Full journey greeting prompt.',
      content: 'Hi {{user_name}}, thanks for using {{platform}}!',
      variables: [
        { name: 'user_name', type: 'string', required: true },
        { name: 'platform', type: 'string', required: false, default: 'Open Prompt Manager' },
      ],
      tag_ids: [tag.id],
    });
    createdPromptIds.push(prompt.id);

    expect(prompt.is_latest).toBe(true);
    expect(prompt.usage_count).toBe(0);

    // Step 3: render
    const renderResponse = await request.post(`/api/prompts/${prompt.id}/render`, {
      data: { variables: { user_name: 'Carol', platform: 'PromptHub' } },
    });
    expect(renderResponse.status()).toBe(200);

    const renderBody = await renderResponse.json();
    expect(renderBody.rendered_content).toBe('Hi Carol, thanks for using PromptHub!');
    expect(renderBody.variables_used).toContain('user_name');
    expect(renderBody.variables_used).toContain('platform');
  });
});

// ── Journey 2: Version a Prompt ───────────────────────────────────────────────

test.describe('User Journey 2 — Version a Prompt', () => {
  const createdPromptIds: number[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdPromptIds.reverse()) {
      await request.delete(`/api/prompts/${id}`);
    }
    createdPromptIds.length = 0;
  });

  test('Step 1 — Create the root prompt (v1.0.0)', async ({ request }) => {
    const prompt = await createPrompt(request, {
      name: uniqueName('versioned-prompt'),
      content: 'Hello, {{user_name}}! Welcome to {{platform}}.',
      version: '1.0.0',
    });
    createdPromptIds.push(prompt.id);

    expect(prompt.version).toBe('1.0.0');
    expect(prompt.is_latest).toBe(true);
    expect(prompt.parent_id).toBeNull();
  });

  test('Step 2 — Create a new version (auto-increments to v1.0.1)', async ({ request }) => {
    const root = await createPrompt(request, {
      name: uniqueName('versioned-root'),
      content: 'Hello, {{user_name}}!',
      version: '1.0.0',
    });
    createdPromptIds.push(root.id);

    const versionResponse = await request.post(`/api/prompts/${root.id}/versions`, {
      data: { content: 'Hi {{user_name}}, glad to have you!', description: 'Friendlier tone.' },
    });
    expect(versionResponse.status()).toBe(201);

    const v2 = await versionResponse.json();
    createdPromptIds.push(v2.id);

    expect(v2.version).toBe('1.0.1');
    expect(v2.parent_id).toBe(root.id);
    expect(v2.is_latest).toBe(true);
    expect(v2.content).toBe('Hi {{user_name}}, glad to have you!');
  });

  test('Step 2a — Create a version with an explicit version string', async ({ request }) => {
    const root = await createPrompt(request, {
      name: uniqueName('versioned-explicit'),
      content: 'Original content.',
      version: '1.0.0',
    });
    createdPromptIds.push(root.id);

    const versionResponse = await request.post(`/api/prompts/${root.id}/versions`, {
      data: { version: '2.0.0', description: 'Major rewrite.' },
    });
    expect(versionResponse.status()).toBe(201);

    const v2 = await versionResponse.json();
    createdPromptIds.push(v2.id);

    expect(v2.version).toBe('2.0.0');
    expect(v2.parent_id).toBe(root.id);
  });

  test('Step 3 — is_latest flag updates correctly after versioning', async ({ request }) => {
    const root = await createPrompt(request, {
      name: uniqueName('versioned-is-latest'),
      content: 'Version 1 content.',
      version: '1.0.0',
    });
    createdPromptIds.push(root.id);

    // Root is latest initially
    const rootDetail = await (await request.get(`/api/prompts/${root.id}`)).json();
    expect(rootDetail.is_latest).toBe(true);

    // Create new version
    const newVersionResponse = await request.post(`/api/prompts/${root.id}/versions`, {
      data: { content: 'Version 2 content.' },
    });
    expect(newVersionResponse.status()).toBe(201);
    const v2 = await newVersionResponse.json();
    createdPromptIds.push(v2.id);

    // Root is no longer latest
    const updatedRoot = await (await request.get(`/api/prompts/${root.id}`)).json();
    expect(updatedRoot.is_latest).toBe(false);

    // New version is latest
    expect(v2.is_latest).toBe(true);
  });

  test('Step 4 — Retrieve full version history', async ({ request }) => {
    const root = await createPrompt(request, {
      name: uniqueName('version-history-root'),
      content: 'Root content.',
      version: '1.0.0',
    });
    createdPromptIds.push(root.id);

    // Create a linear chain: root → v2 → v3
    const v2Res = await request.post(`/api/prompts/${root.id}/versions`, { data: {} });
    const v2 = await v2Res.json();
    createdPromptIds.push(v2.id);

    const v3Res = await request.post(`/api/prompts/${v2.id}/versions`, { data: {} });
    const v3 = await v3Res.json();
    createdPromptIds.push(v3.id);

    const versionsResponse = await request.get(`/api/prompts/${root.id}/versions`);
    expect(versionsResponse.status()).toBe(200);

    const versions = await versionsResponse.json();
    expect(Array.isArray(versions)).toBe(true);
    expect(versions).toHaveLength(3); // root + v2 + v3

    const byId = Object.fromEntries(versions.map((v: any) => [v.id, v]));
    expect(byId[root.id].is_latest).toBe(false);
    expect(byId[v2.id].is_latest).toBe(false);
    expect(byId[v3.id].is_latest).toBe(true);
  });

  test('Full journey — root → v1.0.1 → v2.0.0 → history check', async ({ request }) => {
    // Create root
    const root = await createPrompt(request, {
      name: uniqueName('full-version-journey'),
      content: 'v1 content.',
      version: '1.0.0',
    });
    createdPromptIds.push(root.id);
    expect(root.is_latest).toBe(true);

    // Bump to v1.0.1
    const v101Res = await request.post(`/api/prompts/${root.id}/versions`, {
      data: { content: 'v1.0.1 content.', description: 'Minor improvement.' },
    });
    const v101 = await v101Res.json();
    createdPromptIds.push(v101.id);
    expect(v101.version).toBe('1.0.1');

    // Bump to v2.0.0
    const v200Res = await request.post(`/api/prompts/${v101.id}/versions`, {
      data: { content: 'v2 major rewrite.', version: '2.0.0' },
    });
    const v200 = await v200Res.json();
    createdPromptIds.push(v200.id);
    expect(v200.version).toBe('2.0.0');
    expect(v200.is_latest).toBe(true);

    // History contains all 3
    const versionsRes = await request.get(`/api/prompts/${root.id}/versions`);
    const versions = await versionsRes.json();
    expect(versions).toHaveLength(3);
  });
});

// ── Journey 3: Register an Agent and Track Executions ─────────────────────────

test.describe('User Journey 3 — Register an Agent and Track Executions', () => {
  const createdPromptIds: number[] = [];
  const createdAgentIds: number[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdPromptIds.reverse()) {
      await request.delete(`/api/prompts/${id}`);
    }
    createdPromptIds.length = 0;
    for (const id of createdAgentIds) {
      await request.delete(`/api/agents/${id}`);
    }
    createdAgentIds.length = 0;
  });

  test('Step 1 — Register an agent', async ({ request }) => {
    const agent = await createAgent(request, {
      name: uniqueName('support-bot'),
      description: 'Handles tier-1 customer support queries.',
      type: 'chatbot',
      status: 'active',
    });
    createdAgentIds.push(agent.id);

    expect(agent).toHaveProperty('id');
    expect(agent.status).toBe('active');
    expect(agent).toHaveProperty('created_at');
  });

  test('Step 2 — Associate the agent with a prompt', async ({ request }) => {
    const agent = await createAgent(request, { name: uniqueName('assoc-agent') });
    createdAgentIds.push(agent.id);

    const prompt = await createPrompt(request, {
      name: uniqueName('agent-prompt'),
      content: 'Hello, {{user_name}}!',
      variables: [{ name: 'user_name', type: 'string', required: true }],
    });
    createdPromptIds.push(prompt.id);

    // Associate agent via PUT
    const updateResponse = await request.put(`/api/prompts/${prompt.id}`, {
      data: { agent_ids: [agent.id] },
    });
    expect(updateResponse.status()).toBe(200);

    const updatedPrompt = await updateResponse.json();
    expect(updatedPrompt.agents.some((a: any) => a.id === agent.id)).toBe(true);
  });

  test('Step 3 — Record a successful execution and verify prompt stats update', async ({ request }) => {
    const agent = await createAgent(request, { name: uniqueName('tracking-agent') });
    createdAgentIds.push(agent.id);

    const prompt = await createPrompt(request, {
      name: uniqueName('execution-prompt'),
      content: 'Hello, {{user_name}}!',
      agent_ids: [agent.id],
    });
    createdPromptIds.push(prompt.id);

    // Initial stats are zero
    const initialDetail = await (await request.get(`/api/prompts/${prompt.id}`)).json();
    expect(initialDetail.usage_count).toBe(0);
    expect(initialDetail.avg_rating).toBe(0);

    // Record a successful execution
    const execResponse = await request.post(`/api/prompts/${prompt.id}/executions`, {
      data: {
        agent_id: agent.id,
        input_variables: { user_name: 'Alice' },
        rendered_prompt: 'Hello, Alice!',
        response: 'Hi there, Alice!',
        execution_time_ms: 340,
        token_count: 64,
        cost: 0.0004,
        success: 1,
        rating: 5,
      },
    });
    expect(execResponse.status()).toBe(201);

    const execution = await execResponse.json();
    expect(execution.prompt_id).toBe(prompt.id);
    expect(execution.agent_id).toBe(agent.id);
    expect(execution.rating).toBe(5);
    expect(execution.success).toBe(1);
    expect(execution).toHaveProperty('timestamp');

    // Stats should be updated
    const updatedDetail = await (await request.get(`/api/prompts/${prompt.id}`)).json();
    expect(updatedDetail.usage_count).toBe(1);
    expect(updatedDetail.avg_rating).toBe(5);
    expect(updatedDetail.success_rate).toBe(1);
  });

  test('Step 3a — Multiple executions update aggregate stats correctly', async ({ request }) => {
    const prompt = await createPrompt(request, {
      name: uniqueName('stats-prompt'),
      content: 'Test content.',
    });
    createdPromptIds.push(prompt.id);

    // 3 executions: 2 success (ratings 4, 2), 1 failure (no rating)
    await request.post(`/api/prompts/${prompt.id}/executions`, { data: { success: 1, rating: 4 } });
    await request.post(`/api/prompts/${prompt.id}/executions`, { data: { success: 1, rating: 2 } });
    await request.post(`/api/prompts/${prompt.id}/executions`, { data: { success: 0 } });

    const detail = await (await request.get(`/api/prompts/${prompt.id}`)).json();
    expect(detail.usage_count).toBe(3);
    expect(Math.abs(detail.avg_rating - 3.0)).toBeLessThan(0.01); // (4+2)/2 = 3
    expect(Math.abs(detail.success_rate - 2 / 3)).toBeLessThan(0.01);
  });

  test('Step 4 — Retrieve execution history', async ({ request }) => {
    const prompt = await createPrompt(request, {
      name: uniqueName('exec-history-prompt'),
      content: 'Static content.',
    });
    createdPromptIds.push(prompt.id);

    await request.post(`/api/prompts/${prompt.id}/executions`, { data: { success: 1 } });
    await request.post(`/api/prompts/${prompt.id}/executions`, { data: { success: 1 } });

    const execsResponse = await request.get(`/api/prompts/${prompt.id}/executions`);
    expect(execsResponse.status()).toBe(200);

    const execs = await execsResponse.json();
    expect(Array.isArray(execs)).toBe(true);
    expect(execs).toHaveLength(2);
  });

  test('Step 5 — Agent detail endpoint returns aggregate execution stats', async ({ request }) => {
    const agent = await createAgent(request, { name: uniqueName('stats-agent') });
    createdAgentIds.push(agent.id);

    const prompt = await createPrompt(request, {
      name: uniqueName('agent-stats-prompt'),
      content: 'Content.',
      agent_ids: [agent.id],
    });
    createdPromptIds.push(prompt.id);

    await request.post(`/api/prompts/${prompt.id}/executions`, {
      data: { agent_id: agent.id, success: 1, rating: 4 },
    });
    await request.post(`/api/prompts/${prompt.id}/executions`, {
      data: { agent_id: agent.id, success: 1, rating: 2 },
    });

    const agentDetail = await (await request.get(`/api/agents/${agent.id}`)).json();
    expect(agentDetail).toHaveProperty('execution_count');
    expect(agentDetail).toHaveProperty('success_rate');
    expect(agentDetail).toHaveProperty('avg_rating');
    expect(agentDetail.execution_count).toBe(2);
    expect(agentDetail.success_rate).toBe(1);
    expect(Math.abs(agentDetail.avg_rating - 3.0)).toBeLessThan(0.01);
  });

  test('Full journey — agent → prompt → 2 executions → stats verified', async ({ request }) => {
    // Register agent
    const agent = await createAgent(request, {
      name: uniqueName('full-journey-agent'),
      description: 'Support bot for full journey test.',
      type: 'chatbot',
      status: 'active',
    });
    createdAgentIds.push(agent.id);

    // Create prompt associated with agent
    const prompt = await createPrompt(request, {
      name: uniqueName('full-journey-prompt'),
      content: 'Hello, {{user_name}}!',
      variables: [{ name: 'user_name', type: 'string', required: true }],
      agent_ids: [agent.id],
    });
    createdPromptIds.push(prompt.id);

    // Record two executions
    await request.post(`/api/prompts/${prompt.id}/executions`, {
      data: {
        agent_id: agent.id,
        input_variables: { user_name: 'Alice' },
        rendered_prompt: 'Hello, Alice!',
        execution_time_ms: 200,
        token_count: 32,
        success: 1,
        rating: 5,
      },
    });
    await request.post(`/api/prompts/${prompt.id}/executions`, {
      data: {
        agent_id: agent.id,
        input_variables: { user_name: 'Bob' },
        rendered_prompt: 'Hello, Bob!',
        execution_time_ms: 350,
        token_count: 30,
        success: 0,
      },
    });

    // Verify prompt stats
    const promptDetail = await (await request.get(`/api/prompts/${prompt.id}`)).json();
    expect(promptDetail.usage_count).toBe(2);
    expect(Math.abs(promptDetail.success_rate - 0.5)).toBeLessThan(0.01);
    expect(promptDetail.avg_rating).toBe(5);

    // Verify agent stats
    const agentDetail = await (await request.get(`/api/agents/${agent.id}`)).json();
    expect(agentDetail.execution_count).toBe(2);
    expect(Math.abs(agentDetail.success_rate - 0.5)).toBeLessThan(0.01);
  });
});

// ── Journey 4: Build a Composable Prompt ──────────────────────────────────────

test.describe('User Journey 4 — Build a Composable Prompt', () => {
  const createdPromptIds: number[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdPromptIds.reverse()) {
      await request.delete(`/api/prompts/${id}`);
    }
    createdPromptIds.length = 0;
  });

  test('Step 1 — Create a reusable component prompt', async ({ request }) => {
    const component = await createPrompt(request, {
      name: uniqueName('safety-disclaimer'),
      content: 'Always consult a professional before acting on this advice.',
      variables: [],
    });
    createdPromptIds.push(component.id);

    expect(component).toHaveProperty('id');
    expect(component.content).toBe('Always consult a professional before acting on this advice.');
  });

  test('Step 2 — Create a parent prompt that embeds the component via {{component:<id>}}', async ({ request }) => {
    const component = await createPrompt(request, {
      name: uniqueName('comp-reusable'),
      content: 'Always consult a professional before acting on this advice.',
      variables: [],
    });
    createdPromptIds.push(component.id);

    const parent = await createPrompt(request, {
      name: uniqueName('medical-advice-bot'),
      content: `Here is information about {{topic}}.\n\n{{component:${component.id}}}`,
      variables: [{ name: 'topic', type: 'string', required: true }],
    });
    createdPromptIds.push(parent.id);

    expect(parent).toHaveProperty('id');
    expect(parent.content).toContain(`{{component:${component.id}}}`);
  });

  test('Step 3 — Render resolves the component reference inline', async ({ request }) => {
    const component = await createPrompt(request, {
      name: uniqueName('comp-disclaimer'),
      content: 'Always consult a professional.',
      variables: [],
    });
    createdPromptIds.push(component.id);

    const parent = await createPrompt(request, {
      name: uniqueName('parent-with-component'),
      content: `Info about {{topic}}.\n\n{{component:${component.id}}}`,
      variables: [{ name: 'topic', type: 'string', required: true }],
    });
    createdPromptIds.push(parent.id);

    const renderResponse = await request.post(`/api/prompts/${parent.id}/render`, {
      data: { variables: { topic: 'blood pressure' } },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('blood pressure');
    expect(body.rendered_content).toContain('Always consult a professional.');
    expect(body.components_resolved).toContain(component.id);
  });

  test('Step 3a — Render with deeply nested components (3 levels)', async ({ request }) => {
    const leaf = await createPrompt(request, {
      name: uniqueName('leaf'),
      content: 'Leaf content.',
      variables: [],
    });
    createdPromptIds.push(leaf.id);

    const middle = await createPrompt(request, {
      name: uniqueName('middle'),
      content: `Middle wraps leaf: {{component:${leaf.id}}}`,
      variables: [],
    });
    createdPromptIds.push(middle.id);

    const top = await createPrompt(request, {
      name: uniqueName('top'),
      content: `Top wraps middle: {{component:${middle.id}}}`,
      variables: [],
    });
    createdPromptIds.push(top.id);

    const renderResponse = await request.post(`/api/prompts/${top.id}/render`, {
      data: { variables: {} },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('Leaf content.');
    expect(body.components_resolved).toContain(leaf.id);
    expect(body.components_resolved).toContain(middle.id);
  });

  test('Step 3b — Render with multiple sibling component references in one prompt', async ({ request }) => {
    const compA = await createPrompt(request, {
      name: uniqueName('comp-a'),
      content: 'Component A content.',
      variables: [],
    });
    createdPromptIds.push(compA.id);

    const compB = await createPrompt(request, {
      name: uniqueName('comp-b'),
      content: 'Component B content.',
      variables: [],
    });
    createdPromptIds.push(compB.id);

    const parent = await createPrompt(request, {
      name: uniqueName('parent-multi-comp'),
      content: `Intro. {{component:${compA.id}}} Middle. {{component:${compB.id}}} End.`,
      variables: [],
    });
    createdPromptIds.push(parent.id);

    const renderResponse = await request.post(`/api/prompts/${parent.id}/render`, {
      data: { variables: {} },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('Component A content.');
    expect(body.rendered_content).toContain('Component B content.');
    expect(body.components_resolved).toContain(compA.id);
    expect(body.components_resolved).toContain(compB.id);
  });

  test('Step 4 — Circular component reference is rejected with 422', async ({ request }) => {
    // Create prompt A then make it reference itself
    const a = await createPrompt(request, {
      name: uniqueName('self-ref-a'),
      content: 'placeholder',
      variables: [],
    });
    createdPromptIds.push(a.id);

    // Update content to reference itself
    await request.put(`/api/prompts/${a.id}`, {
      data: { content: `{{component:${a.id}}}` },
    });

    const renderResponse = await request.post(`/api/prompts/${a.id}/render`, {
      data: { variables: {} },
    });
    expect(renderResponse.status()).toBe(422);
  });

  test('Full journey — component → parent → render with variable + component resolution', async ({ request }) => {
    // Step 1: create reusable component
    const disclaimer = await createPrompt(request, {
      name: uniqueName('full-disclaimer'),
      content: 'Disclaimer: This is for informational purposes only.',
      variables: [],
    });
    createdPromptIds.push(disclaimer.id);

    // Step 2: create parent prompt referencing the component
    const parent = await createPrompt(request, {
      name: uniqueName('full-parent'),
      content: `Information about {{topic}}.\n\n{{component:${disclaimer.id}}}`,
      variables: [{ name: 'topic', type: 'string', required: true }],
    });
    createdPromptIds.push(parent.id);

    // Step 3: render
    const renderResponse = await request.post(`/api/prompts/${parent.id}/render`, {
      data: { variables: { topic: 'artificial intelligence' } },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('artificial intelligence');
    expect(body.rendered_content).toContain('Disclaimer: This is for informational purposes only.');
    expect(body.variables_used).toContain('topic');
    expect(body.components_resolved).toContain(disclaimer.id);
  });
});
