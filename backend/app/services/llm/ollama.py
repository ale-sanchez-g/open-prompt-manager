"""
Ollama adapter for the LLM provider abstraction layer.

Communicates with a local (or remote) Ollama instance via its REST API.
Base URL defaults to http://localhost:11434 and is configurable.
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

_DEFAULT_BASE_URL = 'http://localhost:11434'
_DEFAULT_CONNECT_TIMEOUT = 5.0   # seconds
_DEFAULT_READ_TIMEOUT = 120.0    # seconds


class OllamaProvider(LLMProvider):
    """LLM adapter for the Ollama REST API (/api/chat, /api/tags)."""

    def __init__(
        self,
        base_url: str = _DEFAULT_BASE_URL,
        connect_timeout: float = _DEFAULT_CONNECT_TIMEOUT,
        read_timeout: float = _DEFAULT_READ_TIMEOUT,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self._base_url = base_url.rstrip('/')
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

    def _client(self) -> httpx.AsyncClient:
        kwargs: dict[str, Any] = {'base_url': self._base_url, 'timeout': self._timeout}
        if self._transport is not None:
            kwargs['transport'] = self._transport
        return httpx.AsyncClient(**kwargs)

    def _raise_translated(self, exc: Exception, url: str) -> NoReturn:
        """Translate an httpx error to a normalized provider exception and raise it."""
        if isinstance(exc, httpx.TimeoutException):
            raise ProviderTimeoutError(f'Ollama request timed out: {url}') from exc
        if isinstance(exc, (httpx.ConnectError, httpx.NetworkError)):
            raise ProviderUnavailableError(f'Ollama unreachable: {url}') from exc
        raise ProviderUnavailableError(f'Ollama error: {exc}') from exc

    def _check_response(self, response: httpx.Response) -> None:
        """Raise a normalized exception for non-2xx buffered responses."""
        if response.status_code == 401:
            raise ProviderAuthError('Ollama returned 401 Unauthorized')
        if response.status_code == 400:
            raise ProviderBadRequestError(
                f'Ollama bad request: {response.text}'
            )
        if response.status_code >= 500:
            raise ProviderUnavailableError(
                f'Ollama server error {response.status_code}: {response.text}'
            )
        if response.status_code >= 400:
            raise ProviderBadRequestError(
                f'Ollama client error {response.status_code}: {response.text}'
            )

    def _check_stream_response(self, response: httpx.Response) -> None:
        """Raise a normalized exception for non-2xx streaming responses.

        Uses only the status code (no response body read) so that it is safe
        to call before the streaming body has been consumed.
        """
        if response.status_code == 401:
            raise ProviderAuthError('Ollama returned 401 Unauthorized')
        if response.status_code >= 500:
            raise ProviderUnavailableError(
                f'Ollama server error {response.status_code}'
            )
        if response.status_code >= 400:
            raise ProviderBadRequestError(
                f'Ollama client error {response.status_code}'
            )

    @staticmethod
    def _build_options(params: dict[str, Any]) -> dict[str, Any]:
        """Translate normalized params into Ollama option keys."""
        options: dict[str, Any] = {}
        if 'temperature' in params:
            options['temperature'] = params['temperature']
        if 'max_tokens' in params:
            options['num_predict'] = params['max_tokens']
        if 'top_p' in params:
            options['top_p'] = params['top_p']
        # Forward any extra provider-specific keys directly.
        for key, val in params.items():
            if key not in ('temperature', 'max_tokens', 'top_p'):
                options[key] = val
        return options

    # ------------------------------------------------------------------
    # LLMProvider interface
    # ------------------------------------------------------------------

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str,
        params: Optional[dict[str, Any]] = None,
    ) -> CompletionResult:
        """Non-streaming chat completion against Ollama /api/chat."""
        params = params or {}
        payload: dict[str, Any] = {
            'model': model,
            'messages': messages,
            'stream': False,
        }
        options = self._build_options(params)
        if options:
            payload['options'] = options

        url = '/api/chat'
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.post(url, json=payload)
        except Exception as exc:
            self._raise_translated(exc, url)

        self._check_response(response)

        latency_ms = (time.monotonic() - t0) * 1000
        data = response.json()

        message = data.get('message', {})
        content = message.get('content', '')
        prompt_tokens = data.get('prompt_eval_count', 0) or 0
        completion_tokens = data.get('eval_count', 0) or 0
        total_tokens = prompt_tokens + completion_tokens
        finish_reason = data.get('done_reason') or ('stop' if data.get('done') else None)

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

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str,
        params: Optional[dict[str, Any]] = None,
    ) -> AsyncIterator[str]:
        """Streaming chat completion against Ollama /api/chat (stream=true)."""
        params = params or {}
        payload: dict[str, Any] = {
            'model': model,
            'messages': messages,
            'stream': True,
        }
        options = self._build_options(params)
        if options:
            payload['options'] = options

        url = '/api/chat'
        try:
            async with self._client() as client:
                async with client.stream('POST', url, json=payload) as response:
                    self._check_stream_response(response)
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        delta = chunk.get('message', {}).get('content', '')
                        if delta:
                            yield delta
                        if chunk.get('done'):
                            break
        except (ProviderAuthError, ProviderBadRequestError, ProviderUnavailableError, ProviderTimeoutError):
            raise
        except Exception as exc:
            self._raise_translated(exc, url)

    async def list_models(self) -> list[ModelInfo]:
        """List locally available Ollama models via /api/tags."""
        url = '/api/tags'
        try:
            async with self._client() as client:
                response = await client.get(url)
        except Exception as exc:
            self._raise_translated(exc, url)

        self._check_response(response)
        data = response.json()
        models = []
        for m in data.get('models', []):
            name = m.get('name', '')
            models.append(ModelInfo(
                id=name,
                name=name,
                provider='ollama',
                metadata={k: v for k, v in m.items() if k != 'name'},
            ))
        return models

    async def health_check(self) -> ProviderHealth:
        """Check Ollama availability by requesting / (returns OK text)."""
        url = '/'
        try:
            async with self._client() as client:
                response = await client.get(url)
            return ProviderHealth(
                healthy=response.status_code < 400,
                provider='ollama',
                detail=response.text if response.status_code >= 400 else None,
            )
        except httpx.TimeoutException as exc:
            return ProviderHealth(healthy=False, provider='ollama', detail=str(exc))
        except Exception as exc:
            return ProviderHealth(healthy=False, provider='ollama', detail=str(exc))
