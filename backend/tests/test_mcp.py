"""
Tests for the MCP (Model Context Protocol) server.

Verifies that the /mcp endpoint is reachable and that the core tools
(list_prompts, get_prompt, render_prompt, create_prompt, list_tags,
list_agents) function correctly.
"""
import json
import pytest
from fastapi.testclient import TestClient


# ── Helpers ───────────────────────────────────────────────────────────────────

MCP_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}

_REQ_ID = 1


def mcp_request(method: str, params: dict | None = None) -> dict:
    payload: dict = {
        "jsonrpc": "2.0",
        "method": method,
        "id": _REQ_ID,
    }
    if params is not None:
        payload["params"] = params
    return payload


def parse_sse_event(text: str) -> dict:
    """Extract the JSON object from the first SSE 'data:' line."""
    for line in text.splitlines():
        if line.startswith("data:"):
            return json.loads(line[len("data:"):].strip())
    raise ValueError(f"No SSE data line found in: {text!r}")


def extract_result_data(result: dict):
    """
    Extract tool call data from a CallToolResult.

    The MCP SDK serializes tool return values as follows:
    - ``dict``      → ``structuredContent`` is absent; ``content[0]["text"]`` is the JSON.
    - ``list[dict]`` → ``structuredContent["result"]`` is the list; ``content`` has one
                       TextContent per element.
    - empty list   → ``structuredContent = {"result": []}``; ``content`` is empty.
    """
    sc = result.get("structuredContent")
    if sc is not None and "result" in sc:
        # list-returning tool
        return sc["result"]
    # single-dict-returning tool
    content = result.get("content", [])
    if not content:
        return {}
    return json.loads(content[0]["text"])


def call_tool(client: TestClient, tool_name: str, arguments: dict | None = None):
    """Send a tools/call request and return the parsed result data."""
    params: dict = {"name": tool_name}
    if arguments is not None:
        params["arguments"] = arguments
    resp = client.post("/mcp", json=mcp_request("tools/call", params), headers=MCP_HEADERS)
    assert resp.status_code == 200, f"tools/call {tool_name} returned {resp.status_code}: {resp.text}"
    envelope = parse_sse_event(resp.text)
    assert "result" in envelope, f"No result in envelope: {envelope}"
    return extract_result_data(envelope["result"])


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mcp_client(client: TestClient):
    """Return the shared TestClient after verifying the MCP endpoint is up."""
    resp = client.post(
        "/mcp",
        json=mcp_request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "pytest", "version": "0.1"},
            },
        ),
        headers=MCP_HEADERS,
    )
    assert resp.status_code == 200, f"MCP initialize failed: {resp.status_code} {resp.text}"
    return client


# ── Endpoint availability ─────────────────────────────────────────────────────

def test_mcp_endpoint_is_reachable(client: TestClient):
    """POST /mcp with an initialize request must return 200."""
    resp = client.post(
        "/mcp",
        json=mcp_request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "pytest", "version": "0.1"},
            },
        ),
        headers=MCP_HEADERS,
    )
    assert resp.status_code == 200


def test_mcp_initialize_returns_server_info(client: TestClient):
    """Initialize response must include serverInfo with the correct name."""
    resp = client.post(
        "/mcp",
        json=mcp_request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "pytest", "version": "0.1"},
            },
        ),
        headers=MCP_HEADERS,
    )
    data = parse_sse_event(resp.text)
    assert data["result"]["serverInfo"]["name"] == "Open Prompt Manager"


def test_mcp_tools_list(mcp_client: TestClient):
    """tools/list must return the six expected tool names."""
    resp = mcp_client.post("/mcp", json=mcp_request("tools/list"), headers=MCP_HEADERS)
    assert resp.status_code == 200
    data = parse_sse_event(resp.text)
    tool_names = {t["name"] for t in data["result"]["tools"]}
    assert tool_names == {
        "list_prompts",
        "get_prompt",
        "render_prompt",
        "create_prompt",
        "list_tags",
        "create_tag",
        "list_agents",
    }


# ── Tool: list_prompts ────────────────────────────────────────────────────────

def test_list_prompts_empty(mcp_client: TestClient):
    result = call_tool(mcp_client, "list_prompts")
    assert result == []


def test_list_prompts_returns_created_prompt(mcp_client: TestClient, client: TestClient):
    # Create a prompt via the REST API first
    client.post(
        "/api/prompts/",
        json={"name": "MCP Test", "content": "Hello {{name}}!", "version": "1.0.0",
              "variables": [{"name": "name", "type": "string", "required": True}],
              "tag_ids": [], "agent_ids": []},
    )
    result = call_tool(mcp_client, "list_prompts")
    assert len(result) == 1
    assert result[0]["name"] == "MCP Test"


def test_list_prompts_search_filter(mcp_client: TestClient, client: TestClient):
    client.post(
        "/api/prompts/",
        json={"name": "Alpha Prompt", "content": "alpha", "version": "1.0.0",
              "variables": [], "tag_ids": [], "agent_ids": []},
    )
    client.post(
        "/api/prompts/",
        json={"name": "Beta Prompt", "content": "beta", "version": "1.0.0",
              "variables": [], "tag_ids": [], "agent_ids": []},
    )
    result = call_tool(mcp_client, "list_prompts", {"search": "Alpha"})
    assert len(result) == 1
    assert result[0]["name"] == "Alpha Prompt"


# ── Tool: get_prompt ──────────────────────────────────────────────────────────

def test_get_prompt_returns_prompt(mcp_client: TestClient, client: TestClient):
    create_resp = client.post(
        "/api/prompts/",
        json={"name": "Fetch Me", "content": "content", "version": "1.0.0",
              "variables": [], "tag_ids": [], "agent_ids": []},
    )
    prompt_id = create_resp.json()["id"]
    result = call_tool(mcp_client, "get_prompt", {"prompt_id": prompt_id})
    assert result["id"] == prompt_id
    assert result["name"] == "Fetch Me"


def test_get_prompt_not_found(mcp_client: TestClient):
    result = call_tool(mcp_client, "get_prompt", {"prompt_id": 99999})
    assert "error" in result


# ── Tool: render_prompt ───────────────────────────────────────────────────────

def test_render_prompt_substitutes_variables(mcp_client: TestClient, client: TestClient):
    create_resp = client.post(
        "/api/prompts/",
        json={"name": "Greeting", "content": "Hello, {{name}}!",
              "version": "1.0.0",
              "variables": [{"name": "name", "type": "string", "required": True}],
              "tag_ids": [], "agent_ids": []},
    )
    prompt_id = create_resp.json()["id"]
    result = call_tool(mcp_client, "render_prompt",
                       {"prompt_id": prompt_id, "variables": {"name": "World"}})
    assert result["rendered_content"] == "Hello, World!"
    assert "name" in result["variables_used"]


def test_render_prompt_not_found(mcp_client: TestClient):
    result = call_tool(mcp_client, "render_prompt", {"prompt_id": 99999})
    assert "error" in result


# ── Tool: create_prompt ───────────────────────────────────────────────────────

def test_create_prompt_via_mcp(mcp_client: TestClient):
    result = call_tool(
        mcp_client,
        "create_prompt",
        {"name": "MCP Created", "content": "MCP content", "version": "2.0.0"},
    )
    assert result["name"] == "MCP Created"
    assert result["version"] == "2.0.0"
    assert "id" in result


# ── Tool: list_tags ───────────────────────────────────────────────────────────

def test_list_tags_empty(mcp_client: TestClient):
    result = call_tool(mcp_client, "list_tags")
    assert result == []


def test_list_tags_returns_created_tag(mcp_client: TestClient, client: TestClient):
    client.post("/api/tags/", json={"name": "mcp-tag", "color": "#FF0000"})
    result = call_tool(mcp_client, "list_tags")
    assert any(t["name"] == "mcp-tag" for t in result)


# ── Tool: create_tag ──────────────────────────────────────────────────────────

def test_create_tag_via_mcp(mcp_client: TestClient):
    result = call_tool(mcp_client, "create_tag", {"name": "my-tag", "color": "#AABBCC"})
    assert result["name"] == "my-tag"
    assert result["color"] == "#AABBCC"
    assert "id" in result


def test_create_tag_default_color(mcp_client: TestClient):
    result = call_tool(mcp_client, "create_tag", {"name": "default-color-tag"})
    assert result["color"] == "#3B82F6"


def test_create_tag_appears_in_list_tags(mcp_client: TestClient):
    call_tool(mcp_client, "create_tag", {"name": "listed-tag", "color": "#123456"})
    tags = call_tool(mcp_client, "list_tags")
    assert any(t["name"] == "listed-tag" for t in tags)


def test_create_tag_duplicate_returns_error(mcp_client: TestClient):
    call_tool(mcp_client, "create_tag", {"name": "dup-tag", "color": "#FFFFFF"})
    result = call_tool(mcp_client, "create_tag", {"name": "dup-tag", "color": "#000000"})
    assert "error" in result
    assert "dup-tag" in result["error"]


# ── Tool: list_agents ─────────────────────────────────────────────────────────

def test_list_agents_empty(mcp_client: TestClient):
    result = call_tool(mcp_client, "list_agents")
    assert result == []


def test_list_agents_returns_created_agent(mcp_client: TestClient, client: TestClient):
    client.post("/api/agents/", json={"name": "mcp-agent", "type": "bot", "status": "active"})
    result = call_tool(mcp_client, "list_agents")
    assert any(a["name"] == "mcp-agent" for a in result)
