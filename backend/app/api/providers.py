import time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_admin
from app.database.base import get_db
from app.models.auth import User
from app.models.llm_provider_config import LLMProviderConfig
from app.models.schemas import (
    ProviderCreate,
    ProviderModelInfo,
    ProviderModelsResponse,
    ProviderPresetResponse,
    ProviderResponse,
    ProviderTestResponse,
    ProviderUpdate,
)
from app.services import encryption
from app.services.llm.base import (
    ProviderAuthError,
    ProviderBadRequestError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from app.services.llm.openai_compatible import OPENAI_COMPATIBLE_PRESETS
from app.services.llm.registry import get_provider

router = APIRouter(prefix='/api/providers', tags=['providers'])


def _get_config_or_404(provider_id: int, db: Session) -> LLMProviderConfig:
    config = db.get(LLMProviderConfig, provider_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f'Provider {provider_id} not found')
    return config


def _masked_key(config: LLMProviderConfig) -> Optional[str]:
    """Return a masked preview of the stored API key, never the plaintext.

    Returns None if no key is stored, and a generic mask if the stored
    ciphertext can't be decrypted (e.g. OPM_ENCRYPTION_KEY misconfigured)
    rather than raising and breaking the whole list response.
    """
    if not config.api_key_encrypted:
        return None
    try:
        return encryption.mask_key(encryption.decrypt(config.api_key_encrypted))
    except RuntimeError:
        return '***'


def _build_response(config: LLMProviderConfig) -> ProviderResponse:
    response = ProviderResponse.model_validate(config)
    response.api_key_masked = _masked_key(config)
    return response


def _instantiate_provider(config: LLMProviderConfig):
    api_key = None
    if config.api_key_encrypted:
        try:
            api_key = encryption.decrypt(config.api_key_encrypted)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=f'Failed to decrypt provider API key: {exc}') from exc
    return get_provider({
        'type': config.provider_type,
        'base_url': config.base_url,
        'api_key': api_key,
    })


_PROVIDER_ERROR_STATUS = {
    ProviderUnavailableError: 502,
    ProviderTimeoutError: 502,
    ProviderAuthError: 400,
    ProviderBadRequestError: 400,
}


def _raise_http_for_provider_error(exc: Exception) -> None:
    for error_type, status_code in _PROVIDER_ERROR_STATUS.items():
        if isinstance(exc, error_type):
            raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail='Provider request failed') from exc


@router.get(
    '/presets',
    response_model=list[ProviderPresetResponse],
    summary='List known OpenAI-compatible provider presets',
    description=(
        'Returns name/base_url pairs for well-known OpenAI-compatible providers '
        '(DeepSeek, Groq, OpenRouter) so a settings UI can prefill the connection form. '
        'Unauthenticated — this is static, non-sensitive configuration data.'
    ),
    response_description='Array of preset provider descriptors.',
)
def list_presets():
    return [
        ProviderPresetResponse(key=key, name=preset['name'], base_url=preset['base_url'])
        for key, preset in OPENAI_COMPATIBLE_PRESETS.items()
    ]


@router.get(
    '/',
    response_model=list[ProviderResponse],
    summary='List configured providers',
    description='Returns every configured LLM provider connection. API keys are always masked.',
    response_description='Array of provider connections.',
)
def list_providers(
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    configs = db.query(LLMProviderConfig).order_by(LLMProviderConfig.id).all()
    return [_build_response(c) for c in configs]


@router.post(
    '/',
    response_model=ProviderResponse,
    status_code=201,
    summary='Add a provider',
    description='Registers a new LLM provider connection. The API key, if supplied, is encrypted at rest. Requires an admin access token.',
    response_description='The newly created provider connection, with a masked API key.',
    responses={401: {'description': 'Authentication required.'}, 403: {'description': 'Admin role required.'}},
)
def create_provider(
    payload: ProviderCreate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    config = LLMProviderConfig(
        name=payload.name,
        provider_type=payload.provider_type,
        base_url=payload.base_url,
        api_key_encrypted=encryption.encrypt(payload.api_key) if payload.api_key else None,
        default_model=payload.default_model,
        cost_per_1k_input_tokens=payload.cost_per_1k_input_tokens,
        cost_per_1k_output_tokens=payload.cost_per_1k_output_tokens,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return _build_response(config)


@router.put(
    '/{provider_id}',
    response_model=ProviderResponse,
    summary='Update a provider',
    description=(
        'Partially updates a provider connection. Only fields present in the request body are changed. '
        'An omitted or blank `api_key` leaves the currently stored key unchanged. Requires an admin access token.'
    ),
    response_description='The updated provider connection, with a masked API key.',
    responses={
        401: {'description': 'Authentication required.'},
        403: {'description': 'Admin role required.'},
        404: {'description': 'Provider not found.'},
    },
)
def update_provider(
    provider_id: int,
    payload: ProviderUpdate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    config = _get_config_or_404(provider_id, db)
    if payload.name is not None:
        config.name = payload.name
    if payload.provider_type is not None:
        config.provider_type = payload.provider_type
    if payload.base_url is not None:
        config.base_url = payload.base_url
    if payload.api_key:
        config.api_key_encrypted = encryption.encrypt(payload.api_key)
    if payload.default_model is not None:
        config.default_model = payload.default_model
    if payload.enabled is not None:
        config.enabled = 1 if payload.enabled else 0
    if payload.cost_per_1k_input_tokens is not None:
        config.cost_per_1k_input_tokens = payload.cost_per_1k_input_tokens
    if payload.cost_per_1k_output_tokens is not None:
        config.cost_per_1k_output_tokens = payload.cost_per_1k_output_tokens
    db.commit()
    db.refresh(config)
    return _build_response(config)


@router.delete(
    '/{provider_id}',
    status_code=204,
    summary='Remove a provider',
    description='Permanently deletes a provider connection. Requires an admin access token.',
    responses={
        204: {'description': 'Provider deleted.'},
        401: {'description': 'Authentication required.'},
        403: {'description': 'Admin role required.'},
        404: {'description': 'Provider not found.'},
    },
)
def delete_provider(
    provider_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    config = _get_config_or_404(provider_id, db)
    db.delete(config)
    db.commit()


@router.get(
    '/{provider_id}/models',
    response_model=ProviderModelsResponse,
    summary='List models available from a provider',
    description='Connects to the live provider and returns the models it currently exposes.',
    response_description='Models available from this provider.',
    responses={
        400: {'description': 'Provider rejected the request (bad request or authentication failure).'},
        404: {'description': 'Provider not found.'},
        500: {'description': "Failed to decrypt the provider's stored API key."},
        502: {'description': 'Provider is unreachable or timed out.'},
    },
)
async def get_provider_models(
    provider_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    config = _get_config_or_404(provider_id, db)
    adapter = _instantiate_provider(config)
    try:
        models = await adapter.list_models()
    except (ProviderAuthError, ProviderBadRequestError, ProviderUnavailableError, ProviderTimeoutError) as exc:
        _raise_http_for_provider_error(exc)
    return ProviderModelsResponse(
        models=[ProviderModelInfo(id=m.id, name=m.name, metadata=m.metadata) for m in models]
    )


@router.post(
    '/{provider_id}/test',
    response_model=ProviderTestResponse,
    summary='Health-check a provider',
    description=(
        'Connects to the live provider and reports whether it is reachable and responsive. '
        'Never raises on a failed check — a failed health check is a normal, expected outcome, '
        'reported as `ok: false` with a `detail` message.'
    ),
    response_description='Health check result.',
    responses={
        404: {'description': 'Provider not found.'},
        500: {'description': "Failed to decrypt the provider's stored API key."},
    },
)
async def test_provider(
    provider_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    config = _get_config_or_404(provider_id, db)
    adapter = _instantiate_provider(config)
    t0 = time.monotonic()
    health = await adapter.health_check()
    latency_ms = (time.monotonic() - t0) * 1000
    return ProviderTestResponse(ok=health.healthy, latency_ms=latency_ms, detail=health.detail)
