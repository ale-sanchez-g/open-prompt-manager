"""Tests for the Open Prompt Manager standalone MCP server."""

import json
import urllib.error
from io import BytesIO
from unittest.mock import patch

import pytest

import open_prompt_manager_mcp.server as srv


# ── Helpers ───────────────────────────────────────────────────────────────────


class FakeHTTPResponse:
    """Minimal context-manager mock for urllib HTTP response objects."""

    def __init__(self, body: bytes, status: int = 200):
        self._body = body
        self.status = status

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


def make_http_error(code: int, body: str = "") -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        url="http://example.com",
        code=code,
        msg=f"HTTP Error {code}",
        hdrs=None,
        fp=BytesIO(body.encode("utf-8")),
    )


# ── _headers ──────────────────────────────────────────────────────────────────


def test_headers_without_api_key(monkeypatch):
    monkeypatch.setattr(srv, "API_KEY", "")
    h = srv._headers()
    assert h["Content-Type"] == "application/json"
    assert h["Accept"] == "application/json"
    assert "Authorization" not in h


def test_headers_with_api_key(monkeypatch):
    monkeypatch.setattr(srv, "API_KEY", "mysecret")
    h = srv._headers()
    assert "Authorization" in h
    assert "mysecret" in h["Authorization"]


# ── _get ──────────────────────────────────────────────────────────────────────


def test_get_success(monkeypatch):
    payload = [{"id": 1, "name": "p1"}]
    resp = FakeHTTPResponse(json.dumps(payload).encode())
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", return_value=resp):
        result = srv._get("/api/prompts/")
    assert result == payload


def test_get_appends_query_params(monkeypatch):
    captured_url = []

    def fake_urlopen(req, timeout=None):
        captured_url.append(req.full_url)
        return FakeHTTPResponse(b"[]")

    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        srv._get("/api/prompts/", {"search": "hello", "limit": 10})

    assert "search=hello" in captured_url[0]
    assert "limit=10" in captured_url[0]


def test_get_filters_none_params(monkeypatch):
    captured_url = []

    def fake_urlopen(req, timeout=None):
        captured_url.append(req.full_url)
        return FakeHTTPResponse(b"[]")

    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        srv._get("/api/prompts/", {"tag_id": None, "search": "x"})

    assert "tag_id" not in captured_url[0]
    assert "search=x" in captured_url[0]


def test_get_http_error(monkeypatch):
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", side_effect=make_http_error(404, "not found")):
        result = srv._get("/api/prompts/99")
    assert "error" in result
    assert "404" in result["error"]


def test_get_connection_error(monkeypatch):
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", side_effect=OSError("connection refused")):
        result = srv._get("/api/prompts/")
    assert "error" in result
    assert "connection refused" in result["error"]


# ── _post ─────────────────────────────────────────────────────────────────────


def test_post_success(monkeypatch):
    payload = {"id": 1, "name": "new"}
    resp = FakeHTTPResponse(json.dumps(payload).encode())
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", return_value=resp):
        result = srv._post("/api/prompts/", {"name": "new", "content": "hello"})
    assert result == payload


def test_post_http_error(monkeypatch):
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", side_effect=make_http_error(422, "unprocessable")):
        result = srv._post("/api/prompts/", {})
    assert "error" in result
    assert "422" in result["error"]


def test_post_connection_error(monkeypatch):
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", side_effect=OSError("timeout")):
        result = srv._post("/api/prompts/", {})
    assert "error" in result


# ── _put ──────────────────────────────────────────────────────────────────────


def test_put_success(monkeypatch):
    payload = {"id": 1, "name": "updated"}
    resp = FakeHTTPResponse(json.dumps(payload).encode())
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", return_value=resp):
        result = srv._put("/api/prompts/1", {"name": "updated"})
    assert result == payload


def test_put_http_error(monkeypatch):
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", side_effect=make_http_error(404, "not found")):
        result = srv._put("/api/prompts/99", {})
    assert "error" in result
    assert "404" in result["error"]


# ── _delete ───────────────────────────────────────────────────────────────────


def test_delete_returns_success_on_204(monkeypatch):
    resp = FakeHTTPResponse(b"", status=204)
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", return_value=resp):
        result = srv._delete("/api/prompts/1")
    assert result == {"success": True}


def test_delete_returns_body_on_200(monkeypatch):
    payload = {"deleted": True}
    resp = FakeHTTPResponse(json.dumps(payload).encode(), status=200)
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", return_value=resp):
        result = srv._delete("/api/prompts/1")
    assert result == payload


def test_delete_http_error(monkeypatch):
    monkeypatch.setattr(srv, "API_KEY", "")
    with patch("urllib.request.urlopen", side_effect=make_http_error(404, "not found")):
        result = srv._delete("/api/prompts/99")
    assert "error" in result
    assert "404" in result["error"]


# ── list_prompts — limit clamping ─────────────────────────────────────────────


def test_list_prompts_clamps_limit_below_minimum(monkeypatch):
    captured = {}

    def fake_get(path, params=None):
        captured.update(params or {})
        return []

    monkeypatch.setattr(srv, "_get", fake_get)
    srv.list_prompts(limit=0)
    assert captured["limit"] == 1


def test_list_prompts_clamps_limit_above_maximum(monkeypatch):
    captured = {}

    def fake_get(path, params=None):
        captured.update(params or {})
        return []

    monkeypatch.setattr(srv, "_get", fake_get)
    srv.list_prompts(limit=9999)
    assert captured["limit"] == 200


def test_list_prompts_valid_limit_unchanged(monkeypatch):
    captured = {}

    def fake_get(path, params=None):
        captured.update(params or {})
        return []

    monkeypatch.setattr(srv, "_get", fake_get)
    srv.list_prompts(limit=50)
    assert captured["limit"] == 50


def test_list_prompts_passes_optional_filters(monkeypatch):
    captured = {}

    def fake_get(path, params=None):
        captured.update(params or {})
        return []

    monkeypatch.setattr(srv, "_get", fake_get)
    srv.list_prompts(search="foo", tag_id=3, agent_id=7)
    assert captured["search"] == "foo"
    assert captured["tag_id"] == 3
    assert captured["agent_id"] == 7


# ── create_agent — agent_type maps to "type" in payload ──────────────────────


def test_create_agent_sends_type_field(monkeypatch):
    captured_payload = {}

    def fake_post(path, payload):
        captured_payload.update(payload)
        return {"id": 1}

    monkeypatch.setattr(srv, "_post", fake_post)
    srv.create_agent(name="Bot", agent_type="custom")
    assert captured_payload["type"] == "custom"
    assert "agent_type" not in captured_payload


def test_create_agent_default_type(monkeypatch):
    captured_payload = {}

    def fake_post(path, payload):
        captured_payload.update(payload)
        return {"id": 1}

    monkeypatch.setattr(srv, "_post", fake_post)
    srv.create_agent(name="Bot")
    assert captured_payload["type"] == "generic"


# ── update_agent — agent_type maps to "type" in payload ──────────────────────


def test_update_agent_sends_type_field(monkeypatch):
    captured_payload = {}

    def fake_put(path, payload):
        captured_payload.update(payload)
        return {"id": 1}

    monkeypatch.setattr(srv, "_put", fake_put)
    srv.update_agent(agent_id=1, agent_type="specialist")
    assert captured_payload["type"] == "specialist"
    assert "agent_type" not in captured_payload


def test_update_agent_omits_none_fields(monkeypatch):
    captured_payload = {}

    def fake_put(path, payload):
        captured_payload.update(payload)
        return {"id": 1}

    monkeypatch.setattr(srv, "_put", fake_put)
    srv.update_agent(agent_id=1, name="NewName")
    assert captured_payload == {"name": "NewName"}
    assert "type" not in captured_payload
    assert "description" not in captured_payload
    assert "status" not in captured_payload


def test_update_agent_multiple_fields(monkeypatch):
    captured_payload = {}

    def fake_put(path, payload):
        captured_payload.update(payload)
        return {"id": 1}

    monkeypatch.setattr(srv, "_put", fake_put)
    srv.update_agent(agent_id=1, name="Bot2", agent_type="llm", status="inactive")
    assert captured_payload == {"name": "Bot2", "type": "llm", "status": "inactive"}
