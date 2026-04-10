// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('MCP Protocol Tests', () => {
  test('MCP Endpoint Basic Connectivity', async ({ request }) => {
    // 1. Send POST request to /mcp endpoint with valid MCP protocol data
    // MCP Streamable HTTP transport uses JSON-RPC 2.0 protocol
    const response = await request.post('/mcp', {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      },
    });

    // expect: Response status code is 200
    expect(response.status()).toBe(200);

    // expect: Response indicates MCP protocol is active
    const contentType = response.headers()['content-type'] ?? '';
    expect(
      contentType.includes('application/json') ||
      contentType.includes('text/event-stream')
    ).toBe(true);
  });
});
