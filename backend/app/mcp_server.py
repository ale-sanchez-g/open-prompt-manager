"""
MCP (Model Context Protocol) server for Open Prompt Manager.

Exposes prompt management capabilities as MCP tools so AI agents can
discover and use prompts programmatically.  The server is mounted at
the root of the Starlette sub-app and exposed via FastAPI at /mcp
(the MCP SDK's default ``streamable_http_path``).
"""
import os
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

import app.database.base as _db_module
from app.models.prompt import Agent, Prompt, Tag
from app.services.prompt_service import render_prompt as _render_prompt

# ── Security ─────────────────────────────────────────────────────────────────
# Allow the host names that legitimate MCP clients will connect from.
# Defaults cover local development and Docker Compose.  Set MCP_ALLOWED_HOSTS
# as a comma-separated list to extend for production deployments.
_default_hosts = "localhost,localhost:8000,127.0.0.1,127.0.0.1:8000"
_allowed_hosts = [
    h.strip()
    for h in os.getenv("MCP_ALLOWED_HOSTS", _default_hosts).split(",")
    if h.strip()
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_latest(prompt: Prompt, db) -> bool:
    """Return True if no other prompt lists this prompt as its parent."""
    return db.query(Prompt).filter(Prompt.parent_id == prompt.id).first() is None


def _prompt_to_dict(prompt: Prompt, db) -> dict[str, Any]:
    return {
        "id": prompt.id,
        "name": prompt.name,
        "description": prompt.description,
        "content": prompt.content,
        "version": prompt.version,
        "parent_id": prompt.parent_id,
        "is_latest": _is_latest(prompt, db),
        "created_by": prompt.created_by,
        "variables": prompt.variables or [],
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in prompt.tags],
        "agents": [{"id": a.id, "name": a.name} for a in prompt.agents],
        "avg_rating": prompt.avg_rating,
        "usage_count": prompt.usage_count,
        "success_rate": prompt.success_rate,
        "created_at": prompt.created_at.isoformat(),
        "updated_at": prompt.updated_at.isoformat(),
    }


# ── Factory ───────────────────────────────────────────────────────────────────

def build_mcp_server() -> FastMCP:
    """
    Create and return a fully configured FastMCP instance.

    Called once per application lifetime (or once per test run so that each
    test gets an isolated ``StreamableHTTPSessionManager``).
    """
    mcp = FastMCP(
        "Open Prompt Manager",
        # stateless_http=True: each request is self-contained; no cross-request
        # session state is needed because every tool call opens its own DB session.
        stateless_http=True,
        transport_security=TransportSecuritySettings(allowed_hosts=_allowed_hosts),
    )

    # ── Tools ──────────────────────────────────────────────────────────────────

    @mcp.tool()
    def list_prompts(
        search: str = "",
        skip: int = 0,
        limit: int = 50,
    ) -> list[dict]:
        """
        List available prompts, optionally filtered by a search string.

        Args:
            search: Optional substring to filter by name or description.
            skip:   Number of records to skip (for pagination).
            limit:  Maximum number of records to return (1–200).
        """
        limit = max(1, min(limit, 200))
        db = _db_module.SessionLocal()
        try:
            query = db.query(Prompt)
            if search:
                query = query.filter(
                    Prompt.name.ilike(f"%{search}%") | Prompt.description.ilike(f"%{search}%")
                )
            prompts = query.order_by(Prompt.updated_at.desc()).offset(skip).limit(limit).all()
            return [_prompt_to_dict(p, db) for p in prompts]
        finally:
            db.close()

    @mcp.tool()
    def get_prompt(prompt_id: int) -> dict:
        """
        Retrieve a single prompt by its ID.

        Args:
            prompt_id: The integer ID of the prompt.
        """
        db = _db_module.SessionLocal()
        try:
            prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
            if prompt is None:
                return {"error": f"Prompt {prompt_id} not found"}
            return _prompt_to_dict(prompt, db)
        finally:
            db.close()

    @mcp.tool()
    def render_prompt(
        prompt_id: int,
        variables: Optional[dict[str, Any]] = None,
    ) -> dict:
        """
        Render a prompt by substituting variables and resolving component references.

        Args:
            prompt_id: The integer ID of the prompt to render.
            variables: Dictionary of variable name → value pairs used for substitution.
        """
        if variables is None:
            variables = {}
        db = _db_module.SessionLocal()
        try:
            prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
            if prompt is None:
                return {"error": f"Prompt {prompt_id} not found"}
            try:
                rendered, vars_used, components = _render_prompt(prompt, variables, db)
            except ValueError as exc:
                return {"error": str(exc)}
            return {
                "rendered_content": rendered,
                "variables_used": vars_used,
                "components_resolved": components,
            }
        finally:
            db.close()

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
            content:     The prompt template content (supports {{variable}} placeholders).
            description: Optional description.
            version:     Semantic version string (default: "1.0.0").
            created_by:  Optional author identifier.
            variables:   List of variable schemas, each with keys: name, type, required, default.
            tag_ids:     List of existing tag IDs to associate with the prompt.
            agent_ids:   List of existing agent IDs to associate with the prompt.
        """
        if variables is None:
            variables = []
        if tag_ids is None:
            tag_ids = []
        if agent_ids is None:
            agent_ids = []

        db = _db_module.SessionLocal()
        try:
            db_prompt = Prompt(
                name=name,
                description=description or None,
                content=content,
                version=version,
                created_by=created_by or None,
                variables=variables,
                components=[],
            )
            if tag_ids:
                db_prompt.tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()
            if agent_ids:
                db_prompt.agents = db.query(Agent).filter(Agent.id.in_(agent_ids)).all()
            db.add(db_prompt)
            db.commit()
            db.refresh(db_prompt)
            return _prompt_to_dict(db_prompt, db)
        finally:
            db.close()

    @mcp.tool()
    def get_prompt_versions(prompt_id: int) -> list[dict]:
        """
        Retrieve the full version history for a prompt, including which version is latest.

        The returned list covers the entire version chain (root and all descendants),
        ordered from oldest to newest.  Each entry contains an ``is_latest`` field
        that is ``true`` only for the most recent version in the chain.

        Args:
            prompt_id: The integer ID of any prompt in the version chain.
        """
        db = _db_module.SessionLocal()
        try:
            prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
            if prompt is None:
                return [{"error": f"Prompt {prompt_id} not found"}]
            # Walk up to the root
            root = prompt
            while root.parent_id:
                parent = db.get(Prompt, root.parent_id)
                if parent is None:
                    return [{"error": "Prompt ancestry is inconsistent or parent was not found."}]
                root = parent
            # BFS to collect all descendants
            versions: list[Prompt] = []
            queue = [root]
            while queue:
                current = queue.pop(0)
                versions.append(current)
                children = db.query(Prompt).filter(Prompt.parent_id == current.id).all()
                queue.extend(children)
            return [_prompt_to_dict(v, db) for v in versions]
        finally:
            db.close()

    @mcp.tool()
    def list_tags() -> list[dict]:
        """Return all tags defined in the system."""
        db = _db_module.SessionLocal()
        try:
            tags = db.query(Tag).order_by(Tag.name).all()
            return [{"id": t.id, "name": t.name, "color": t.color} for t in tags]
        finally:
            db.close()

    @mcp.tool()
    def create_tag(name: str, color: str = "#3B82F6") -> dict:
        """
        Create a new tag.

        Args:
            name:  Unique human-readable label for the tag (e.g. "safety").
            color: Hex colour code used in the UI (default: "#3B82F6").
        """
        db = _db_module.SessionLocal()
        try:
            existing = db.query(Tag).filter(Tag.name == name).first()
            if existing is not None:
                return {"error": f"Tag '{name}' already exists (id={existing.id})"}
            tag = Tag(name=name, color=color)
            db.add(tag)
            db.commit()
            db.refresh(tag)
            return {"id": tag.id, "name": tag.name, "color": tag.color}
        finally:
            db.close()

    @mcp.tool()
    def list_agents() -> list[dict]:
        """Return all agents registered in the system."""
        db = _db_module.SessionLocal()
        try:
            agents = db.query(Agent).order_by(Agent.name).all()
            return [
                {
                    "id": a.id,
                    "name": a.name,
                    "description": a.description,
                    "type": a.type,
                    "status": a.status,
                }
                for a in agents
            ]
        finally:
            db.close()

    return mcp


