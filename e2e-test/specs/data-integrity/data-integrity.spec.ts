// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, APIRequestContext } from '@playwright/test';

const STRONG_PASSWORD = 'Test@1234Secure!';

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

function uniqueEmail(prefix = 'data-integrity-test'): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}@opm-test.io`;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function createAgent(request: APIRequestContext, accessToken: string, namePrefix = 'data-integrity-agent'): Promise<{ id: number }> {
  const response = await request.post('/api/agents/', {
    data: {
      name: uniqueName(namePrefix),
      description: 'Agent for data integrity testing',
    },
    headers: authHeaders(accessToken),
  });

  expect(response.status()).toBe(201);
  return response.json();
}

async function createTag(
  request: APIRequestContext,
  accessToken: string,
  namePrefix: string,
  color: string
): Promise<{ id: number }> {
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
  data: {
    namePrefix: string;
    content: string;
    description: string;
    version?: string;
    agent_ids?: number[];
    tag_ids?: number[];
  }
): Promise<any> {
  const response = await request.post('/api/prompts/', {
    data: {
      name: uniqueName(data.namePrefix),
      content: data.content,
      description: data.description,
      version: data.version,
      agent_ids: data.agent_ids,
      tag_ids: data.tag_ids,
    },
    headers: authHeaders(accessToken),
  });

  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('Data Integrity and Relationships Tests', () => {
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

  test('Cascade Delete Behavior', async ({ request }) => {
    const agent = await createAgent(request, accessToken, 'cascade-delete-agent');
    createdAgentIds.push(agent.id);

    const tag = await createTag(request, accessToken, 'cascade-tag', '#ABCDEF');
    createdTagIds.push(tag.id);

    const prompt = await createPrompt(request, accessToken, {
      namePrefix: 'cascade-prompt',
      content: 'Content for cascade test',
      description: 'Testing cascade behavior',
      agent_ids: [agent.id],
      tag_ids: [tag.id],
    });
    createdPromptIds.push(prompt.id);

    const deleteAgentResponse = await request.delete(`/api/agents/${agent.id}`, { headers: authHeaders(accessToken) });
    expect(deleteAgentResponse.status()).toBe(204);

    const getPromptResponse = await request.get(`/api/prompts/${prompt.id}`, { headers: authHeaders(accessToken) });
    expect(getPromptResponse.status()).toBe(200);

    const promptBody = await getPromptResponse.json();
    const hasDeletedAgent = promptBody.agents.some((a: { id: number }) => a.id === agent.id);
    expect(hasDeletedAgent).toBe(false);
  });

  test('Tag Associations', async ({ request }) => {
    const tag1 = await createTag(request, accessToken, 'association-tag-1', '#FF0000');
    const tag2 = await createTag(request, accessToken, 'association-tag-2', '#00FF00');
    createdTagIds.push(tag1.id, tag2.id);

    const prompt = await createPrompt(request, accessToken, {
      namePrefix: 'multi-tag-prompt',
      content: 'Prompt with multiple tags',
      description: 'Tag association test',
      tag_ids: [tag1.id, tag2.id],
    });
    createdPromptIds.push(prompt.id);

    expect(prompt.tags.length).toBe(2);

    const deleteTagResponse = await request.delete(`/api/tags/${tag1.id}`, { headers: authHeaders(accessToken) });
    expect(deleteTagResponse.status()).toBe(204);

    const getPromptResponse = await request.get(`/api/prompts/${prompt.id}`, { headers: authHeaders(accessToken) });
    expect(getPromptResponse.status()).toBe(200);

    const updatedPrompt = await getPromptResponse.json();
    const tag1InTags = updatedPrompt.tags.some((t: { id: number }) => t.id === tag1.id);
    const tag2InTags = updatedPrompt.tags.some((t: { id: number }) => t.id === tag2.id);

    expect(tag1InTags).toBe(false);
    expect(tag2InTags).toBe(true);
  });

  test('Version Tracking', async ({ request }) => {
    const prompt = await createPrompt(request, accessToken, {
      namePrefix: 'version-track-prompt',
      content: 'Initial content',
      description: 'Testing version tracking',
      version: '1.0.0',
    });
    createdPromptIds.push(prompt.id);

    expect(prompt.version).toBe('1.0.0');
    const initialUpdatedAt = prompt.updated_at;

    const version2Response = await request.post(`/api/prompts/${prompt.id}/versions`, {
      data: {
        content: 'Updated content v1.1.0',
        version: '1.1.0',
      },
      headers: authHeaders(accessToken),
    });
    expect(version2Response.status()).toBe(201);
    const v2 = await version2Response.json();
    createdPromptIds.unshift(v2.id);

    expect(v2.version).toBe('1.1.0');
    expect(v2.parent_id).toBe(prompt.id);

    const version3Response = await request.post(`/api/prompts/${v2.id}/versions`, {
      data: {
        content: 'Updated content v1.2.0',
        version: '1.2.0',
      },
      headers: authHeaders(accessToken),
    });
    expect(version3Response.status()).toBe(201);
    const v3 = await version3Response.json();
    createdPromptIds.unshift(v3.id);

    expect(v3.version).toBe('1.2.0');
    expect(v3.parent_id).toBe(v2.id);
    expect(new Date(v3.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(initialUpdatedAt).getTime()
    );
  });
});