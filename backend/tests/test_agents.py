AGENT_PAYLOAD = {
    "name": "Chatbot Agent",
    "description": "A conversational agent",
    "type": "chatbot",
    "status": "active",
}


def test_create_agent(client):
    response = client.post("/api/agents/", json=AGENT_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == AGENT_PAYLOAD["name"]
    assert data["status"] == "active"
    assert data["id"] is not None


def test_create_duplicate_agent(client):
    client.post("/api/agents/", json=AGENT_PAYLOAD)
    response = client.post("/api/agents/", json=AGENT_PAYLOAD)
    assert response.status_code == 409


def test_list_agents(client):
    client.post("/api/agents/", json=AGENT_PAYLOAD)
    client.post("/api/agents/", json={**AGENT_PAYLOAD, "name": "Second Agent"})
    response = client.get("/api/agents/")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_agent(client):
    created = client.post("/api/agents/", json=AGENT_PAYLOAD).json()
    response = client.get(f"/api/agents/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_agent_not_found(client):
    response = client.get("/api/agents/999")
    assert response.status_code == 404


def test_update_agent(client):
    created = client.post("/api/agents/", json=AGENT_PAYLOAD).json()
    response = client.put(
        f"/api/agents/{created['id']}",
        json={"status": "deprecated", "description": "Old agent"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "deprecated"
    assert data["description"] == "Old agent"
    assert data["name"] == AGENT_PAYLOAD["name"]  # unchanged


def test_delete_agent(client):
    created = client.post("/api/agents/", json=AGENT_PAYLOAD).json()
    response = client.delete(f"/api/agents/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/agents/{created['id']}").status_code == 404


def test_delete_agent_not_found(client):
    response = client.delete("/api/agents/999")
    assert response.status_code == 404


def test_get_agent_detail_with_prompts(client):
    agent = client.post('/api/agents/', json=AGENT_PAYLOAD).json()
    client.post('/api/prompts/', json={
        'name': 'Agent Prompt', 'content': 'c', 'tag_ids': [], 'agent_ids': [agent['id']],
    })
    response = client.get(f"/api/agents/{agent['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data['id'] == agent['id']
    assert len(data['prompts']) == 1
    assert data['prompts'][0]['name'] == 'Agent Prompt'
    assert 'execution_count' in data
    assert 'success_rate' in data
    assert 'avg_rating' in data
    assert 'updated_at' in data


def test_get_agent_detail_execution_stats(client):
    agent = client.post('/api/agents/', json=AGENT_PAYLOAD).json()
    prompt = client.post('/api/prompts/', json={
        'name': 'P', 'content': 'c', 'tag_ids': [], 'agent_ids': [],
    }).json()
    client.post(f"/api/prompts/{prompt['id']}/executions", json={'agent_id': agent['id'], 'success': 1, 'rating': 4})
    client.post(f"/api/prompts/{prompt['id']}/executions", json={'agent_id': agent['id'], 'success': 0, 'rating': 2})
    response = client.get(f"/api/agents/{agent['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data['execution_count'] == 2
    assert data['success_rate'] == 0.5
    assert data['avg_rating'] == 3.0


def test_get_agent_detail_no_executions(client):
    agent = client.post('/api/agents/', json=AGENT_PAYLOAD).json()
    response = client.get(f"/api/agents/{agent['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data['execution_count'] == 0
    assert data['success_rate'] == 0.0
    assert data['avg_rating'] == 0.0
    assert data['prompts'] == []


def test_prompt_with_agent(client):
    agent = client.post("/api/agents/", json=AGENT_PAYLOAD).json()
    prompt = client.post("/api/prompts/", json={
        "name": "Agent Prompt",
        "content": "content",
        "tag_ids": [],
        "agent_ids": [agent["id"]],
    }).json()
    assert any(a["id"] == agent["id"] for a in prompt["agents"])


def test_list_prompts_filtered_by_agent(client):
    agent = client.post("/api/agents/", json=AGENT_PAYLOAD).json()
    client.post("/api/prompts/", json={"name": "P1", "content": "c", "tag_ids": [], "agent_ids": [agent["id"]]})
    client.post("/api/prompts/", json={"name": "P2", "content": "c", "tag_ids": [], "agent_ids": []})

    response = client.get("/api/prompts/", params={"agent_id": agent["id"]})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["name"] == "P1"


def test_execution_with_agent(client):
    agent = client.post("/api/agents/", json=AGENT_PAYLOAD).json()
    prompt = client.post("/api/prompts/", json={
        "name": "P", "content": "c", "tag_ids": [], "agent_ids": [],
    }).json()
    response = client.post(
        f"/api/prompts/{prompt['id']}/executions",
        json={"agent_id": agent["id"], "success": 1},
    )
    assert response.status_code == 201
    assert response.json()["agent_id"] == agent["id"]
