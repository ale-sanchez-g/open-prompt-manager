AGENT_PAYLOAD = {
    "name": "Chatbot Agent",
    "description": "A conversational agent",
    "type": "chatbot",
    "status": "active",
}


def test_create_agent(client):
    response = client.post("/agents/", json=AGENT_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == AGENT_PAYLOAD["name"]
    assert data["status"] == "active"
    assert data["id"] is not None


def test_create_duplicate_agent(client):
    client.post("/agents/", json=AGENT_PAYLOAD)
    response = client.post("/agents/", json=AGENT_PAYLOAD)
    assert response.status_code == 409


def test_list_agents(client):
    client.post("/agents/", json=AGENT_PAYLOAD)
    client.post("/agents/", json={**AGENT_PAYLOAD, "name": "Second Agent"})
    response = client.get("/agents/")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_agent(client):
    created = client.post("/agents/", json=AGENT_PAYLOAD).json()
    response = client.get(f"/agents/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_agent_not_found(client):
    response = client.get("/agents/999")
    assert response.status_code == 404


def test_update_agent(client):
    created = client.post("/agents/", json=AGENT_PAYLOAD).json()
    response = client.put(
        f"/agents/{created['id']}",
        json={"status": "deprecated", "description": "Old agent"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "deprecated"
    assert data["description"] == "Old agent"
    assert data["name"] == AGENT_PAYLOAD["name"]  # unchanged


def test_delete_agent(client):
    created = client.post("/agents/", json=AGENT_PAYLOAD).json()
    response = client.delete(f"/agents/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/agents/{created['id']}").status_code == 404


def test_delete_agent_not_found(client):
    response = client.delete("/agents/999")
    assert response.status_code == 404


def test_prompt_with_agent(client):
    agent = client.post("/agents/", json=AGENT_PAYLOAD).json()
    prompt = client.post("/prompts/", json={
        "name": "Agent Prompt",
        "content": "content",
        "tag_ids": [],
        "agent_ids": [agent["id"]],
    }).json()
    assert any(a["id"] == agent["id"] for a in prompt["agents"])


def test_list_prompts_filtered_by_agent(client):
    agent = client.post("/agents/", json=AGENT_PAYLOAD).json()
    client.post("/prompts/", json={"name": "P1", "content": "c", "tag_ids": [], "agent_ids": [agent["id"]]})
    client.post("/prompts/", json={"name": "P2", "content": "c", "tag_ids": [], "agent_ids": []})

    response = client.get("/prompts/", params={"agent_id": agent["id"]})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["name"] == "P1"


def test_execution_with_agent(client):
    agent = client.post("/agents/", json=AGENT_PAYLOAD).json()
    prompt = client.post("/prompts/", json={
        "name": "P", "content": "c", "tag_ids": [], "agent_ids": [],
    }).json()
    response = client.post(
        f"/prompts/{prompt['id']}/executions",
        json={"agent_id": agent["id"], "success": 1},
    )
    assert response.status_code == 201
    assert response.json()["agent_id"] == agent["id"]
