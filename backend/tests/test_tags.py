def test_create_tag(client):
    response = client.post("/api/tags/", json={"name": "production", "color": "#10B981"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "production"
    assert data["color"] == "#10B981"
    assert data["id"] is not None


def test_create_tag_default_color(client):
    response = client.post("/api/tags/", json={"name": "beta"})
    assert response.status_code == 201
    assert response.json()["color"] == "#3B82F6"


def test_create_duplicate_tag(client):
    client.post("/api/tags/", json={"name": "unique"})
    response = client.post("/api/tags/", json={"name": "unique"})
    assert response.status_code == 409


def test_list_tags(client):
    client.post("/api/tags/", json={"name": "alpha"})
    client.post("/api/tags/", json={"name": "beta"})
    response = client.get("/api/tags/")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_delete_tag(client):
    tag = client.post("/api/tags/", json={"name": "temp"}).json()
    response = client.delete(f"/api/tags/{tag['id']}")
    assert response.status_code == 204
    assert len(client.get("/api/tags/").json()) == 0


def test_delete_tag_not_found(client):
    response = client.delete("/api/tags/999")
    assert response.status_code == 404


def test_prompt_with_tag(client):
    tag = client.post("/api/tags/", json={"name": "v1", "color": "#EF4444"}).json()
    prompt = client.post("/api/prompts/", json={
        "name": "Tagged Prompt",
        "content": "content",
        "tag_ids": [tag["id"]],
        "agent_ids": [],
    }).json()
    assert any(t["id"] == tag["id"] for t in prompt["tags"])


def test_list_prompts_filtered_by_tag(client):
    tag = client.post("/api/tags/", json={"name": "filter-tag"}).json()
    client.post("/api/prompts/", json={"name": "P1", "content": "c", "tag_ids": [tag["id"]], "agent_ids": []})
    client.post("/api/prompts/", json={"name": "P2", "content": "c", "tag_ids": [], "agent_ids": []})

    response = client.get("/api/prompts/", params={"tag_id": tag["id"]})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["name"] == "P1"
