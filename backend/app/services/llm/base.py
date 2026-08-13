"""
LLM provider abstraction layer.

Defines the abstract interface all LLM adapters must implement, shared data
models, and normalized exceptions so callers never need provider-specific
error handling.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared data models
# ---------------------------------------------------------------------------

class CompletionResult(BaseModel):
    """Normalized result returned by every LLM provider."""

    content: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: float = 0.0
    finish_reason: Optional[str] = None
    raw: Optional[dict[str, Any]] = Field(default=None, description='Raw provider payload for debugging')


class ModelInfo(BaseModel):
    """Minimal model descriptor returned by list_models()."""

    id: str
    name: str
    provider: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProviderHealth(BaseModel):
    """Health-check result for a provider."""

    healthy: bool
    provider: str
    detail: Optional[str] = None


# ---------------------------------------------------------------------------
# Normalized exceptions
# ---------------------------------------------------------------------------

class LLMProviderError(Exception):
    """Base class for all provider errors."""


class ProviderAuthError(LLMProviderError):
    """Raised when the provider rejects the request due to authentication."""


class ProviderTimeoutError(LLMProviderError):
    """Raised when the request to the provider times out."""


class ProviderUnavailableError(LLMProviderError):
    """Raised when the provider is unreachable or returns a server error."""


class ProviderBadRequestError(LLMProviderError):
    """Raised when the provider rejects the request due to bad input."""


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class LLMProvider(ABC):
    """Abstract base class for LLM provider adapters."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str,
        params: Optional[dict[str, Any]] = None,
    ) -> CompletionResult:
        """
        Send a chat completion request and return a normalized result.

        Args:
            messages: List of role/content dicts in OpenAI message format.
            model: Provider model identifier.
            params: Optional parameters such as temperature, max_tokens, top_p,
                    plus any provider-specific extras.

        Returns:
            CompletionResult with content, token counts, and latency.

        Raises:
            ProviderAuthError: Authentication failure.
            ProviderTimeoutError: Request timed out.
            ProviderUnavailableError: Provider unreachable or 5xx error.
            ProviderBadRequestError: Invalid request (4xx other than auth).
        """

    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str,
        params: Optional[dict[str, Any]] = None,
    ) -> AsyncIterator[str]:
        """
        Stream a chat completion, yielding text deltas as they arrive.

        Args:
            messages: List of role/content dicts in OpenAI message format.
            model: Provider model identifier.
            params: Optional generation parameters.

        Yields:
            str: Incremental text deltas from the provider.

        Raises:
            ProviderAuthError, ProviderTimeoutError, ProviderUnavailableError,
            ProviderBadRequestError — same semantics as chat().
        """
        # Declare as async generator to satisfy the abstract contract.
        # Subclasses must override this; the body is never reached.
        raise NotImplementedError  # pragma: no cover
        # Make this an async generator at the type level.
        yield  # type: ignore[misc]  # pragma: no cover

    @abstractmethod
    async def list_models(self) -> list[ModelInfo]:
        """
        List models available from this provider.

        Returns:
            List of ModelInfo descriptors.

        Raises:
            ProviderUnavailableError, ProviderAuthError.
        """

    @abstractmethod
    async def health_check(self) -> ProviderHealth:
        """
        Check whether the provider is reachable and responsive.

        Returns:
            ProviderHealth indicating healthy status and optional detail.
        """
