"""
OpenAI-compatible adapter for the LLM provider abstraction layer.

Targets any provider exposing the OpenAI chat-completions API shape
(``POST {base_url}/chat/completions``, ``GET {base_url}/models``) — this
covers DeepSeek, Groq, OpenRouter, and self-hosted OpenAI-compatible
servers alike. ``OPENAI_COMPATIBLE_PRESETS`` holds the name/base_url pairs
for the well-known hosted providers so callers don't have to re-derive them.
"""
from __future__ import annotations

import json
import time
from typing import Any, AsyncIterator, NoReturn, Optional

import httpx

from .base import (
    CompletionResult,
    LLMProvider,
    ModelInfo,
    ProviderAuthError,
    ProviderBadRequestError,
    ProviderHealth,
    ProviderTimeoutError,
    ProviderUnavailableError,
)

_DEFAULT_CONNECT_TIMEOUT = 5.0   # seconds
_DEFAULT_READ_TIMEOUT = 120.0    # seconds

OPENAI_COMPATIBLE_PRESETS: dict[str, dict[str, str]] = {
    'deepseek': {'name': 'DeepSeek', 'base_url': 'https://api.deepseek.com'},
    'groq': {'name': 'Groq', 'base_url': 'https://api.groq.com/openai/v1'},
    'openrouter': {'name': 'OpenRouter', 'base_url': 'https://openrouter.ai/api/v1'},
}


class OpenAICompatibleProvider(LLMProvider):
    """LLM adapter for OpenAI-compatible chat-completions APIs."""

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        connect_timeout: float = _DEFAULT_CONNECT_TIMEOUT,
        read_timeout: float = _DEFAULT_READ_TIMEOUT,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self._base_url = base_url.rstrip('/')
        self._api_key = api_key
        self._timeout = httpx.Timeout(
            connect=connect_timeout,
            read=read_timeout,
            write=connect_timeout,
            pool=connect_timeout,
        )
        self._transport = transport

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        if self._api_key:
            return {'Authorization': f'Bearer {self._api_key}'}
        return {}

    def _client(self) -> httpx.AsyncClient:
        kwargs: dict[str, Any] = {
            'base_url': self._base_url,
            'timeout': self._timeout,
            'headers': self._headers(),
        }
        if self._transport is not None:
            kwargs['transport'] = self._transport
        return httpx.AsyncClient(**kwargs)

    def _raise_translated(self, exc: Exception, url: str) -> NoReturn:
        """Translate an httpx error to a normalized provider exception and raise it."""
        if isinstance(exc, httpx.TimeoutException):
            raise ProviderTimeoutError(f'Request timed out: {url}') from exc
        if isinstance(exc, (httpx.ConnectError, httpx.NetworkError)):
            raise ProviderUnavailableError(f'Provider unreachable: {url}') from exc
        raise ProviderUnavailableError(f'Provider error: {exc}') from exc

    def _check_response(self, response: httpx.Response) -> None:
        """Raise a normalized exception for non-2xx buffered responses.

        Only the status code is included in the message. The response body
        comes from the (possibly misconfigured or malicious) provider server
        and callers surface ``str(exc)`` directly to API clients, so it must
        never be echoed back verbatim.
        """
        if response.status_code in (401, 403):
            raise ProviderAuthError(
                f'Provider returned {response.status_code} Unauthorized'
            )
        if response.status_code >= 500:
            raise ProviderUnavailableError(
                f'Provider server error {response.status_code}'
            )
        if response.status_code >= 400:
            raise ProviderBadRequestError(
                f'Provider client error {response.status_code}'
            )

    def _check_stream_response(self, response: httpx.Response) -> None:
        """Raise a normalized exception for non-2xx streaming responses.

        Uses only the status code (no response body read) so that it is safe
        to call before the streaming body has been consumed.
        """
        if response.status_code in (401, 403):
            raise ProviderAuthError(
                f'Provider returned {response.status_code} Unauthorized'
            )
        if response.status_code >= 500:
            raise ProviderUnavailableError(
                f'Provider server error {response.status_code}'
            )
        if response.status_code >= 400:
            raise ProviderBadRequestError(
                f'Provider client error {response.status_code}'
            )

    @staticmethod
    def _build_payload(
        messages: list[dict[str, str]],
        model: str,
        params: dict[str, Any],
        stream: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            'model': model,
            'messages': messages,
            'stream': stream,
        }
        for key, val in params.items():
            payload[key] = val
        return payload

    # ------------------------------------------------------------------
    # LLMProvider interface
    # ------------------------------------------------------------------

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str,
        params: Optional[dict[str, Any]] = None,
    ) -> CompletionResult:
        """Non-streaming chat completion against POST /chat/completions."""
        params = params or {}
        payload = self._build_payload(messages, model, params, stream=False)

        url = '/chat/completions'
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.post(url, json=payload)
        except Exception as exc:
            self._raise_translated(exc, url)

        self._check_response(response)

        latency_ms = (time.monotonic() - t0) * 1000
        data = response.json()

        choices = data.get('choices') or [{}]
        message = choices[0].get('message', {}) if choices else {}
        content = message.get('content') or ''
        finish_reason = choices[0].get('finish_reason') if choices else None

        usage = data.get('usage') or {}
        prompt_tokens = usage.get('prompt_tokens', 0) or 0
        completion_tokens = usage.get('completion_tokens', 0) or 0
        total_tokens = usage.get('total_tokens', prompt_tokens + completion_tokens) or 0

        return CompletionResult(
            content=content,
            model=data.get('model', model),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=latency_ms,
            finish_reason=finish_reason,
            raw=data,
        )

    @staticmethod
    async def _iter_sse_deltas(response: httpx.Response) -> AsyncIterator[str]:
        """Parse SSE 'data: ' lines from a streaming chat-completions response, yielding text deltas."""
        async for line in response.aiter_lines():
            if not line or not line.startswith('data:'):
                continue
            data_str = line[len('data:'):].strip()
            if data_str == '[DONE]':
                break
            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            choices = chunk.get('choices') or []
            if not choices:
                continue
            delta = choices[0].get('delta', {}).get('content', '')
            if delta:
                yield delta

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str,
        params: Optional[dict[str, Any]] = None,
    ) -> AsyncIterator[str]:
        """Streaming chat completion via SSE 'data: ' lines from /chat/completions."""
        params = params or {}
        payload = self._build_payload(messages, model, params, stream=True)

        url = '/chat/completions'
        try:
            async with self._client() as client:
                async with client.stream('POST', url, json=payload) as response:
                    self._check_stream_response(response)
                    async for delta in self._iter_sse_deltas(response):
                        yield delta
        except (ProviderAuthError, ProviderBadRequestError, ProviderUnavailableError, ProviderTimeoutError):
            raise
        except Exception as exc:
            self._raise_translated(exc, url)

    async def list_models(self) -> list[ModelInfo]:
        """List models available from this provider via GET /models."""
        url = '/models'
        try:
            async with self._client() as client:
                response = await client.get(url)
        except Exception as exc:
            self._raise_translated(exc, url)

        self._check_response(response)
        data = response.json()
        models = []
        for m in data.get('data', []):
            model_id = m.get('id', '')
            models.append(ModelInfo(
                id=model_id,
                name=model_id,
                provider='openai_compatible',
                metadata={k: v for k, v in m.items() if k != 'id'},
            ))
        return models

    async def health_check(self) -> ProviderHealth:
        """Check availability/auth by requesting GET /models."""
        url = '/models'
        try:
            async with self._client() as client:
                response = await client.get(url)
            healthy = response.status_code < 400
            return ProviderHealth(
                healthy=healthy,
                provider='openai_compatible',
                # Status-code only — the body is untrusted provider content and
                # this detail is surfaced verbatim by POST /api/providers/{id}/test.
                detail=f'Provider returned {response.status_code}' if not healthy else None,
            )
        except httpx.TimeoutException as exc:
            return ProviderHealth(healthy=False, provider='openai_compatible', detail=str(exc))
        except Exception as exc:
            return ProviderHealth(healthy=False, provider='openai_compatible', detail=str(exc))
