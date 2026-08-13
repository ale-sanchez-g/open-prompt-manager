"""
Unit tests for the LLM provider abstraction layer.

HTTP calls are intercepted using httpx.MockTransport injected into each
OllamaProvider instance — no real network is needed.
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
from app.services.llm.ollama import OllamaProvider
from app.services.llm.registry import get_provider


BASE_URL = 'http://localhost:11434'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chat_response(content: str = 'Hello!', model: str = 'llama3') -> dict:
    return {
        'model': model,
        'message': {'role': 'assistant', 'content': content},
        'done': True,
        'done_reason': 'stop',
        'prompt_eval_count': 10,
        'eval_count': 5,
    }


def _make_tags_response() -> dict:
    return {
        'models': [
            {'name': 'llama3', 'size': 4000000000},
            {'name': 'mistral', 'size': 3800000000},
        ]
    }


def _provider(handler: Callable[[httpx.Request], httpx.Response]) -> OllamaProvider:
    """Return a provider that routes all HTTP through the given handler."""
    return OllamaProvider(base_url=BASE_URL, transport=httpx.MockTransport(handler))


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
        model='llama3',
    )
    assert isinstance(result, CompletionResult)
    assert result.content == 'Hello!'
    assert result.model == 'llama3'
    assert result.prompt_tokens == 10
    assert result.completion_tokens == 5
    assert result.total_tokens == 15
    assert result.finish_reason == 'stop'
    assert result.latency_ms >= 0


@pytest.mark.anyio
async def test_chat_with_params():
    provider = _provider(lambda _r: httpx.Response(200, json=_make_chat_response()))
    result = await provider.chat(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='llama3',
        params={'temperature': 0.7, 'max_tokens': 256, 'top_p': 0.9},
    )
    assert result.content == 'Hello!'


@pytest.mark.anyio
async def test_chat_extra_params_forwarded():
    """Provider-specific extra params are forwarded under options."""
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured['body'] = json.loads(request.content)
        return httpx.Response(200, json=_make_chat_response())

    provider = _provider(handler)
    await provider.chat(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='llama3',
        params={'temperature': 0.5, 'seed': 42},
    )
    options = captured['body'].get('options', {})
    assert options.get('temperature') == 0.5
    assert options.get('seed') == 42


# ---------------------------------------------------------------------------
# chat() — token count edge cases
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_chat_missing_token_counts():
    """Absent token fields default to 0."""
    data = {
        'model': 'llama3',
        'message': {'role': 'assistant', 'content': 'Hi'},
        'done': True,
    }
    provider = _provider(lambda _r: httpx.Response(200, json=data))
    result = await provider.chat(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='llama3',
    )
    assert result.prompt_tokens == 0
    assert result.completion_tokens == 0
    assert result.total_tokens == 0


# ---------------------------------------------------------------------------
# chat() — error mapping
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_chat_timeout_raises_provider_timeout_error():
    provider = _provider(_raises_exc(httpx.ReadTimeout('timed out', request=None)))
    with pytest.raises(ProviderTimeoutError):
        await provider.chat(
            messages=[{'role': 'user', 'content': 'Hi'}],
            model='llama3',
        )


@pytest.mark.anyio
async def test_chat_connect_error_raises_unavailable():
    provider = _provider(_raises_exc(httpx.ConnectError('refused', request=None)))
    with pytest.raises(ProviderUnavailableError):
        await provider.chat(
            messages=[{'role': 'user', 'content': 'Hi'}],
            model='llama3',
        )


@pytest.mark.anyio
async def test_chat_500_raises_unavailable():
    provider = _provider(lambda _r: httpx.Response(500, text='internal error'))
    with pytest.raises(ProviderUnavailableError):
        await provider.chat(
            messages=[{'role': 'user', 'content': 'Hi'}],
            model='llama3',
        )


@pytest.mark.anyio
async def test_chat_400_raises_bad_request():
    provider = _provider(lambda _r: httpx.Response(400, text='model not found'))
    with pytest.raises(ProviderBadRequestError):
        await provider.chat(
            messages=[{'role': 'user', 'content': 'Hi'}],
            model='unknown',
        )


@pytest.mark.anyio
async def test_chat_401_raises_auth_error():
    provider = _provider(lambda _r: httpx.Response(401, text='unauthorized'))
    with pytest.raises(ProviderAuthError):
        await provider.chat(
            messages=[{'role': 'user', 'content': 'Hi'}],
            model='llama3',
        )


@pytest.mark.anyio
async def test_chat_4xx_raises_bad_request():
    provider = _provider(lambda _r: httpx.Response(422, text='unprocessable'))
    with pytest.raises(ProviderBadRequestError):
        await provider.chat(
            messages=[{'role': 'user', 'content': 'Hi'}],
            model='llama3',
        )


# ---------------------------------------------------------------------------
# list_models()
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_list_models_success():
    provider = _provider(lambda _r: httpx.Response(200, json=_make_tags_response()))
    models = await provider.list_models()
    assert len(models) == 2
    assert all(isinstance(m, ModelInfo) for m in models)
    assert models[0].id == 'llama3'
    assert models[0].provider == 'ollama'
    assert models[1].id == 'mistral'


@pytest.mark.anyio
async def test_list_models_unavailable():
    provider = _provider(_raises_exc(httpx.ConnectError('refused', request=None)))
    with pytest.raises(ProviderUnavailableError):
        await provider.list_models()


@pytest.mark.anyio
async def test_list_models_empty():
    provider = _provider(lambda _r: httpx.Response(200, json={'models': []}))
    models = await provider.list_models()
    assert models == []


# ---------------------------------------------------------------------------
# health_check()
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_health_check_healthy():
    provider = _provider(lambda _r: httpx.Response(200, text='Ollama is running'))
    health = await provider.health_check()
    assert isinstance(health, ProviderHealth)
    assert health.healthy is True
    assert health.provider == 'ollama'


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
        json.dumps({'message': {'content': 'Hello'}, 'done': False}),
        json.dumps({'message': {'content': ' world'}, 'done': False}),
        json.dumps({'message': {'content': '!'}, 'done': True}),
    ]
    body = '\n'.join(lines)
    provider = _provider(lambda _r: httpx.Response(200, text=body))
    deltas: list[str] = []
    async for delta in provider.chat_stream(
        messages=[{'role': 'user', 'content': 'Hi'}],
        model='llama3',
    ):
        deltas.append(delta)
    assert deltas == ['Hello', ' world', '!']


@pytest.mark.anyio
async def test_chat_stream_connect_error_raises_unavailable():
    provider = _provider(_raises_exc(httpx.ConnectError('refused', request=None)))
    with pytest.raises(ProviderUnavailableError):
        async for _ in provider.chat_stream(
            messages=[{'role': 'user', 'content': 'Hi'}],
            model='llama3',
        ):
            pass


# ---------------------------------------------------------------------------
# registry — get_provider()
# ---------------------------------------------------------------------------

def test_get_provider_ollama():
    provider = get_provider({'type': 'ollama'})
    assert isinstance(provider, OllamaProvider)


def test_get_provider_ollama_custom_url():
    provider = get_provider({'type': 'ollama', 'base_url': 'http://other:11434'})
    assert isinstance(provider, OllamaProvider)
    assert provider._base_url == 'http://other:11434'


def test_get_provider_openai_compatible_raises():
    with pytest.raises(ValueError, match='not yet implemented'):
        get_provider({'type': 'openai_compatible'})


def test_get_provider_unknown_raises():
    with pytest.raises(ValueError, match='Unknown provider type'):
        get_provider({'type': 'nonexistent'})


# ---------------------------------------------------------------------------
# CompletionResult validation
# ---------------------------------------------------------------------------

def test_completion_result_defaults():
    result = CompletionResult(content='hi', model='m')
    assert result.prompt_tokens == 0
    assert result.completion_tokens == 0
    assert result.total_tokens == 0
    assert result.latency_ms == 0.0
    assert result.finish_reason is None
    assert result.raw is None
