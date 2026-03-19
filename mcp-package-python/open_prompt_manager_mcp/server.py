"""
Standalone MCP (Model Context Protocol) server for Open Prompt Manager.

Communicates over stdio so it works directly with Claude Desktop.
Calls the Open Prompt Manager backend REST API — no direct DB access needed.

Configure via environment variables:
    BACKEND_URL   Base URL of the running backend  (default: http://localhost:8000)
    API_KEY       Optional Bearer token if your backend requires auth
"""

import json
import os
from typing import Any, Optional, TypedDict, Union
import urllib.error
import urllib.parse
import urllib.request

from mcp.server.fastmcp import FastMCP

# A successful "list" response is typically a list of JSON objects; on error,
# the backend is expected to return a JSON object describing the error.
JSONListOrError = list[dict[str, Any]] | dict[str, Any]

# ── Configuration ─────────────────────────────────────────────────────────────

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
API_KEY = os.getenv("API_KEY", "")


class ErrorResponse(TypedDict):
    error: str


Prompt = dict[str, Any]
PromptListResult = Union[list[Prompt], ErrorResponse]

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _headers() -> dict:
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if API_KEY:
        h["Authorization"] = f"Bearer {API_KEY}"
    return h


def _get(path: str, params: Optional[dict] = None) -> JSONListOrError:
    url = f"{BACKEND_URL}{path}"
    if params:
        url = f"{url}?{urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})}"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"error": f"HTTP {exc.code}: {body}"}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def _post(path: str, payload: dict) -> Any:
    url = f"{BACKEND_URL}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=_headers(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"error": f"HTTP {exc.code}: {body}"}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def _put(path: str, payload: dict) -> Any:
    url = f"{BACKEND_URL}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=_headers(), method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"error": f"HTTP {exc.code}: {body}"}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def _delete(path: str) -> dict:
    url = f"{BACKEND_URL}{path}"
    req = urllib.request.Request(url, headers=_headers(), method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 204:
                return {"success": True}
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"error": f"HTTP {exc.code}: {body}"}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


# ── Server ────────────────────────────────────────────────────────────────────

mcp = FastMCP("Open Prompt Manager")


# ── Prompt tools ──────────────────────────────────────────────────────────────

@mcp.tool()
def list_prompts(
    search: str = "",
    tag_id: Optional[int] = None,
    agent_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
) -> PromptListResult:
    """
    List available prompts.

    Args:
        search:   Optional substring to filter by name or description.
        tag_id:   Filter prompts by tag ID.
        agent_id: Filter prompts by agent ID.
        skip:     Number of records to skip (pagination).
        limit:    Maximum records to return (1–200).
    """
    limit = max(1, min(limit, 200))
    params = {"skip": skip, "limit": limit}
    if search:
        params["search"] = search
    if tag_id is not None:
        params["tag_id"] = tag_id
    if agent_id is not None:
        params["agent_id"] = agent_id
    return _get("/api/prompts/", params)


@mcp.tool()
def get_prompt(prompt_id: int) -> dict:
    """
    Retrieve a single prompt by its ID.

    Args:
        prompt_id: The integer ID of the prompt.
    """
    return _get(f"/api/prompts/{prompt_id}")


@mcp.tool()
def create_prompt(
    name: str,
    content: str,
    description: str = "",
    version: str = "1.0.0",
    created_by: str = "",
    variables: Optional[list[dict]] = None,
    tag_ids: Optional[list[int]] = None,
    agent_ids: Optional[list[int]] = None,
) -> dict:
    """
    Create a new prompt.

    Args:
        name:        Human-readable name for the prompt.
        content:     Prompt template content (supports {{variable}} placeholders).
        description: Optional description.
        version:     Semantic version string (default: "1.0.0").
        created_by:  Optional author identifier.
        variables:   List of variable schemas with keys: name, type, required, default.
        tag_ids:     Existing tag IDs to associate with the prompt.
        agent_ids:   Existing agent IDs to associate with the prompt.
    """
    payload: dict[str, Any] = {
        "name": name,
        "content": content,
        "description": description,
        "version": version,
        "created_by": created_by,
        "variables": variables or [],
        "tag_ids": tag_ids or [],
        "agent_ids": agent_ids or [],
    }
    return _post("/api/prompts/", payload)


@mcp.tool()
def update_prompt(
    prompt_id: int,
    name: Optional[str] = None,
    content: Optional[str] = None,
    description: Optional[str] = None,
    variables: Optional[list[dict]] = None,
    tag_ids: Optional[list[int]] = None,
    agent_ids: Optional[list[int]] = None,
) -> dict:
    """
    Update an existing prompt. Only provided fields are changed.

    Args:
        prompt_id:   ID of the prompt to update.
        name:        New name for the prompt.
        content:     New template content.
        description: New description.
        variables:   Replacement variable schema list.
        tag_ids:     Replacement tag ID list.
        agent_ids:   Replacement agent ID list.
    """
    payload: dict[str, Any] = {}
    if name is not None:
        payload["name"] = name
    if content is not None:
        payload["content"] = content
    if description is not None:
        payload["description"] = description
    if variables is not None:
        payload["variables"] = variables
    if tag_ids is not None:
        payload["tag_ids"] = tag_ids
    if agent_ids is not None:
        payload["agent_ids"] = agent_ids
    return _put(f"/api/prompts/{prompt_id}", payload)


@mcp.tool()
def delete_prompt(prompt_id: int) -> dict:
    """
    Delete a prompt by ID.

    Args:
        prompt_id: The integer ID of the prompt to delete.
    """
    return _delete(f"/api/prompts/{prompt_id}")


@mcp.tool()
def render_prompt(
    prompt_id: int,
    variables: Optional[dict[str, Any]] = None,
) -> dict:
    """
    Render a prompt by substituting variables and resolving component references.

    Args:
        prompt_id: The integer ID of the prompt to render.
        variables: Dictionary of variable name → value pairs for substitution.
    """
    payload: dict[str, Any] = {"variables": variables or {}}
    return _post(f"/api/prompts/{prompt_id}/render", payload)


# ── Tag tools ─────────────────────────────────────────────────────────────────

@mcp.tool()
def list_tags() -> JSONListOrError:
    """Return all tags defined in the system."""
    return _get("/api/tags/")


@mcp.tool()
def create_tag(name: str, color: str = "#3B82F6") -> dict:
    """
    Create a new tag.

    Args:
        name:  Unique label for the tag (e.g. "safety").
        color: Hex colour code used in the UI (default: "#3B82F6").
    """
    return _post("/api/tags/", {"name": name, "color": color})


@mcp.tool()
def delete_tag(tag_id: int) -> dict:
    """
    Delete a tag by ID.

    Args:
        tag_id: The integer ID of the tag to delete.
    """
    return _delete(f"/api/tags/{tag_id}")


# ── Agent tools ───────────────────────────────────────────────────────────────

@mcp.tool()
def list_agents() -> JSONListOrError:
    """Return all agents registered in the system."""
    return _get("/api/agents/")


@mcp.tool()
def get_agent(agent_id: int) -> dict:
    """
    Retrieve a single agent by its ID.

    Args:
        agent_id: The integer ID of the agent.
    """
    return _get(f"/api/agents/{agent_id}")


@mcp.tool()
def create_agent(
    name: str,
    description: str = "",
    agent_type: str = "generic",
    type: Optional[str] = None,
    status: str = "active",
) -> dict:
    """
    Create a new agent.

    Args:
        name:        Human-readable name for the agent.
        description: Optional description of what the agent does.
        agent_type:  Agent type identifier (default: "generic"). Deprecated in favor of `type`.
        type:        Agent type identifier, matching the Node implementation. If provided,
                     this value is used instead of `agent_type`.
        status:      Agent status — "active" or "inactive" (default: "active").
    """
    effective_type = type if type is not None else agent_type
    return _post(
        "/api/agents/",
        {"name": name, "description": description, "type": effective_type, "status": status},
    )


@mcp.tool()
def update_agent(
    agent_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    agent_type: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
) -> dict:
    """
    Update an existing agent. Only provided fields are changed.

    Args:
        agent_id:    ID of the agent to update.
        name:        New name.
        description: New description.
        agent_type:  New type identifier. Deprecated in favor of `type`.
        type:        New type identifier, matching the Node implementation. If provided,
                     this value is used instead of `agent_type`.
        status:      New status ("active" or "inactive").
    """
    payload: dict[str, Any] = {}
    if name is not None:
        payload["name"] = name
    if description is not None:
        payload["description"] = description
    effective_type = type if type is not None else agent_type
    if effective_type is not None:
        payload["type"] = effective_type
    if status is not None:
        payload["status"] = status
    return _put(f"/api/agents/{agent_id}", payload)


@mcp.tool()
def delete_agent(agent_id: int) -> dict:
    """
    Delete an agent by ID.

    Args:
        agent_id: The integer ID of the agent to delete.
    """
    return _delete(f"/api/agents/{agent_id}")


# ── Health tool ───────────────────────────────────────────────────────────────

@mcp.tool()
def health_check() -> dict:
    """Check that the Open Prompt Manager backend is reachable and healthy."""
    return _get("/api/health")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
