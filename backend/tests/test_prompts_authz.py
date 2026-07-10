"""Object-level authorization (BOLA) tests for prompt CRUD — issue #336.

Authorization model under test:
  * Reads/list are shared-workspace: any authenticated user may GET/LIST any prompt.
  * Mutations (PUT, DELETE, POST /versions) require the caller to be the prompt
    owner (``created_by``) or hold the admin role; otherwise the API returns 403.

Note on fixtures: the FIRST registered user in a fresh database automatically
becomes admin (see test_admin.test_first_registered_user_becomes_admin), so
these tests register a throwaway admin first, then two regular users A and B.
"""

STRONG_PASSWORD = 'Str0ng!Pass1'

PROMPT_PAYLOAD = {
    "name": "Owned Prompt",
    "description": "Belongs to user A",
    "content": "Hello, {{user_name}}!",
    "version": "1.0.0",
    "variables": [
        {"name": "user_name", "type": "string", "required": True, "description": "Name"},
    ],
    "tag_ids": [],
    "agent_ids": [],
}


def _register(anon_client, email, password=STRONG_PASSWORD):
    response = anon_client.post('/auth/register', json={'email': email, 'password': password})
    assert response.status_code == 201, response.text
    return response.json()


def _login(anon_client, email, password=STRONG_PASSWORD):
    response = anon_client.post('/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200, response.text
    return response.json()['access_token']


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


def _make_users(anon_client):
    """Create an admin (first user), then two regular users A and B.

    Returns a dict of access tokens keyed by role/name.
    """
    _register(anon_client, 'admin@opm.io')  # first user -> admin
    _register(anon_client, 'user-a@opm.io')  # -> user
    _register(anon_client, 'user-b@opm.io')  # -> user
    return {
        'admin': _login(anon_client, 'admin@opm.io'),
        'a': _login(anon_client, 'user-a@opm.io'),
        'b': _login(anon_client, 'user-b@opm.io'),
    }


def _create_prompt_as(anon_client, token, **overrides):
    payload = {**PROMPT_PAYLOAD, **overrides}
    response = anon_client.post('/api/prompts/', json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


# ── Negative: non-owner cannot mutate ──────────────────────────────────────────

def test_non_owner_cannot_update_prompt(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    response = anon_client.put(
        f"/api/prompts/{prompt['id']}",
        json={"name": "Hijacked"},
        headers=_auth(tokens['b']),
    )
    assert response.status_code == 403
    # The prompt was not modified.
    fetched = anon_client.get(f"/api/prompts/{prompt['id']}", headers=_auth(tokens['a'])).json()
    assert fetched['name'] == PROMPT_PAYLOAD['name']


def test_non_owner_cannot_delete_prompt(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    response = anon_client.delete(
        f"/api/prompts/{prompt['id']}",
        headers=_auth(tokens['b']),
    )
    assert response.status_code == 403
    # The prompt still exists.
    assert anon_client.get(
        f"/api/prompts/{prompt['id']}", headers=_auth(tokens['a'])
    ).status_code == 200


def test_non_owner_cannot_create_version(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    response = anon_client.post(
        f"/api/prompts/{prompt['id']}/versions",
        json={"content": "sneaky v2"},
        headers=_auth(tokens['b']),
    )
    assert response.status_code == 403
    # No child version was created.
    versions = anon_client.get(
        f"/api/prompts/{prompt['id']}/versions", headers=_auth(tokens['a'])
    ).json()
    assert len(versions) == 1


# ── Positive: owner can mutate ─────────────────────────────────────────────────

def test_owner_can_update_prompt(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    response = anon_client.put(
        f"/api/prompts/{prompt['id']}",
        json={"name": "Renamed By Owner"},
        headers=_auth(tokens['a']),
    )
    assert response.status_code == 200
    assert response.json()['name'] == "Renamed By Owner"


def test_owner_can_delete_prompt(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    response = anon_client.delete(
        f"/api/prompts/{prompt['id']}",
        headers=_auth(tokens['a']),
    )
    assert response.status_code == 204


def test_owner_can_create_version(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    response = anon_client.post(
        f"/api/prompts/{prompt['id']}/versions",
        json={"content": "legit v2"},
        headers=_auth(tokens['a']),
    )
    assert response.status_code == 201
    assert response.json()['parent_id'] == prompt['id']


# ── Positive: admin can mutate anyone's prompt ─────────────────────────────────

def test_admin_can_update_others_prompt(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    response = anon_client.put(
        f"/api/prompts/{prompt['id']}",
        json={"name": "Admin Edit"},
        headers=_auth(tokens['admin']),
    )
    assert response.status_code == 200
    assert response.json()['name'] == "Admin Edit"


def test_admin_can_delete_others_prompt(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    response = anon_client.delete(
        f"/api/prompts/{prompt['id']}",
        headers=_auth(tokens['admin']),
    )
    assert response.status_code == 204


def test_admin_can_create_version_of_others_prompt(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    response = anon_client.post(
        f"/api/prompts/{prompt['id']}/versions",
        json={"content": "admin v2"},
        headers=_auth(tokens['admin']),
    )
    assert response.status_code == 201


# ── Reads remain shared-workspace ──────────────────────────────────────────────

def test_non_owner_can_still_read_and_list(anon_client):
    tokens = _make_users(anon_client)
    prompt = _create_prompt_as(anon_client, tokens['a'])

    # User B can GET user A's prompt.
    assert anon_client.get(
        f"/api/prompts/{prompt['id']}", headers=_auth(tokens['b'])
    ).status_code == 200
    # User B can see it in the list.
    listed = anon_client.get('/api/prompts/', headers=_auth(tokens['b'])).json()
    assert any(p['id'] == prompt['id'] for p in listed)
