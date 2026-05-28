// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, APIRequestContext } from '@playwright/test';

const NON_EXISTENT_PROMPT_ID = 99999;
const STRONG_PASSWORD = 'Test@1234Secure!';

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

function uniqueEmail(prefix = 'prompts-api-test'): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}@opm-test.io`;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function createAgent(request: APIRequestContext, accessToken: string, namePrefix: string): Promise<{ id: number }> {
  const response = await request.post('/api/agents/', {
    data: {
      name: uniqueName(namePrefix),
      description: 'Agent for prompt API tests',
    },
    headers: authHeaders(accessToken),
  });

  expect(response.status()).toBe(201);
  return response.json();
}

async function createTag(request: APIRequestContext, accessToken: string, namePrefix: string, color: string): Promise<{ id: number }> {
  const response = await request.post('/api/tags/', {
    data: {
      name: uniqueName(namePrefix),
      color,
    },
    headers: authHeaders(accessToken),
  });

  expect(response.status()).toBe(201);
  return response.json();
}

async function createPrompt(
  request: APIRequestContext,
  accessToken: string,
  payload: {
    name: string;
    content: string;
    description?: string;
    version?: string;
    agent_ids?: number[];
    tag_ids?: number[];
  }
): Promise<any> {
  const response = await request.post('/api/prompts/', {
    data: payload,
    headers: authHeaders(accessToken),
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('Prompts API Tests', () => {
  let createdPromptIds: number[];
  let createdTagIds: number[];
  let createdAgentIds: number[];
  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    const email = uniqueEmail();
    await request.post('/auth/register', { data: { email, password: STRONG_PASSWORD } });
    const loginResponse = await request.post('/auth/login', { data: { email, password: STRONG_PASSWORD } });
    expect(loginResponse.status()).toBe(200);
    const loginBody = await loginResponse.json();
    accessToken = loginBody.access_token;
  });

  test.beforeEach(async () => {
    createdPromptIds = [];
    createdTagIds = [];
    createdAgentIds = [];
  });

  test.afterEach(async ({ request }) => {
    for (const promptId of createdPromptIds) {
      const response = await request.delete(`/api/prompts/${promptId}`, { headers: authHeaders(accessToken) });
      expect([204, 404]).toContain(response.status());
    }

    for (const tagId of createdTagIds) {
      const response = await request.delete(`/api/tags/${tagId}`, { headers: authHeaders(accessToken) });
      expect([204, 404]).toContain(response.status());
    }

    for (const agentId of createdAgentIds) {
      const response = await request.delete(`/api/agents/${agentId}`, { headers: authHeaders(accessToken) });
      expect([204, 404]).toContain(response.status());
    }
  });

  test('Prompts - Create Prompt Successfully', async ({ request }) => {
    const prompt = await createPrompt(request, accessToken, {
      name: uniqueName('test-prompt'),
      content: 'This is a test prompt with {{variable}}',
      description: 'Test description',
    });
    createdPromptIds.push(prompt.id);

    expect(prompt).toHaveProperty('id');
    expect(prompt).toHaveProperty('name');
    expect(prompt).toHaveProperty('content');
    expect(prompt).toHaveProperty('description');
    expect(prompt).toHaveProperty('created_at');
    expect(prompt).toHaveProperty('updated_at');
    expect(prompt).toHaveProperty('version');
    expect(prompt.version).toBe('1.0.0');
    expect(Array.isArray(prompt.tags)).toBe(true);
    expect(prompt.tags.length).toBe(0);
  });

  test('Prompts - Create Prompt with Missing Required Fields', async ({ request }) => {
    const missingNameResponse = await request.post('/api/prompts/', {
      data: {
        content: 'Content without a name',
        description: 'Test description',
      },
      headers: authHeaders(accessToken),
    });
    expect(missingNameResponse.status()).toBe(422);
    expect(JSON.stringify((await missingNameResponse.json()).detail).toLowerCase()).toContain('name');

    const missingContentResponse = await request.post('/api/prompts/', {
      data: {
        name: uniqueName('prompt-without-content'),
        description: 'Test description',
      },
      headers: authHeaders(accessToken),
    });
    expect(missingContentResponse.status()).toBe(422);
    expect(JSON.stringify((await missingContentResponse.json()).detail).toLowerCase()).toContain('content');
  });

  test('Prompts - Create Prompt with Agent and Tags', async ({ request }) => {
    const agent = await createAgent(request, accessToken, 'relationship-agent');
    const tag = await createTag(request, accessToken, 'relationship-tag', '#8844FF');
    createdAgentIds.push(agent.id);
    createdTagIds.push(tag.id);

    const prompt = await createPrompt(request, accessToken, {
      name: uniqueName('prompt-with-relationships'),
      content: 'Content for relationship prompt',
      description: 'Testing relationships',
      agent_ids: [agent.id],
      tag_ids: [tag.id],
    });
    createdPromptIds.push(prompt.id);

    expect(Array.isArray(prompt.agents)).toBe(true);
    expect(prompt.agents.length).toBe(1);
    expect(prompt.agents[0].id).toBe(agent.id);
    expect(Array.isArray(prompt.tags)).toBe(true);
    expect(prompt.tags.length).toBe(1);
    expect(prompt.tags[0].id).toBe(tag.id);
  });

  test('Prompts - Delete Prompt Successfully', async ({ request }) => {
    const prompt = await createPrompt(request, accessToken, {
      name: uniqueName('prompt-to-delete'),
      content: 'This prompt will be deleted',
      description: 'Delete test',
    });
    createdPromptIds.push(prompt.id);

    const deleteResponse = await request.delete(`/api/prompts/${prompt.id}`, { headers: authHeaders(accessToken) });
    expect(deleteResponse.status()).toBe(204);

    const getResponse = await request.get(`/api/prompts/${prompt.id}`, { headers: authHeaders(accessToken) });
    expect(getResponse.status()).toBe(404);
  });

  test('Prompts - Get All Prompts', async ({ request }) => {
    const response = await request.get('/api/prompts/', { headers: authHeaders(accessToken) });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('Prompts - Get Prompt by ID', async ({ request }) => {
    const prompt = await createPrompt(request, accessToken, {
      name: uniqueName('prompt-to-retrieve'),
      content: 'Content for retrieval test',
      description: 'Retrieval test description',
    });
    createdPromptIds.push(prompt.id);

    const getResponse = await request.get(`/api/prompts/${prompt.id}`, { headers: authHeaders(accessToken) });
    expect(getResponse.status()).toBe(200);

    const body = await getResponse.json();
    expect(body.id).toBe(prompt.id);
    expect(body.name).toBe(prompt.name);
    expect(body.content).toBe('Content for retrieval test');
    expect(body.description).toBe('Retrieval test description');
  });

  test('Prompts - Get Non-existent Prompt', async ({ request }) => {
    const response = await request.get(`/api/prompts/${NON_EXISTENT_PROMPT_ID}`, { headers: authHeaders(accessToken) });
    expect(response.status()).toBe(404);
  });

  test('Prompts - Get Prompts with Agent Filter', async ({ request }) => {
    const agent = await createAgent(request, accessToken, 'filter-agent');
    createdAgentIds.push(agent.id);

    const agentPrompt = await createPrompt(request, accessToken, {
      name: uniqueName('agent-prompt'),
      content: 'Content for agent prompt',
      description: 'Prompt associated with agent',
      agent_ids: [agent.id],
    });
    const noAgentPrompt = await createPrompt(request, accessToken, {
      name: uniqueName('no-agent-prompt'),
      content: 'Content for no-agent prompt',
      description: 'Prompt without agent',
    });
    createdPromptIds.push(agentPrompt.id, noAgentPrompt.id);

    const filterResponse = await request.get(`/api/prompts/?agent_id=${agent.id}`, { headers: authHeaders(accessToken) });
    expect(filterResponse.status()).toBe(200);

    const body = await filterResponse.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const prompt of body) {
      expect(prompt.agents.some((a: { id: number }) => a.id === agent.id)).toBe(true);
    }
  });

  test('Prompts - Get All Prompts with Pagination', async ({ request }) => {
    const createdIds: number[] = [];
    for (let i = 1; i <= 15; i++) {
      const created = await createPrompt(request, accessToken, {
        name: uniqueName(`pagination-prompt-${i}`),
        content: `Content for pagination test prompt ${i}`,
        description: `Description ${i}`,
      });
      createdIds.push(created.id);
    }
    createdPromptIds.push(...createdIds);

    const page1Response = await request.get('/api/prompts/?skip=0&limit=10', { headers: authHeaders(accessToken) });
    expect(page1Response.status()).toBe(200);
    const page1Body = await page1Response.json();
    expect(page1Body.length).toBe(10);

    const page2Response = await request.get('/api/prompts/?skip=10&limit=10', { headers: authHeaders(accessToken) });
    expect(page2Response.status()).toBe(200);
    const page2Body = await page2Response.json();
    expect(page2Body.length).toBeGreaterThanOrEqual(5);
  });

  test('Prompts - Get Prompts with Tag Filter', async ({ request }) => {
    const tag = await createTag(request, accessToken, 'filter-tag', '#FF0000');
    createdTagIds.push(tag.id);

    const taggedPrompt = await createPrompt(request, accessToken, {
      name: uniqueName('tagged-prompt'),
      content: 'Content with tag',
      description: 'This prompt has a tag',
      tag_ids: [tag.id],
    });
    const untaggedPrompt = await createPrompt(request, accessToken, {
      name: uniqueName('untagged-prompt'),
      content: 'Content without tag',
      description: 'This prompt has no tag',
    });
    createdPromptIds.push(taggedPrompt.id, untaggedPrompt.id);

    const filterResponse = await request.get(`/api/prompts/?tag_id=${tag.id}`, { headers: authHeaders(accessToken) });
    expect(filterResponse.status()).toBe(200);

    const body = await filterResponse.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const prompt of body) {
      expect(prompt.tags.some((t: { id: number }) => t.id === tag.id)).toBe(true);
    }
  });

  test('Prompts - Get Prompts with Title Filter', async ({ request }) => {
    const token = uniqueName('unique-filter').toLowerCase();

    const uniquePrompt = await createPrompt(request, accessToken, {
      name: `${token}-prompt`,
      content: 'Content for the unique prompt',
      description: 'A uniquely named prompt',
    });
    const otherPrompt = await createPrompt(request, accessToken, {
      name: uniqueName('regular-prompt'),
      content: 'Content for regular prompt',
      description: 'A regular prompt',
    });
    createdPromptIds.push(uniquePrompt.id, otherPrompt.id);

    const filterResponse = await request.get(`/api/prompts/?search=${token}`, { headers: authHeaders(accessToken) });
    expect(filterResponse.status()).toBe(200);

    const body = await filterResponse.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const prompt of body) {
      expect(prompt.name.toLowerCase()).toContain(token);
    }
  });

  test('Prompts - Render Non-existent Prompt', async ({ request }) => {
    const response = await request.post(`/api/prompts/${NON_EXISTENT_PROMPT_ID}/render`, {
      data: { variables: {} },
      headers: authHeaders(accessToken),
    });

    expect(response.status()).toBe(404);
  });

  test('Prompts - Render Prompt Without Variables', async ({ request }) => {
    const prompt = await createPrompt(request, accessToken, {
      name: uniqueName('static-prompt'),
      content: 'This is a static prompt with no variables.',
      description: 'Static content test',
    });
    createdPromptIds.push(prompt.id);

    const renderResponse = await request.post(`/api/prompts/${prompt.id}/render`, {
      data: { variables: {} },
      headers: authHeaders(accessToken),
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toBe('This is a static prompt with no variables.');
    expect(Array.isArray(body.variables_used)).toBe(true);
    expect(body.variables_used.length).toBe(0);
    expect(Array.isArray(body.components_resolved)).toBe(true);
    expect(body.components_resolved.length).toBe(0);
  });

  test('Prompts - Render Prompt with Component References', async ({ request }) => {
    const componentPrompt = await createPrompt(request, accessToken, {
      name: uniqueName('base-component'),
      content: 'Base component content',
      description: 'A reusable component',
    });
    createdPromptIds.push(componentPrompt.id);

    const mainPrompt = await createPrompt(request, accessToken, {
      name: uniqueName('main-prompt-with-component'),
      content: `Main content {{component:${componentPrompt.id}}}`,
      description: 'Prompt that uses a component',
    });
    createdPromptIds.push(mainPrompt.id);

    const renderResponse = await request.post(`/api/prompts/${mainPrompt.id}/render`, {
      data: { variables: {} },
      headers: authHeaders(accessToken),
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('Base component content');
    expect(body.components_resolved).toContain(componentPrompt.id);
  });

  test('Prompts - Render Prompt with Variables', async ({ request }) => {
    const prompt = await createPrompt(request, accessToken, {
      name: uniqueName('variable-render-prompt'),
      content: 'Hello {{name}}, welcome to {{place}}!',
      description: 'Prompt with variables',
    });
    createdPromptIds.push(prompt.id);

    const renderResponse = await request.post(`/api/prompts/${prompt.id}/render`, {
      data: {
        variables: { name: 'John', place: 'OpenAI' },
      },
      headers: authHeaders(accessToken),
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toBe('Hello John, welcome to OpenAI!');
    expect(body.variables_used).toContain('name');
    expect(body.variables_used).toContain('place');
    expect(Array.isArray(body.components_resolved)).toBe(true);
  });

  test('Prompts - Update Prompt Successfully', async ({ request }) => {
    const prompt = await createPrompt(request, accessToken, {
      name: uniqueName('original-prompt-name'),
      content: 'Original prompt content',
      description: 'Original description',
    });
    createdPromptIds.push(prompt.id);

    const updateResponse = await request.put(`/api/prompts/${prompt.id}`, {
      data: {
        name: uniqueName('updated-prompt-name'),
        content: 'Updated prompt content',
        description: 'Updated description',
      },
      headers: authHeaders(accessToken),
    });
    expect(updateResponse.status()).toBe(200);

    const updatedBody = await updateResponse.json();
    expect(updatedBody.content).toBe('Updated prompt content');
    expect(updatedBody.description).toBe('Updated description');
    expect(new Date(updatedBody.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(updatedBody.created_at).getTime()
    );
  });
});