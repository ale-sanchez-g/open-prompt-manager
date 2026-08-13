"""
Unit tests for the OpenAI-compatible LLM provider adapter.

HTTP calls are intercepted using httpx.MockTransport injected into each
OpenAICompatibleProvider instance — no real network is needed. Mirrors the
mocking pattern used in test_llm_ollama.py.
"""
from __future__ import annotations

import json
from typing import Callable

import httpx
import pytest
import anyio  # noqa: F401 – registers the anyio pytest plugin

from app.services.llm.base import (
    CompletionResult,
    ModelInfo,
    ProviderHealth,
    ProviderAuthError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    ProviderBadRequestError,
)
from app.services.llm.openai_compatible import (
    OpenAICompatibleProvider,
    OPENAI_COMPATIBLE_PRESETS,
)


BASE_URL = 'https://api.example.com/v1'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chat_response(content: str = 'Hello!', model: str = 'gpt-test') -> dict:
    return {
        'id': 'chatcmpl-123',
        'model': model,
        'choices': [
            {
                'index': 0,
                'message': {'role': 'assistant', 'content': content},
                'finish_reason': 'stop',
            }
        ],
        'usage': {
            'prompt_tokens': 10,
            'completion_tokens': 5,
            'total_tokens': 15,
        },
    }


def _make_models_response() -> dict:
    return {
        'data': [
            {'id': 'gpt-test', 'object': 'model', 'owned_by': 'test'},
            {'id': 'gpt-other', 'object': 'model', 'owned_by': 'test'},
        ]
    }


def _provider(
    handler: Callable[[httpx.Request], httpx.Response],
    api_key: str | None = None,
) -> OpenAICompatibleProvider:
    """Return a provider that routes all HTTP through the given handler."""
    return OpenAICompatibleProvider(
        base_url=BASE_URL, api_key=api_key, transport=httpx.MockTransport(handler)
    )


def _raises_exc(exc: Exception) -> Callable[[httpx.Request], httpx.Response]:
    """Return a handler that always raises the given exception."""
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc
    return handler


# ---------------------------------------------------------------------------
# chat() — success
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_chat_success():
    provider = _provider(lambda _r: httpx.Response(200, json=_make_chat_response()))
    result = await provider.chat(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='gpt-test',
    )
    assert isinstance(result, CompletionResult)
    assert result.content == 'Hello!'
    assert result.model == 'gpt-test'
    assert result.finish_reason == 'stop'
    assert result.latency_ms >= 0


@pytest.mark.anyio
async def test_chat_usage_token_mapping():
    provider = _provider(lambda _r: httpx.Response(200, json=_make_chat_response()))
    result = await provider.chat(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='gpt-test',
    )
    assert result.prompt_tokens == 10
    assert result.completion_tokens == 5
    assert result.total_tokens == 15


@pytest.mark.anyio
async def test_chat_missing_usage_defaults_to_zero():
    data = {
        'model': 'gpt-test',
        'choices': [
            {'message': {'role': 'assistant', 'content': 'Hi'}, 'finish_reason': 'stop'}
        ],
    }
    provider = _provider(lambda _r: httpx.Response(200, json=data))
    result = await provider.chat(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='gpt-test',
    )
    assert result.prompt_tokens == 0
    assert result.completion_tokens == 0
    assert result.total_tokens == 0


@pytest.mark.anyio
async def test_chat_authorization_header_sent_when_api_key_present():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured['auth'] = request.headers.get('authorization')
        return httpx.Response(200, json=_make_chat_response())

    provider = _provider(handler, api_key='sk-test-123')
    await provider.chat(messages=[{'role': 'user', 'content': 'Hi'}], model='gpt-test')
    assert captured['auth'] == 'Bearer sk-test-123'


@pytest.mark.anyio
async def test_chat_no_authorization_header_when_api_key_absent():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured['auth'] = request.headers.get('authorization')
        return httpx.Response(200, json=_make_chat_response())

    provider = _provider(handler, api_key=None)
    await provider.chat(messages=[{'role': 'user', 'content': 'Hi'}], model='gpt-test')
    assert captured['auth'] is None


@pytest.mark.anyio
async def test_chat_extra_params_forwarded():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured['body'] = json.loads(request.content)
        return httpx.Response(200, json=_make_chat_response())

    provider = _provider(handler)
    await provider.chat(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='gpt-test',
        params={'temperature': 0.5, 'max_tokens': 256, 'top_p': 0.9},
    )
    body = captured['body']
    assert body['temperature'] == 0.5
    assert body['max_tokens'] == 256
    assert body['top_p'] == 0.9
    assert body['stream'] is False


# ---------------------------------------------------------------------------
# chat() — malformed response handling
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_chat_empty_choices_handled():
    data = {'model': 'gpt-test', 'choices': [], 'usage': {}}
    provider = _provider(lambda _r: httpx.Response(200, json=data))
    result = await provider.chat(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='gpt-test',
    )
    assert result.content == ''
    assert result.finish_reason is None


# ---------------------------------------------------------------------------
# chat() — error mapping
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_chat_timeout_raises_provider_timeout_error():
    provider = _provider(_raises_exc(httpx.ReadTimeout('timed out', request=None)))
    with pytest.raises(ProviderTimeoutError):
        await provider.chat(messages=[{'role': 'user', 'content': 'Hi'}], model='gpt-test')


@pytest.mark.anyio
async def test_chat_connect_error_raises_unavailable():
    provider = _provider(_raises_exc(httpx.ConnectError('refused', request=None)))
    with pytest.raises(ProviderUnavailableError):
        await provider.chat(messages=[{'role': 'user', 'content': 'Hi'}], model='gpt-test')


@pytest.mark.anyio
async def test_chat_401_raises_auth_error():
    provider = _provider(lambda _r: httpx.Response(401, text='unauthorized'))
    with pytest.raises(ProviderAuthError):
        await provider.chat(messages=[{'role': 'user', 'content': 'Hi'}], model='gpt-test')


@pytest.mark.anyio
async def test_chat_403_raises_auth_error():
    provider = _provider(lambda _r: httpx.Response(403, text='forbidden'))
    with pytest.raises(ProviderAuthError):
        await provider.chat(messages=[{'role': 'user', 'content': 'Hi'}], model='gpt-test')


@pytest.mark.anyio
async def test_chat_500_raises_unavailable():
    provider = _provider(lambda _r: httpx.Response(500, text='internal error'))
    with pytest.raises(ProviderUnavailableError):
        await provider.chat(messages=[{'role': 'user', 'content': 'Hi'}], model='gpt-test')


@pytest.mark.anyio
async def test_chat_400_raises_bad_request():
    provider = _provider(lambda _r: httpx.Response(400, text='invalid request'))
    with pytest.raises(ProviderBadRequestError):
        await provider.chat(messages=[{'role': 'user', 'content': 'Hi'}], model='gpt-test')


@pytest.mark.anyio
async def test_chat_4xx_raises_bad_request():
    provider = _provider(lambda _r: httpx.Response(422, text='unprocessable'))
    with pytest.raises(ProviderBadRequestError):
        await provider.chat(messages=[{'role': 'user', 'content': 'Hi'}], model='gpt-test')


# ---------------------------------------------------------------------------
# list_models()
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_list_models_success():
    provider = _provider(lambda _r: httpx.Response(200, json=_make_models_response()))
    models = await provider.list_models()
    assert len(models) == 2
    assert all(isinstance(m, ModelInfo) for m in models)
    assert models[0].id == 'gpt-test'
    assert models[0].provider == 'openai_compatible'
    assert models[1].id == 'gpt-other'


@pytest.mark.anyio
async def test_list_models_unavailable():
    provider = _provider(_raises_exc(httpx.ConnectError('refused', request=None)))
    with pytest.raises(ProviderUnavailableError):
        await provider.list_models()


@pytest.mark.anyio
async def test_list_models_auth_error():
    provider = _provider(lambda _r: httpx.Response(401, text='unauthorized'))
    with pytest.raises(ProviderAuthError):
        await provider.list_models()


@pytest.mark.anyio
async def test_list_models_empty():
    provider = _provider(lambda _r: httpx.Response(200, json={'data': []}))
    models = await provider.list_models()
    assert models == []


# ---------------------------------------------------------------------------
# health_check()
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_health_check_healthy():
    provider = _provider(lambda _r: httpx.Response(200, json=_make_models_response()))
    health = await provider.health_check()
    assert isinstance(health, ProviderHealth)
    assert health.healthy is True
    assert health.provider == 'openai_compatible'


@pytest.mark.anyio
async def test_health_check_unauthorized():
    provider = _provider(lambda _r: httpx.Response(401, text='unauthorized'))
    health = await provider.health_check()
    assert health.healthy is False
    assert health.detail is not None


@pytest.mark.anyio
async def test_health_check_unavailable():
    provider = _provider(_raises_exc(httpx.ConnectError('refused', request=None)))
    health = await provider.health_check()
    assert health.healthy is False
    assert health.detail is not None


@pytest.mark.anyio
async def test_health_check_timeout():
    provider = _provider(_raises_exc(httpx.ReadTimeout('timed out', request=None)))
    health = await provider.health_check()
    assert health.healthy is False


# ---------------------------------------------------------------------------
# chat_stream()
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_chat_stream_yields_deltas():
    lines = [
        'data: ' + json.dumps({'choices': [{'delta': {'content': 'Hello'}}]}),
        'data: ' + json.dumps({'choices': [{'delta': {'content': ' world'}}]}),
        'data: ' + json.dumps({'choices': [{'delta': {'content': '!'}}]}),
        'data: [DONE]',
    ]
    body = '\n'.join(lines)
    provider = _provider(lambda _r: httpx.Response(200, text=body))
    deltas: list[str] = []
    async for delta in provider.chat_stream(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='gpt-test',
    ):
        deltas.append(delta)
    assert deltas == ['Hello', ' world', '!']


@pytest.mark.anyio
async def test_chat_stream_ignores_non_data_lines():
    lines = [
        ': keep-alive',
        'data: ' + json.dumps({'choices': [{'delta': {'content': 'Hi'}}]}),
        'data: [DONE]',
    ]
    body = '\n'.join(lines)
    provider = _provider(lambda _r: httpx.Response(200, text=body))
    deltas: list[str] = []
    async for delta in provider.chat_stream(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='gpt-test',
    ):
        deltas.append(delta)
    assert deltas == ['Hi']


@pytest.mark.anyio
async def test_chat_stream_skips_malformed_json():
    lines = [
        'data: {not valid json',
        'data: ' + json.dumps({'choices': [{'delta': {'content': 'ok'}}]}),
        'data: [DONE]',
    ]
    body = '\n'.join(lines)
    provider = _provider(lambda _r: httpx.Response(200, text=body))
    deltas: list[str] = []
    async for delta in provider.chat_stream(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='gpt-test',
    ):
        deltas.append(delta)
    assert deltas == ['ok']


@pytest.mark.anyio
async def test_chat_stream_connect_error_raises_unavailable():
    provider = _provider(_raises_exc(httpx.ConnectError('refused', request=None)))
    with pytest.raises(ProviderUnavailableError):
        async for _ in provider.chat_stream(
            messages=[{'role': 'user', 'content': 'Hi'}],
            model='gpt-test',
        ):
            pass


@pytest.mark.anyio
async def test_chat_stream_401_raises_auth_error():
    provider = _provider(lambda _r: httpx.Response(401, text='unauthorized'))
    with pytest.raises(ProviderAuthError):
        async for _ in provider.chat_stream(
            messages=[{'role': 'user', 'content': 'Hi'}],
            model='gpt-test',
        ):
            pass


# ---------------------------------------------------------------------------
# OPENAI_COMPATIBLE_PRESETS
# ---------------------------------------------------------------------------

def test_presets_contains_deepseek_groq_openrouter():
    assert set(OPENAI_COMPATIBLE_PRESETS.keys()) == {'deepseek', 'groq', 'openrouter'}
    assert OPENAI_COMPATIBLE_PRESETS['deepseek']['base_url'] == 'https://api.deepseek.com'
    assert OPENAI_COMPATIBLE_PRESETS['groq']['name'] == 'Groq'
    assert OPENAI_COMPATIBLE_PRESETS['openrouter']['name'] == 'OpenRouter'
    for preset in OPENAI_COMPATIBLE_PRESETS.values():
        assert 'name' in preset
        assert 'base_url' in preset


# ---------------------------------------------------------------------------
# Constructor behavior
# ---------------------------------------------------------------------------

def test_base_url_trailing_slash_stripped():
    provider = OpenAICompatibleProvider(base_url='https://api.example.com/v1/')
    assert provider._base_url == 'https://api.example.com/v1'


def test_constructor_accepts_no_api_key():
    provider = OpenAICompatibleProvider(base_url=BASE_URL)
    assert provider._headers() == {}
