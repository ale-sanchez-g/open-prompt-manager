// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, APIRequestContext } from '@playwright/test';

const NON_EXISTENT_TAG_ID = 99999;

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

async function createTag(
  request: APIRequestContext,
  data?: Partial<{ name: string; color: string }>
): Promise<{ id: number; name: string; color?: string }> {
  const response = await request.post('/api/tags/', {
    data: {
      name: uniqueName('test-tag'),
      color: '#FF5733',
      ...data,
    },
  });

  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('Tags API Tests', () => {
  let createdTagIds: number[];

  test.beforeEach(async () => {
    createdTagIds = [];
  });

  test.afterEach(async ({ request }) => {
    for (const tagId of createdTagIds) {
      const response = await request.delete(`/api/tags/${tagId}`);
      expect([204, 404]).toContain(response.status());
    }
  });

  test('Tags - Create Tag Successfully', async ({ request }) => {
    const expectedName = uniqueName('test-tag-success');
    const response = await request.post('/api/tags/', {
      data: {
        name: expectedName,
        color: '#FF5733',
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    createdTagIds.push(body.id);

    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('number');
    expect(body.name).toBe(expectedName);
    expect(body.color).toBe('#FF5733');
  });

  test('Tags - Create Tag Without Optional Color', async ({ request }) => {
    const expectedName = uniqueName('simple-tag');
    const response = await request.post('/api/tags/', {
      data: { name: expectedName },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    createdTagIds.push(body.id);

    expect(body).toHaveProperty('id');
    expect(body.name).toBe(expectedName);
    expect('color' in body).toBe(true);
  });

  test('Tags - Create Tag with Missing Name', async ({ request }) => {
    const response = await request.post('/api/tags/', {
      data: { color: '#FF5733' },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body).toHaveProperty('detail');
    expect(JSON.stringify(body.detail).toLowerCase()).toContain('name');
  });

  test('Tags - Get All Tags', async ({ request }) => {
    const response = await request.get('/api/tags/');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('Tags - Verify Created Tag Exists in List', async ({ request }) => {
    const tag = await createTag(request, {
      name: uniqueName('tag-to-retrieve'),
      color: '#00FF00',
    });
    createdTagIds.push(tag.id);

    const listResponse = await request.get('/api/tags/');
    expect(listResponse.status()).toBe(200);
    const tags = await listResponse.json();

    const found = tags.find((t: { id: number }) => t.id === tag.id);
    expect(found).toBeDefined();
    expect(found.name).toBe(tag.name);
    expect(found.color).toBe('#00FF00');
  });

  test('Tags - Get Non-existent Tag Endpoint Not Supported', async ({ request }) => {
    const response = await request.get(`/api/tags/${NON_EXISTENT_TAG_ID}`);

    expect([404, 405]).toContain(response.status());
  });

  test('Tags - Update Tag Endpoint Not Supported', async ({ request }) => {
    const tag = await createTag(request, {
      name: uniqueName('original-tag'),
      color: '#AABBCC',
    });
    createdTagIds.push(tag.id);

    const updateResponse = await request.put(`/api/tags/${tag.id}`, {
      data: { name: uniqueName('updated-tag'), color: '#112233' },
    });

    expect([404, 405]).toContain(updateResponse.status());
  });

  test('Tags - Delete Tag Successfully', async ({ request }) => {
    const tag = await createTag(request, {
      name: uniqueName('tag-to-delete'),
      color: '#FFAA00',
    });
    createdTagIds.push(tag.id);

    const deleteResponse = await request.delete(`/api/tags/${tag.id}`);
    expect(deleteResponse.status()).toBe(204);

    const listResponse = await request.get('/api/tags/');
    expect(listResponse.status()).toBe(200);
    const tags = await listResponse.json();

    const found = tags.find((t: { id: number }) => t.id === tag.id);
    expect(found).toBeUndefined();
  });
});