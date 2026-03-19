/**
 * Tests for the Open Prompt Manager MCP server HTTP helpers.
 * Uses Node.js built-in test runner (node:test) — no extra dependencies needed.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildHeaders, apiGet, apiPost, apiPut, apiDelete } from "../lib/helpers.js";

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockFetchOk(body, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function mockFetchError(status, body = "") {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  });
}

// ── buildHeaders ──────────────────────────────────────────────────────────────

describe("buildHeaders", () => {
  it("sets Content-Type and Accept without Authorization when apiKey is empty", () => {
    const h = buildHeaders("");
    assert.equal(h["Content-Type"], "application/json");
    assert.equal(h["Accept"], "application/json");
    assert.equal("Authorization" in h, false);
  });

  it("includes Bearer Authorization header when apiKey is provided", () => {
    const h = buildHeaders("mysecret");
    assert.ok("Authorization" in h);
    assert.ok(h["Authorization"].includes("mysecret"));
  });
});

// ── apiGet ────────────────────────────────────────────────────────────────────

describe("apiGet", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = "http://test.example.com";
    process.env.API_KEY = "";
  });

  it("returns parsed JSON on a successful response", async () => {
    globalThis.fetch = () => mockFetchOk([{ id: 1 }]);
    const result = await apiGet("/api/prompts/");
    assert.deepEqual(result, [{ id: 1 }]);
  });

  it("appends query params to the URL", async () => {
    let capturedUrl = null;
    globalThis.fetch = (url) => {
      capturedUrl = url;
      return mockFetchOk([]);
    };
    await apiGet("/api/prompts/", { search: "hello", limit: 10 });
    assert.ok(capturedUrl.includes("search=hello"), "URL should contain search param");
    assert.ok(capturedUrl.includes("limit=10"), "URL should contain limit param");
  });

  it("omits null and undefined params from the query string", async () => {
    let capturedUrl = null;
    globalThis.fetch = (url) => {
      capturedUrl = url;
      return mockFetchOk([]);
    };
    await apiGet("/api/prompts/", { tag_id: null, agent_id: undefined, search: "x" });
    assert.ok(!capturedUrl.includes("tag_id"), "null param should be omitted");
    assert.ok(!capturedUrl.includes("agent_id"), "undefined param should be omitted");
    assert.ok(capturedUrl.includes("search=x"), "defined param should be present");
  });

  it("returns an error object on HTTP error response", async () => {
    globalThis.fetch = () => mockFetchError(404, "not found");
    const result = await apiGet("/api/prompts/99");
    assert.ok("error" in result, "result should have error key");
    assert.ok(result.error.includes("404"), "error should mention status code");
  });

  it("returns an error object on network failure", async () => {
    globalThis.fetch = () => Promise.reject(new Error("connection refused"));
    const result = await apiGet("/api/prompts/");
    assert.ok("error" in result, "result should have error key");
    assert.ok(result.error.includes("connection refused"), "error should contain message");
  });
});

// ── apiPost ───────────────────────────────────────────────────────────────────

describe("apiPost", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = "http://test.example.com";
    process.env.API_KEY = "";
  });

  it("returns parsed JSON on a successful response", async () => {
    globalThis.fetch = () => mockFetchOk({ id: 1, name: "new" });
    const result = await apiPost("/api/prompts/", { name: "new", content: "hello" });
    assert.deepEqual(result, { id: 1, name: "new" });
  });

  it("sends POST method with JSON body", async () => {
    let capturedOptions = null;
    globalThis.fetch = (_url, options) => {
      capturedOptions = options;
      return mockFetchOk({ id: 1 });
    };
    await apiPost("/api/prompts/", { name: "test" });
    assert.equal(capturedOptions.method, "POST");
    assert.deepEqual(JSON.parse(capturedOptions.body), { name: "test" });
  });

  it("returns an error object on HTTP error response", async () => {
    globalThis.fetch = () => mockFetchError(422, "unprocessable");
    const result = await apiPost("/api/prompts/", {});
    assert.ok("error" in result);
    assert.ok(result.error.includes("422"));
  });

  it("returns an error object on network failure", async () => {
    globalThis.fetch = () => Promise.reject(new Error("timeout"));
    const result = await apiPost("/api/prompts/", {});
    assert.ok("error" in result);
  });
});

// ── apiPut ────────────────────────────────────────────────────────────────────

describe("apiPut", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = "http://test.example.com";
    process.env.API_KEY = "";
  });

  it("returns parsed JSON on a successful response", async () => {
    globalThis.fetch = () => mockFetchOk({ id: 1, name: "updated" });
    const result = await apiPut("/api/prompts/1", { name: "updated" });
    assert.deepEqual(result, { id: 1, name: "updated" });
  });

  it("sends PUT method with JSON body", async () => {
    let capturedOptions = null;
    globalThis.fetch = (_url, options) => {
      capturedOptions = options;
      return mockFetchOk({ id: 1 });
    };
    await apiPut("/api/prompts/1", { name: "updated" });
    assert.equal(capturedOptions.method, "PUT");
    assert.deepEqual(JSON.parse(capturedOptions.body), { name: "updated" });
  });

  it("returns an error object on HTTP error response", async () => {
    globalThis.fetch = () => mockFetchError(404, "not found");
    const result = await apiPut("/api/prompts/99", {});
    assert.ok("error" in result);
    assert.ok(result.error.includes("404"));
  });
});

// ── apiDelete ─────────────────────────────────────────────────────────────────

describe("apiDelete", () => {
  beforeEach(() => {
    process.env.BACKEND_URL = "http://test.example.com";
    process.env.API_KEY = "";
  });

  it("returns { success: true } on a 204 No Content response", async () => {
    globalThis.fetch = () =>
      Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}), text: () => Promise.resolve("") });
    const result = await apiDelete("/api/prompts/1");
    assert.deepEqual(result, { success: true });
  });

  it("returns parsed JSON on a 200 response with body", async () => {
    globalThis.fetch = () => mockFetchOk({ deleted: true });
    const result = await apiDelete("/api/prompts/1");
    assert.deepEqual(result, { deleted: true });
  });

  it("returns an error object on HTTP error response", async () => {
    globalThis.fetch = () => mockFetchError(404, "not found");
    const result = await apiDelete("/api/prompts/99");
    assert.ok("error" in result);
    assert.ok(result.error.includes("404"));
  });

  it("returns an error object on network failure", async () => {
    globalThis.fetch = () => Promise.reject(new Error("network error"));
    const result = await apiDelete("/api/prompts/1");
    assert.ok("error" in result);
  });
});
