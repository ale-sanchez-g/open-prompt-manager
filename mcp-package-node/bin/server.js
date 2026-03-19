#!/usr/bin/env node
/**
 * Open Prompt Manager — MCP server (stdio transport for Claude Desktop)
 *
 * Calls the Open Prompt Manager backend REST API over HTTP.
 * No direct database access — the backend must be running.
 *
 * Environment variables:
 *   BACKEND_URL   Base URL of the running backend  (default: http://localhost:8000)
 *   API_KEY       Optional Bearer token if your backend requires auth
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Configuration ─────────────────────────────────────────────────────────────

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const API_KEY = process.env.API_KEY ?? "";

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function buildHeaders() {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  if (API_KEY) h["Authorization"] = `Bearer ${API_KEY}`;
  return h;
}

async function apiGet(path, params) {
  let url = `${BACKEND_URL}${path}`;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    if (qs) url += `?${qs}`;
  }
  try {
    const res = await fetch(url, { headers: buildHeaders() });
    if (!res.ok) return { error: `HTTP ${res.status}: ${await res.text()}` };
    return res.json();
  } catch (err) {
    return { error: String(err) };
  }
}

async function apiPost(path, payload) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { error: `HTTP ${res.status}: ${await res.text()}` };
    return res.json();
  } catch (err) {
    return { error: String(err) };
  }
}

async function apiPut(path, payload) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "PUT",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { error: `HTTP ${res.status}: ${await res.text()}` };
    return res.json();
  } catch (err) {
    return { error: String(err) };
  }
}

async function apiDelete(path) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "DELETE",
      headers: buildHeaders(),
    });
    if (res.status === 204) return { success: true };
    if (!res.ok) return { error: `HTTP ${res.status}: ${await res.text()}` };
    return res.json();
  } catch (err) {
    return { error: String(err) };
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "Open Prompt Manager",
  version: "0.1.0",
});

// ── Prompt tools ──────────────────────────────────────────────────────────────

server.tool(
  "list_prompts",
  "List available prompts, optionally filtered by search string, tag or agent.",
  {
    search:   z.string().optional().describe("Substring to filter by name or description"),
    tag_id:   z.number().int().optional().describe("Filter prompts by tag ID"),
    agent_id: z.number().int().optional().describe("Filter prompts by agent ID"),
    skip:     z.number().int().min(0).optional().default(0).describe("Records to skip (pagination)"),
    limit:    z.number().int().min(1).max(200).optional().default(50).describe("Max records to return"),
  },
  async ({ search, tag_id, agent_id, skip, limit }) => {
    const result = await apiGet("/api/prompts/", { search, tag_id, agent_id, skip, limit });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_prompt",
  "Retrieve a single prompt by its ID.",
  { prompt_id: z.number().int().describe("The integer ID of the prompt") },
  async ({ prompt_id }) => {
    const result = await apiGet(`/api/prompts/${prompt_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_prompt",
  "Create a new prompt.",
  {
    name:        z.string().describe("Human-readable name for the prompt"),
    content:     z.string().describe("Prompt template content (supports {{variable}} placeholders)"),
    description: z.string().optional().default("").describe("Optional description"),
    version:     z.string().optional().default("1.0.0").describe("Semantic version string"),
    created_by:  z.string().optional().default("").describe("Optional author identifier"),
    variables:   z.array(z.record(z.unknown())).optional().default([]).describe("Variable schema list"),
    tag_ids:     z.array(z.number().int()).optional().default([]).describe("Tag IDs to associate"),
    agent_ids:   z.array(z.number().int()).optional().default([]).describe("Agent IDs to associate"),
  },
  async ({ name, content, description, version, created_by, variables, tag_ids, agent_ids }) => {
    const result = await apiPost("/api/prompts/", {
      name, content, description, version, created_by, variables, tag_ids, agent_ids,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_prompt",
  "Update an existing prompt. Only provided fields are changed.",
  {
    prompt_id:   z.number().int().describe("ID of the prompt to update"),
    name:        z.string().optional().describe("New name"),
    content:     z.string().optional().describe("New template content"),
    description: z.string().optional().describe("New description"),
    variables:   z.array(z.record(z.unknown())).optional().describe("Replacement variable schema list"),
    tag_ids:     z.array(z.number().int()).optional().describe("Replacement tag ID list"),
    agent_ids:   z.array(z.number().int()).optional().describe("Replacement agent ID list"),
  },
  async ({ prompt_id, ...fields }) => {
    const payload = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const result = await apiPut(`/api/prompts/${prompt_id}`, payload);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_prompt",
  "Delete a prompt by ID.",
  { prompt_id: z.number().int().describe("The integer ID of the prompt to delete") },
  async ({ prompt_id }) => {
    const result = await apiDelete(`/api/prompts/${prompt_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "render_prompt",
  "Render a prompt by substituting variables and resolving component references.",
  {
    prompt_id: z.number().int().describe("The integer ID of the prompt to render"),
    variables: z.record(z.unknown()).optional().default({}).describe("Variable name → value pairs"),
  },
  async ({ prompt_id, variables }) => {
    const result = await apiPost(`/api/prompts/${prompt_id}/render`, { variables });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tag tools ─────────────────────────────────────────────────────────────────

server.tool(
  "list_tags",
  "Return all tags defined in the system.",
  {},
  async () => {
    const result = await apiGet("/api/tags/");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_tag",
  "Create a new tag.",
  {
    name:  z.string().describe("Unique label for the tag (e.g. \"safety\")"),
    color: z.string().optional().default("#3B82F6").describe("Hex colour code used in the UI"),
  },
  async ({ name, color }) => {
    const result = await apiPost("/api/tags/", { name, color });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_tag",
  "Delete a tag by ID.",
  { tag_id: z.number().int().describe("The integer ID of the tag to delete") },
  async ({ tag_id }) => {
    const result = await apiDelete(`/api/tags/${tag_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Agent tools ───────────────────────────────────────────────────────────────

server.tool(
  "list_agents",
  "Return all agents registered in the system.",
  {},
  async () => {
    const result = await apiGet("/api/agents/");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_agent",
  "Retrieve a single agent by its ID.",
  { agent_id: z.number().int().describe("The integer ID of the agent") },
  async ({ agent_id }) => {
    const result = await apiGet(`/api/agents/${agent_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_agent",
  "Create a new agent.",
  {
    name:        z.string().describe("Human-readable name for the agent"),
    description: z.string().optional().default("").describe("Optional description"),
    type:        z.string().optional().default("generic").describe("Agent type identifier"),
    status:      z.enum(["active", "inactive"]).optional().default("active").describe("Agent status"),
  },
  async ({ name, description, type, status }) => {
    const result = await apiPost("/api/agents/", { name, description, type, status });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_agent",
  "Update an existing agent. Only provided fields are changed.",
  {
    agent_id:    z.number().int().describe("ID of the agent to update"),
    name:        z.string().optional().describe("New name"),
    description: z.string().optional().describe("New description"),
    type:        z.string().optional().describe("New type identifier"),
    status:      z.enum(["active", "inactive"]).optional().describe("New status"),
  },
  async ({ agent_id, ...fields }) => {
    const payload = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const result = await apiPut(`/api/agents/${agent_id}`, payload);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_agent",
  "Delete an agent by ID.",
  { agent_id: z.number().int().describe("The integer ID of the agent to delete") },
  async ({ agent_id }) => {
    const result = await apiDelete(`/api/agents/${agent_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Health tool ───────────────────────────────────────────────────────────────

server.tool(
  "health_check",
  "Check that the Open Prompt Manager backend is reachable and healthy.",
  {},
  async () => {
    const result = await apiGet("/api/health");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
