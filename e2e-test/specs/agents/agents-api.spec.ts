// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, APIRequestContext } from '@playwright/test';

const NON_EXISTENT_AGENT_ID = 99999;

function uniqueAgentName(prefix = 'pw-test-agent'): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

async function createAgent(
  request: APIRequestContext,
  overrides?: Partial<{
    name: string;
    description: string;
    type: string;
    status: string;
  }>
): Promise<{ id: number; name: string; description?: string; created_at: string }> {
  const response = await request.post('/api/agents/', {
    data: {
      name: uniqueAgentName(),
      description: 'A test agent for API testing',
      type: 'chatbot',
      status: 'active',
      ...overrides,
    },
  });

  expect(response.status()).toBe(201);
  return await response.json();
}

test.describe('Agents API Tests', () => {
  let createdAgentIds: number[];

  test.beforeEach(async () => {
    createdAgentIds = [];
  });

  test.afterEach(async ({ request }) => {
    for (const agentId of createdAgentIds) {
      const response = await request.delete(`/api/agents/${agentId}`);
      expect([204, 404]).toContain(response.status());
    }
  });

  test('Agents - Create Agent Successfully', async ({ request }) => {
    const agentName = uniqueAgentName();

    const response = await request.post('/api/agents/', {
      data: {
        name: agentName,
        description: 'A test agent for API testing',
        type: 'chatbot',
        status: 'active',
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();

    createdAgentIds.push(body.id);
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('number');
    expect(body.name).toBe(agentName);
    expect(body.description).toBe('A test agent for API testing');
    expect(body).toHaveProperty('created_at');
    expect(() => new Date(body.created_at).toISOString()).not.toThrow();
  });

  test('Agents - Create Agent with Missing Required Fields', async ({ request }) => {
    const missingNameResponse = await request.post('/api/agents/', {
      data: { description: 'Agent without name' },
    });

    expect(missingNameResponse.status()).toBe(422);
    const missingNameBody = await missingNameResponse.json();
    expect(missingNameBody).toHaveProperty('detail');
    expect(JSON.stringify(missingNameBody.detail).toLowerCase()).toContain('name');

    const emptyBodyResponse = await request.post('/api/agents/', {
      data: {},
    });

    expect(emptyBodyResponse.status()).toBe(422);
  });

  test('Agents - Get All Agents', async ({ request }) => {
    const response = await request.get('/api/agents/');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('Agents - Get Specific Agent by ID', async ({ request }) => {
    const createdAgent = await createAgent(request);
    createdAgentIds.push(createdAgent.id);

    // Retry once after a 1-second delay to guard against transient timing
    // between the commit and read when other specs are writing heavily.
    let getResponse = await request.get(`/api/agents/${createdAgent.id}`);
    if (getResponse.status() !== 200) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      getResponse = await request.get(`/api/agents/${createdAgent.id}`);
    }

    expect(getResponse.status()).toBe(200);
    const body = await getResponse.json();

    expect(body.id).toBe(createdAgent.id);
    expect(body.name).toBe(createdAgent.name);
    expect(body.description).toBe('A test agent for API testing');
    expect(body).toHaveProperty('created_at');
    expect(body).toHaveProperty('updated_at');
  });

  test('Agents - Get Non-existent Agent', async ({ request }) => {
    const response = await request.get(`/api/agents/${NON_EXISTENT_AGENT_ID}`);

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('detail');
  });

  test('Agents - Update Agent Successfully', async ({ request }) => {
    const createdAgent = await createAgent(request);
    createdAgentIds.push(createdAgent.id);
    const updatedName = uniqueAgentName('updated-agent');

    const updateResponse = await request.put(`/api/agents/${createdAgent.id}`, {
      data: {
        name: updatedName,
        description: 'Updated description',
      },
    });

    expect(updateResponse.status()).toBe(200);
    const updatedBody = await updateResponse.json();

    expect(updatedBody.name).toBe(updatedName);
    expect(updatedBody.description).toBe('Updated description');
    expect(updatedBody.id).toBe(createdAgent.id);

    const getResponse = await request.get(`/api/agents/${createdAgent.id}`);
    expect(getResponse.status()).toBe(200);
    const detailBody = await getResponse.json();
    expect(new Date(detailBody.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(detailBody.created_at).getTime()
    );
  });

  test('Agents - Update Non-existent Agent', async ({ request }) => {
    const response = await request.put(`/api/agents/${NON_EXISTENT_AGENT_ID}`, {
      data: {
        name: 'Updated Name',
        description: 'Updated description',
      },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('detail');
  });

  test('Agents - Delete Agent Successfully', async ({ request }) => {
    const createdAgent = await createAgent(request, {
      name: uniqueAgentName('agent-to-delete'),
      description: 'This agent will be deleted',
    });
    createdAgentIds.push(createdAgent.id);

    const deleteResponse = await request.delete(`/api/agents/${createdAgent.id}`);
    expect(deleteResponse.status()).toBe(204);
    expect(await deleteResponse.text()).toBe('');

    const getAfterDeleteResponse = await request.get(`/api/agents/${createdAgent.id}`);
    expect(getAfterDeleteResponse.status()).toBe(404);
    expect(await getAfterDeleteResponse.json()).toHaveProperty('detail');
  });

  test('Agents - Delete Non-existent Agent', async ({ request }) => {
    const response = await request.delete(`/api/agents/${NON_EXISTENT_AGENT_ID}`);

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty('detail');
  });
});