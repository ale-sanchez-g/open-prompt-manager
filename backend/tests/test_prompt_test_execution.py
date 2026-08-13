"""
Unit tests for POST /api/prompts/{prompt_id}/test.

The live LLM call is mocked by monkeypatching ``app.api.prompts.get_provider``
to return a fake ``LLMProvider`` whose ``chat()`` either returns a
``CompletionResult`` or raises a normalized provider exception — no real
network call is made.
"""
import pytest
from cryptography.fernet import Fernet

from app.services.llm.base import CompletionResult, ProviderTimeoutError

STRONG_PASSWORD = 'Str0ng!Pass1'
OTHER_PASSWORD = 'An0ther!Pass2'

TEST_ENCRYPTION_KEY = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch):
    monkeypatch.setenv('OPM_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)


@pytest.fixture(autouse=True)
def admin_bootstrap(monkeypatch):
    # Deterministically make admin@opm.io an admin regardless of registration
    # order relative to the `client` fixture's own user (see is_bootstrap_admin).
    monkeypatch.setenv('ADMIN_EMAILS', 'admin@opm.io')


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


def _register(anon_client, email, password=STRONG_PASSWORD):
    response = anon_client.post('/auth/register', json={'email': email, 'password': password})
    assert response.status_code == 201
    return response.json()['id']


def _login(anon_client, email, password=STRONG_PASSWORD):
    response = anon_client.post('/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200
    return response.json()['access_token']


@pytest.fixture
def admin_token(anon_client):
    _register(anon_client, 'admin@opm.io')
    return _login(anon_client, 'admin@opm.io')


PROVIDER_PAYLOAD = {
    'name': 'My DeepSeek Account',
    'provider_type': 'openai_compatible',
    'base_url': 'https://api.deepseek.com',
    'api_key': 'sk-abcdefgh123456',
    'default_model': 'deepseek-chat',
}


def _create_provider(anon_client, admin_token, payload=None):
    response = anon_client.post('/api/providers/', json=payload or PROVIDER_PAYLOAD, headers=_auth(admin_token))
    assert response.status_code == 201
    return response.json()


def _create_prompt(client, content='Hello, {{user_name}}!', variables=None):
    payload = {
        'name': 'Greeting Prompt',
        'content': content,
        'variables': variables if variables is not None else [
            {'name': 'user_name', 'type': 'string', 'required': True},
        ],
    }
    response = client.post('/api/prompts/', json=payload)
    assert response.status_code == 201
    return response.json()


class FakeProvider:
    """Stand-in LLMProvider whose chat() is scripted per test."""

    def __init__(self, result=None, error=None):
        self._result = result
        self._error = error
        self.calls = []

    async def chat(self, messages, model, params=None):
        self.calls.append({'messages': messages, 'model': model, 'params': params})
        if self._error is not None:
            raise self._error
        return self._result


def _patch_provider(monkeypatch, fake_provider):
    monkeypatch.setattr('app.api.prompts.get_provider', lambda config: fake_provider)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_test_prompt_happy_path(client, anon_client, admin_token, monkeypatch):
    provider = _create_provider(anon_client, admin_token)
    prompt = _create_prompt(client)

    fake = FakeProvider(result=CompletionResult(
        content='Hello, Alice!',
        model='deepseek-chat',
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
        latency_ms=123.4,
        finish_reason='stop',
    ))
    _patch_provider(monkeypatch, fake)

    response = client.post(
        f"/api/prompts/{prompt['id']}/test",
        json={'provider_id': provider['id'], 'variables': {'user_name': 'Alice'}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body['output'] == 'Hello, Alice!'
    assert body['model'] == 'deepseek-chat'
    assert body['provider'] == 'My DeepSeek Account'
    assert body['rendered_prompt'] == 'Hello, Alice!'
    assert body['prompt_tokens'] == 10
    assert body['completion_tokens'] == 5
    assert body['total_tokens'] == 15
    assert body['latency_ms'] == 123.4
    assert body['execution_id']

    # The fake provider received the rendered prompt as a single user message.
    assert fake.calls[0]['messages'] == [{'role': 'user', 'content': 'Hello, Alice!'}]
    assert fake.calls[0]['model'] == 'deepseek-chat'

    # An execution row was recorded and the prompt's aggregate stats refreshed.
    executions = client.get(f"/api/prompts/{prompt['id']}/executions").json()
    assert len(executions) == 1
    assert executions[0]['success'] == 1
    assert executions[0]['response'] == 'Hello, Alice!'
    assert executions[0]['token_count'] == 15

    updated_prompt = client.get(f"/api/prompts/{prompt['id']}").json()
    assert updated_prompt['usage_count'] == 1
    assert updated_prompt['success_rate'] == 1.0
    assert updated_prompt['avg_rating'] == 0.0  # no rating supplied


# ---------------------------------------------------------------------------
# Validation / render errors
# ---------------------------------------------------------------------------

def test_test_prompt_missing_required_variable_returns_422(client, anon_client, admin_token, monkeypatch):
    provider = _create_provider(anon_client, admin_token)
    prompt = _create_prompt(client)
    fake = FakeProvider(result=CompletionResult(content='x', model='m'))
    _patch_provider(monkeypatch, fake)

    response = client.post(
        f"/api/prompts/{prompt['id']}/test",
        json={'provider_id': provider['id'], 'variables': {}},
    )
    assert response.status_code == 422
    # The provider must never be called if rendering fails.
    assert fake.calls == []


def test_test_prompt_unknown_prompt_returns_404(client, anon_client, admin_token):
    provider = _create_provider(anon_client, admin_token)
    response = client.post(
        '/api/prompts/999999/test',
        json={'provider_id': provider['id'], 'variables': {'user_name': 'Alice'}},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Provider lookup / state errors
# ---------------------------------------------------------------------------

def test_test_prompt_unknown_provider_returns_404(client):
    prompt = _create_prompt(client)
    response = client.post(
        f"/api/prompts/{prompt['id']}/test",
        json={'provider_id': 999999, 'variables': {'user_name': 'Alice'}},
    )
    assert response.status_code == 404


def test_test_prompt_disabled_provider_returns_400(client, anon_client, admin_token):
    provider = _create_provider(anon_client, admin_token)
    disable_response = anon_client.put(
        f"/api/providers/{provider['id']}", json={'enabled': False}, headers=_auth(admin_token)
    )
    assert disable_response.status_code == 200

    prompt = _create_prompt(client)
    response = client.post(
        f"/api/prompts/{prompt['id']}/test",
        json={'provider_id': provider['id'], 'variables': {'user_name': 'Alice'}},
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Provider call failure -> 502 + failed execution recorded
# ---------------------------------------------------------------------------

def test_test_prompt_provider_timeout_returns_502_and_records_failed_execution(
    client, anon_client, admin_token, monkeypatch
):
    provider = _create_provider(anon_client, admin_token)
    prompt = _create_prompt(client)

    fake = FakeProvider(error=ProviderTimeoutError('Request timed out'))
    _patch_provider(monkeypatch, fake)

    response = client.post(
        f"/api/prompts/{prompt['id']}/test",
        json={'provider_id': provider['id'], 'variables': {'user_name': 'Alice'}},
    )
    assert response.status_code == 502

    executions = client.get(f"/api/prompts/{prompt['id']}/executions").json()
    assert len(executions) == 1
    assert executions[0]['success'] == 0
    assert executions[0]['response'] is None
    assert executions[0]['rendered_prompt'] == 'Hello, Alice!'

    # Quality metrics (usage_count, success_rate) must reflect failed runs too,
    # not just successful ones, matching the sibling POST /executions behaviour.
    updated_prompt = client.get(f"/api/prompts/{prompt['id']}").json()
    assert updated_prompt['usage_count'] == 1
    assert updated_prompt['success_rate'] == 0.0


# ---------------------------------------------------------------------------
# Cost computation
# ---------------------------------------------------------------------------

def test_test_prompt_computes_cost_when_pricing_set(client, anon_client, admin_token, monkeypatch):
    payload = dict(PROVIDER_PAYLOAD, cost_per_1k_input_tokens=0.001, cost_per_1k_output_tokens=0.002)
    provider = _create_provider(anon_client, admin_token, payload=payload)
    prompt = _create_prompt(client)

    fake = FakeProvider(result=CompletionResult(
        content='Hi!', model='deepseek-chat', prompt_tokens=1000, completion_tokens=1000, total_tokens=2000,
    ))
    _patch_provider(monkeypatch, fake)

    response = client.post(
        f"/api/prompts/{prompt['id']}/test",
        json={'provider_id': provider['id'], 'variables': {'user_name': 'Alice'}},
    )
    assert response.status_code == 200

    executions = client.get(f"/api/prompts/{prompt['id']}/executions").json()
    assert executions[0]['cost'] == pytest.approx(0.003)  # 1*0.001 + 1*0.002


def test_test_prompt_cost_is_zero_when_pricing_unset(client, anon_client, admin_token, monkeypatch):
    provider = _create_provider(anon_client, admin_token)  # no cost fields in PROVIDER_PAYLOAD
    prompt = _create_prompt(client)

    fake = FakeProvider(result=CompletionResult(
        content='Hi!', model='deepseek-chat', prompt_tokens=1000, completion_tokens=1000, total_tokens=2000,
    ))
    _patch_provider(monkeypatch, fake)

    response = client.post(
        f"/api/prompts/{prompt['id']}/test",
        json={'provider_id': provider['id'], 'variables': {'user_name': 'Alice'}},
    )
    assert response.status_code == 200

    executions = client.get(f"/api/prompts/{prompt['id']}/executions").json()
    assert executions[0]['cost'] == 0.0
