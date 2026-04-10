// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Health Check API Tests', () => {
  test('Health Check - Success', async ({ request }) => {
    // 1. Send GET request to /api/health endpoint
    const response = await request.get('/api/health');

    // expect: Response status code is 200
    expect(response.status()).toBe(200);

    // expect: Response content-type header is 'application/json'
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json();

    // expect: Response contains 'status' field with string value
    expect(body).toHaveProperty('status');
    expect(typeof body.status).toBe('string');

    // expect: Response contains 'version' field with string value
    expect(body).toHaveProperty('version');
    expect(typeof body.version).toBe('string');
  });
});
