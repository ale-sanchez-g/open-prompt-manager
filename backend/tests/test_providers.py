import pytest
from cryptography.fernet import Fernet

STRONG_PASSWORD = 'Str0ng!Pass1'
OTHER_PASSWORD = 'An0ther!Pass2'

TEST_ENCRYPTION_KEY = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch):
    monkeypatch.setenv('OPM_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)


def _register(anon_client, email, password=STRONG_PASSWORD):
    response = anon_client.post('/auth/register', json={'email': email, 'password': password})
    assert response.status_code == 201
    return response.json()['id']


def _login(anon_client, email, password=STRONG_PASSWORD):
    response = anon_client.post('/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200
    return response.json()['access_token']


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture
def admin_token(anon_client):
    _register(anon_client, 'admin@opm.io')
    return _login(anon_client, 'admin@opm.io')


@pytest.fixture
def member_token(anon_client, admin_token):
    _register(anon_client, 'member@opm.io', OTHER_PASSWORD)
    return _login(anon_client, 'member@opm.io', OTHER_PASSWORD)


PROVIDER_PAYLOAD = {
    'name': 'My DeepSeek Account',
    'provider_type': 'openai_compatible',
    'base_url': 'https://api.deepseek.com',
    'api_key': 'sk-abcdefgh123456',
    'default_model': 'deepseek-chat',
    'cost_per_1k_input_tokens': 0.001,
    'cost_per_1k_output_tokens': 0.002,
}


def _create_provider(anon_client, admin_token, payload=None):
    response = anon_client.post('/api/providers/', json=payload or PROVIDER_PAYLOAD, headers=_auth(admin_token))
    assert response.status_code == 201
    return response.json()


# ---------------------------------------------------------------------------
# CRUD happy paths
# ---------------------------------------------------------------------------

def test_create_provider(anon_client, admin_token):
    body = _create_provider(anon_client, admin_token)
    assert body['name'] == 'My DeepSeek Account'
    assert body['provider_type'] == 'openai_compatible'
    assert body['base_url'] == 'https://api.deepseek.com'
    assert body['default_model'] == 'deepseek-chat'
    assert body['enabled'] is True
    assert body['api_key_masked'] == 'sk-***456'


def test_list_providers(anon_client, admin_token):
    _create_provider(anon_client, admin_token)
    response = anon_client.get('/api/providers/', headers=_auth(admin_token))
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]['name'] == 'My DeepSeek Account'


def test_update_provider(anon_client, admin_token):
    created = _create_provider(anon_client, admin_token)
    response = anon_client.put(
        f"/api/providers/{created['id']}",
        json={'default_model': 'deepseek-reasoner', 'enabled': False},
        headers=_auth(admin_token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body['default_model'] == 'deepseek-reasoner'
    assert body['enabled'] is False
    # Untouched fields remain as they were
    assert body['name'] == 'My DeepSeek Account'
    assert body['api_key_masked'] == 'sk-***456'


def test_delete_provider(anon_client, admin_token):
    created = _create_provider(anon_client, admin_token)
    response = anon_client.delete(f"/api/providers/{created['id']}", headers=_auth(admin_token))
    assert response.status_code == 204

    response = anon_client.get('/api/providers/', headers=_auth(admin_token))
    assert response.json() == []


def test_create_with_invalid_provider_type_returns_422(anon_client, admin_token):
    payload = dict(PROVIDER_PAYLOAD, provider_type='not-a-real-provider')
    response = anon_client.post('/api/providers/', json=payload, headers=_auth(admin_token))

    # An unconstrained string here would persist a broken config that later
    # 500s when get_provider() is called against it — must be rejected at
    # the schema level instead.
    assert response.status_code == 422


def test_update_with_invalid_provider_type_returns_422(anon_client, admin_token):
    created = _create_provider(anon_client, admin_token)
    response = anon_client.put(
        f"/api/providers/{created['id']}",
        json={'provider_type': 'not-a-real-provider'},
        headers=_auth(admin_token),
    )
    assert response.status_code == 422


def test_get_models_and_test_404_for_missing_provider(anon_client, admin_token):
    response = anon_client.get('/api/providers/999/models', headers=_auth(admin_token))
    assert response.status_code == 404

    response = anon_client.post('/api/providers/999/test', headers=_auth(admin_token))
    assert response.status_code == 404


def test_update_missing_provider_returns_404(anon_client, admin_token):
    response = anon_client.put('/api/providers/999', json={'default_model': 'x'}, headers=_auth(admin_token))
    assert response.status_code == 404


def test_delete_missing_provider_returns_404(anon_client, admin_token):
    response = anon_client.delete('/api/providers/999', headers=_auth(admin_token))
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------

def test_non_admin_cannot_create_provider(anon_client, member_token):
    response = anon_client.post('/api/providers/', json=PROVIDER_PAYLOAD, headers=_auth(member_token))
    assert response.status_code == 403


def test_non_admin_cannot_update_provider(anon_client, admin_token, member_token):
    created = _create_provider(anon_client, admin_token)
    response = anon_client.put(
        f"/api/providers/{created['id']}",
        json={'default_model': 'x'},
        headers=_auth(member_token),
    )
    assert response.status_code == 403


def test_non_admin_cannot_delete_provider(anon_client, admin_token, member_token):
    created = _create_provider(anon_client, admin_token)
    response = anon_client.delete(f"/api/providers/{created['id']}", headers=_auth(member_token))
    assert response.status_code == 403


def test_non_admin_can_list_providers(anon_client, admin_token, member_token):
    _create_provider(anon_client, admin_token)
    response = anon_client.get('/api/providers/', headers=_auth(member_token))
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_providers_require_authentication(anon_client):
    response = anon_client.get('/api/providers/')
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# No plaintext key leakage
# ---------------------------------------------------------------------------

def test_create_response_never_contains_plaintext_key(anon_client, admin_token):
    response = anon_client.post('/api/providers/', json=PROVIDER_PAYLOAD, headers=_auth(admin_token))
    assert response.status_code == 201
    assert PROVIDER_PAYLOAD['api_key'] not in response.text
    assert 'api_key' not in response.json()


def test_list_response_never_contains_plaintext_key(anon_client, admin_token):
    _create_provider(anon_client, admin_token)
    response = anon_client.get('/api/providers/', headers=_auth(admin_token))
    assert PROVIDER_PAYLOAD['api_key'] not in response.text
    for provider in response.json():
        assert 'api_key' not in provider


def test_update_response_never_contains_plaintext_key(anon_client, admin_token):
    created = _create_provider(anon_client, admin_token)
    response = anon_client.put(
        f"/api/providers/{created['id']}",
        json={'default_model': 'deepseek-reasoner'},
        headers=_auth(admin_token),
    )
    assert PROVIDER_PAYLOAD['api_key'] not in response.text


# ---------------------------------------------------------------------------
# Update with blank api_key keeps the existing key
# ---------------------------------------------------------------------------

def test_update_with_blank_api_key_keeps_existing_key(anon_client, admin_token):
    created = _create_provider(anon_client, admin_token)
    original_masked = created['api_key_masked']

    response = anon_client.put(
        f"/api/providers/{created['id']}",
        json={'api_key': '', 'default_model': 'deepseek-reasoner'},
        headers=_auth(admin_token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body['api_key_masked'] == original_masked
    assert body['default_model'] == 'deepseek-reasoner'


def test_update_with_omitted_api_key_keeps_existing_key(anon_client, admin_token):
    created = _create_provider(anon_client, admin_token)
    original_masked = created['api_key_masked']

    response = anon_client.put(
        f"/api/providers/{created['id']}",
        json={'default_model': 'deepseek-reasoner'},
        headers=_auth(admin_token),
    )
    assert response.status_code == 200
    assert response.json()['api_key_masked'] == original_masked


def test_update_with_new_api_key_replaces_existing_key(anon_client, admin_token):
    created = _create_provider(anon_client, admin_token)

    response = anon_client.put(
        f"/api/providers/{created['id']}",
        json={'api_key': 'sk-brand-new-key-999'},
        headers=_auth(admin_token),
    )
    assert response.status_code == 200
    assert response.json()['api_key_masked'] == 'sk-***999'


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------

def test_presets_returns_known_providers(anon_client):
    response = anon_client.get('/api/providers/presets')
    assert response.status_code == 200
    body = response.json()
    keys = {p['key'] for p in body}
    assert keys == {'deepseek', 'groq', 'openrouter'}
    for preset in body:
        assert preset['name']
        assert preset['base_url'].startswith('https://')


def test_presets_is_unauthenticated(anon_client):
    response = anon_client.get('/api/providers/presets')
    assert response.status_code == 200
