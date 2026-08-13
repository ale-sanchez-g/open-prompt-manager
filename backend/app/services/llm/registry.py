"""
Provider registry / factory.

Maps provider ``type`` strings to concrete LLMProvider implementations so
callers get the right adapter without knowing which class to instantiate.
"""
from __future__ import annotations

from typing import Any

from .base import LLMProvider
from .ollama import OllamaProvider
from .openai_compatible import OpenAICompatibleProvider


def get_provider(provider_config: dict[str, Any]) -> LLMProvider:
    """
    Instantiate and return an LLMProvider for the given configuration.

    Args:
        provider_config: Dict containing at minimum a ``type`` key.
            Supported types:
            - ``'ollama'``: ``base_url`` (optional), ``connect_timeout``
              (optional), ``read_timeout`` (optional).
            - ``'openai_compatible'``: ``base_url`` (required), ``api_key``
              (optional), ``connect_timeout`` (optional), ``read_timeout``
              (optional).

    Returns:
        A concrete LLMProvider instance.

    Raises:
        ValueError: If the provider type is unknown or required fields are missing.
    """
    provider_type = provider_config.get('type', '')

    if provider_type == 'ollama':
        kwargs: dict[str, Any] = {}
        if 'base_url' in provider_config:
            kwargs['base_url'] = provider_config['base_url']
        if 'connect_timeout' in provider_config:
            kwargs['connect_timeout'] = provider_config['connect_timeout']
        if 'read_timeout' in provider_config:
            kwargs['read_timeout'] = provider_config['read_timeout']
        return OllamaProvider(**kwargs)

    if provider_type == 'openai_compatible':
        if not provider_config.get('base_url'):
            raise ValueError("Provider type 'openai_compatible' requires a 'base_url'.")
        kwargs = {'base_url': provider_config['base_url']}
        if 'api_key' in provider_config:
            kwargs['api_key'] = provider_config['api_key']
        if 'connect_timeout' in provider_config:
            kwargs['connect_timeout'] = provider_config['connect_timeout']
        if 'read_timeout' in provider_config:
            kwargs['read_timeout'] = provider_config['read_timeout']
        return OpenAICompatibleProvider(**kwargs)

    raise ValueError(
        f"Unknown provider type: '{provider_type}'. "
        "Supported types: 'ollama', 'openai_compatible'."
    )
