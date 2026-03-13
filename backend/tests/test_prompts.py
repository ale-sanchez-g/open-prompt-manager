import pytest


PROMPT_PAYLOAD = {
    "name": "Greeting Prompt",
    "description": "A simple greeting",
    "content": "Hello, {{user_name}}! Welcome to {{platform}}.",
    "version": "1.0.0",
    "variables": [
        {"name": "user_name", "type": "string", "required": True, "description": "User's name"},
        {"name": "platform", "type": "string", "required": False, "default": "our platform", "description": "Platform name"},
    ],
    "tag_ids": [],
    "agent_ids": [],
}


# ── CRUD ──────────────────────────────────────────────────────────────────────

def test_create_prompt(client):
    response = client.post("/prompts/", json=PROMPT_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == PROMPT_PAYLOAD["name"]
    assert data["version"] == "1.0.0"
    assert data["id"] is not None
    assert len(data["variables"]) == 2


def test_list_prompts_empty(client):
    response = client.get("/prompts/")
    assert response.status_code == 200
    assert response.json() == []


def test_list_prompts(client):
    client.post("/prompts/", json=PROMPT_PAYLOAD)
    client.post("/prompts/", json={**PROMPT_PAYLOAD, "name": "Second Prompt"})
    response = client.get("/prompts/")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_prompt(client):
    created = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    response = client.get(f"/prompts/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_prompt_not_found(client):
    response = client.get("/prompts/999")
    assert response.status_code == 404


def test_update_prompt(client):
    created = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    response = client.put(
        f"/prompts/{created['id']}",
        json={"name": "Updated Name", "description": "New description"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"
    assert response.json()["description"] == "New description"
    # Content unchanged
    assert response.json()["content"] == PROMPT_PAYLOAD["content"]


def test_delete_prompt(client):
    created = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    response = client.delete(f"/prompts/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/prompts/{created['id']}").status_code == 404


def test_list_prompts_search(client):
    client.post("/prompts/", json=PROMPT_PAYLOAD)
    client.post("/prompts/", json={**PROMPT_PAYLOAD, "name": "Farewell Prompt", "description": "goodbye"})
    response = client.get("/prompts/", params={"search": "Greeting"})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["name"] == "Greeting Prompt"


# ── Rendering ─────────────────────────────────────────────────────────────────

def test_render_prompt_with_variables(client):
    created = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    response = client.post(
        f"/prompts/{created['id']}/render",
        json={"variables": {"user_name": "Alice", "platform": "PromptHub"}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["rendered_content"] == "Hello, Alice! Welcome to PromptHub."
    assert "user_name" in data["variables_used"]
    assert "platform" in data["variables_used"]


def test_render_prompt_uses_default_value(client):
    created = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    response = client.post(
        f"/prompts/{created['id']}/render",
        json={"variables": {"user_name": "Bob"}},
    )
    assert response.status_code == 200
    assert "our platform" in response.json()["rendered_content"]


def test_render_prompt_missing_required_variable(client):
    created = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    response = client.post(
        f"/prompts/{created['id']}/render",
        json={"variables": {}},  # user_name is required
    )
    assert response.status_code == 422


def test_render_no_variables(client):
    created = client.post("/prompts/", json={
        **PROMPT_PAYLOAD,
        "content": "Static content with no placeholders.",
        "variables": [],
    }).json()
    response = client.post(f"/prompts/{created['id']}/render", json={"variables": {}})
    assert response.status_code == 200
    assert response.json()["rendered_content"] == "Static content with no placeholders."


# ── Component rendering ───────────────────────────────────────────────────────

def test_render_component_reference(client):
    component = client.post("/prompts/", json={
        **PROMPT_PAYLOAD,
        "name": "Component",
        "content": "I am a component.",
        "variables": [],
    }).json()
    parent = client.post("/prompts/", json={
        **PROMPT_PAYLOAD,
        "name": "Parent",
        "content": f"Before. {{{{component:{component['id']}}}}} After.",
        "variables": [],
    }).json()
    response = client.post(f"/prompts/{parent['id']}/render", json={"variables": {}})
    assert response.status_code == 200
    assert response.json()["rendered_content"] == "Before. I am a component. After."
    assert component["id"] in response.json()["components_resolved"]


def test_render_circular_component_fails(client):
    # Create prompt A, then update content to reference itself
    a = client.post("/prompts/", json={
        **PROMPT_PAYLOAD,
        "name": "Self-ref",
        "content": "placeholder",
        "variables": [],
    }).json()
    client.put(f"/prompts/{a['id']}", json={"content": f"{{{{component:{a['id']}}}}}"})
    response = client.post(f"/prompts/{a['id']}/render", json={"variables": {}})
    assert response.status_code == 422


# ── Version control ───────────────────────────────────────────────────────────

def test_create_version(client):
    parent = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    response = client.post(
        f"/prompts/{parent['id']}/versions",
        json={"content": "Updated content for v2.", "description": "v2 changes"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["version"] == "1.0.1"
    assert data["parent_id"] == parent["id"]
    assert data["content"] == "Updated content for v2."


def test_create_version_custom_version_string(client):
    parent = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    response = client.post(
        f"/prompts/{parent['id']}/versions",
        json={"version": "2.0.0"},
    )
    assert response.status_code == 201
    assert response.json()["version"] == "2.0.0"


def test_get_versions(client):
    parent = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    client.post(f"/prompts/{parent['id']}/versions", json={})
    client.post(f"/prompts/{parent['id']}/versions", json={})
    response = client.get(f"/prompts/{parent['id']}/versions")
    assert response.status_code == 200
    assert len(response.json()) == 3  # original + 2 versions


# ── Executions ────────────────────────────────────────────────────────────────

def test_create_execution(client):
    prompt = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    response = client.post(
        f"/prompts/{prompt['id']}/executions",
        json={
            "input_variables": {"user_name": "Alice", "platform": "PromptHub"},
            "rendered_prompt": "Hello, Alice! Welcome to PromptHub.",
            "response": "Thanks!",
            "execution_time_ms": 250,
            "token_count": 32,
            "cost": 0.0002,
            "success": 1,
            "rating": 5,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["prompt_id"] == prompt["id"]
    assert data["rating"] == 5


def test_execution_updates_prompt_stats(client):
    prompt = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    client.post(f"/prompts/{prompt['id']}/executions", json={"success": 1, "rating": 4})
    client.post(f"/prompts/{prompt['id']}/executions", json={"success": 1, "rating": 2})
    client.post(f"/prompts/{prompt['id']}/executions", json={"success": 0})

    updated = client.get(f"/prompts/{prompt['id']}").json()
    assert updated["usage_count"] == 3
    assert abs(updated["avg_rating"] - 3.0) < 0.01  # (4+2)/2
    assert abs(updated["success_rate"] - (2 / 3)) < 0.01


def test_get_executions(client):
    prompt = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    client.post(f"/prompts/{prompt['id']}/executions", json={"success": 1})
    client.post(f"/prompts/{prompt['id']}/executions", json={"success": 1})
    response = client.get(f"/prompts/{prompt['id']}/executions")
    assert response.status_code == 200
    assert len(response.json()) == 2


# ── Metrics ───────────────────────────────────────────────────────────────────

def test_add_and_get_metrics(client):
    prompt = client.post("/prompts/", json=PROMPT_PAYLOAD).json()
    client.post(
        f"/prompts/{prompt['id']}/metrics",
        json={"metric_name": "latency_p99", "metric_value": 312.5},
    )
    response = client.get(f"/prompts/{prompt['id']}/metrics")
    assert response.status_code == 200
    metrics = response.json()
    assert len(metrics) == 1
    assert metrics[0]["metric_name"] == "latency_p99"
    assert metrics[0]["metric_value"] == 312.5
