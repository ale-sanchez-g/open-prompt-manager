import time
from collections import deque
from typing import Annotated, NoReturn, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database.base import get_db
from app.models.llm_provider_config import LLMProviderConfig
from app.models.prompt import Prompt, Tag, Agent, PromptMetric, PromptExecution
from app.models.schemas import (
    PromptCreate, PromptUpdate, PromptResponse, PromptListResponse,
    VersionCreate, RenderRequest, RenderResponse,
    ExecutionCreate, ExecutionResponse,
    PromptTestRequest, PromptTestResponse,
    MetricCreate, MetricResponse,
)
from app.services import encryption
from app.services.llm.base import (
    CompletionResult,
    ProviderAuthError,
    ProviderBadRequestError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from app.services.llm.registry import get_provider
from app.services.prompt_service import render_prompt, update_prompt_stats, _increment_version
from app.services.auth_service import ROLE_ADMIN

router = APIRouter(prefix='/api/prompts', tags=['prompts'])


# ── Object-level authorization model ───────────────────────────────────────────
# Prompts live in a shared workspace: any authenticated user may READ and LIST
# every prompt (and its versions, executions, and metrics). MUTATIONS, however,
# are owner-scoped — only the prompt's creator (``created_by``) or an admin may
# update a prompt, delete it, or create a new version/child from it. This closes
# the BOLA gap (CWE-639 / OWASP API1) where any authenticated user could modify
# arbitrary prompts by ID.
#
# A non-owner mutation attempt returns 403 Forbidden (not 404). Because reads are
# shared, the object's existence is already discoverable, so hiding it behind a
# 404 would add no confidentiality while making legitimate clients harder to
# debug. 403 is therefore both honest and consistent with the auth layer's
# existing ``admin_required`` (403) response.


def _get_prompt_or_404(prompt_id: int, db: Session) -> Prompt:
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail=f'Prompt {prompt_id} not found')
    return prompt


def _require_owner_or_admin(prompt: Prompt, request: Request) -> None:
    """Authorize a mutating action against a prompt.

    Allows the request only when the caller owns the prompt (``created_by``
    matches the authenticated user's email) or holds the admin role. Raises
    403 otherwise. The authenticated identity is populated on ``request.state``
    by the auth middleware.
    """
    user_role = getattr(request.state, 'user_role', None)
    if user_role == ROLE_ADMIN:
        return
    user_email = getattr(request.state, 'user_email', None)
    if prompt.created_by is not None and prompt.created_by == user_email:
        return
    raise HTTPException(
        status_code=403,
        detail='You do not have permission to modify this prompt.',
    )


def _is_latest(prompt_id: int, db: Session) -> bool:
    """Return True if no other prompt lists this prompt as its parent."""
    return db.query(Prompt).filter(Prompt.parent_id == prompt_id).first() is None


def _build_prompt_response(prompt: Prompt, db: Session) -> PromptResponse:
    resp = PromptResponse.model_validate(prompt)
    resp.is_latest = _is_latest(prompt.id, db)
    return resp


def _build_list_responses(prompts: list[Prompt], db: Session) -> list[PromptListResponse]:
    """Build PromptListResponse objects with is_latest computed in one batch query."""
    if not prompts:
        return []
    prompt_ids = [p.id for p in prompts]
    rows = db.query(Prompt.parent_id).filter(Prompt.parent_id.in_(prompt_ids)).distinct().all()
    has_children = {row[0] for row in rows}
    result = []
    for p in prompts:
        resp = PromptListResponse.model_validate(p)
        resp.is_latest = p.id not in has_children
        result.append(resp)
    return result


@router.get(
    '/',
    response_model=list[PromptListResponse],
    summary='List prompts',
    description=(
        'Returns a paginated list of prompts. Optionally filter by a free-text search term, '
        'a tag ID, or an agent ID. Results are ordered by most-recently updated first. '
        'Each item includes an `is_latest` flag indicating whether a newer version exists.'
    ),
    response_description='Paginated array of prompt summaries.',
)
def list_prompts(
    db: Annotated[Session, Depends(get_db)],
    search: Optional[str] = Query(None, description='Full-text search against prompt name and description.'),
    tag_id: Optional[int] = Query(None, description='Filter to prompts that carry this tag ID.'),
    agent_id: Optional[int] = Query(None, description='Filter to prompts associated with this agent ID.'),
    skip: int = Query(0, ge=0, description='Number of records to skip (for pagination).'),
    limit: int = Query(50, ge=1, le=200, description='Maximum number of records to return (1–200).'),
):
    query = db.query(Prompt)
    if search:
        query = query.filter(
            Prompt.name.ilike(f'%{search}%') | Prompt.description.ilike(f'%{search}%')
        )
    if tag_id is not None:
        query = query.filter(Prompt.tags.any(Tag.id == tag_id))
    if agent_id is not None:
        query = query.filter(Prompt.agents.any(Agent.id == agent_id))
    prompts = query.order_by(Prompt.updated_at.desc()).offset(skip).limit(limit).all()
    return _build_list_responses(prompts, db)


@router.post(
    '/',
    response_model=PromptResponse,
    status_code=201,
    summary='Create a prompt',
    description=(
        'Creates a new root prompt (version 1.0.0 by default). '
        'Optionally attach existing tags and agents by supplying their IDs. '
        'Use `{{variable_name}}` in the content for dynamic substitution '
        'and `{{component:<id>}}` to embed another prompt by its ID.'
    ),
    response_description='The newly created prompt including auto-assigned `id`, timestamps, and computed `is_latest`.',
)
def create_prompt(payload: PromptCreate, request: Request, db: Annotated[Session, Depends(get_db)]):
    db_prompt = Prompt(
        name=payload.name,
        description=payload.description,
        content=payload.content,
        version=payload.version,
        created_by=getattr(request.state, 'user_email', None),
        variables=[v.model_dump() for v in payload.variables],
        components=payload.components,
    )
    if payload.tag_ids:
        db_prompt.tags = db.query(Tag).filter(Tag.id.in_(payload.tag_ids)).all()
    if payload.agent_ids:
        db_prompt.agents = db.query(Agent).filter(Agent.id.in_(payload.agent_ids)).all()
    db.add(db_prompt)
    db.commit()
    db.refresh(db_prompt)
    return _build_prompt_response(db_prompt, db)


@router.get(
    '/{prompt_id}',
    response_model=PromptResponse,
    summary='Get a prompt',
    description='Retrieves a single prompt by its integer ID, including full variable definitions, tags, agents, and quality metrics.',
    response_description='Full prompt detail including tags, agents, variables, and quality metrics.',
    responses={404: {'description': 'Prompt not found.'}},
)
def get_prompt(prompt_id: int, db: Annotated[Session, Depends(get_db)]):
    prompt = _get_prompt_or_404(prompt_id, db)
    return _build_prompt_response(prompt, db)


@router.put(
    '/{prompt_id}',
    response_model=PromptResponse,
    summary='Update a prompt',
    description=(
        'Partially updates a prompt in-place. Only fields present in the request body are changed; '
        'omitted fields retain their current values. '
        'Supplying `tag_ids` or `agent_ids` **replaces** the full association list.'
    ),
    response_description='The updated prompt.',
    responses={
        403: {'description': 'Caller is not the prompt owner or an admin.'},
        404: {'description': 'Prompt not found.'},
    },
)
def update_prompt(prompt_id: int, payload: PromptUpdate, request: Request, db: Annotated[Session, Depends(get_db)]):
    prompt = _get_prompt_or_404(prompt_id, db)
    _require_owner_or_admin(prompt, request)
    if payload.name is not None:
        prompt.name = payload.name
    if payload.description is not None:
        prompt.description = payload.description
    if payload.content is not None:
        prompt.content = payload.content
    if payload.created_by is not None:
        prompt.created_by = payload.created_by
    if payload.variables is not None:
        prompt.variables = [v.model_dump() for v in payload.variables]
    if payload.components is not None:
        prompt.components = payload.components
    if payload.tag_ids is not None:
        prompt.tags = db.query(Tag).filter(Tag.id.in_(payload.tag_ids)).all()
    if payload.agent_ids is not None:
        prompt.agents = db.query(Agent).filter(Agent.id.in_(payload.agent_ids)).all()
    db.commit()
    db.refresh(prompt)
    return _build_prompt_response(prompt, db)


@router.delete(
    '/{prompt_id}',
    status_code=204,
    summary='Delete a prompt',
    description=(
        'Permanently deletes a prompt. Associated executions and metrics are also removed via cascade. '
        'If the deleted prompt is a parent in a version chain, child prompts retain their `parent_id` '
        'reference but the parent will no longer be accessible.'
    ),
    responses={
        204: {'description': 'Prompt deleted successfully.'},
        403: {'description': 'Caller is not the prompt owner or an admin.'},
        404: {'description': 'Prompt not found.'},
    },
)
def delete_prompt(prompt_id: int, request: Request, db: Annotated[Session, Depends(get_db)]):
    prompt = _get_prompt_or_404(prompt_id, db)
    _require_owner_or_admin(prompt, request)
    db.delete(prompt)
    db.commit()


@router.post(
    '/{prompt_id}/versions',
    response_model=PromptResponse,
    status_code=201,
    summary='Create a new version',
    description=(
        'Creates a child prompt that inherits all fields from the parent. '
        'Only the fields supplied in the request body are overridden. '
        'The new version automatically receives the next patch version (e.g. 1.0.0 → 1.0.1) '
        'unless an explicit `version` string is provided. '
        'Tags and agents are inherited from the parent.'
    ),
    response_description='The newly created version with `parent_id` pointing to the source prompt.',
    responses={
        403: {'description': 'Caller is not the parent prompt owner or an admin.'},
        404: {'description': 'Parent prompt not found.'},
    },
)
def create_version(prompt_id: int, payload: VersionCreate, request: Request, db: Annotated[Session, Depends(get_db)]):
    parent = _get_prompt_or_404(prompt_id, db)
    _require_owner_or_admin(parent, request)
    new_version = payload.version or _increment_version(parent.version)
    new_prompt = Prompt(
        name=parent.name,
        description=payload.description if payload.description is not None else parent.description,
        content=payload.content if payload.content is not None else parent.content,
        version=new_version,
        parent_id=parent.id,
        created_by=parent.created_by,
        variables=[v.model_dump() for v in payload.variables] if payload.variables is not None else parent.variables,
        components=parent.components,
    )
    if payload.tag_ids is not None:
        new_prompt.tags = db.query(Tag).filter(Tag.id.in_(payload.tag_ids)).all()
    else:
        new_prompt.tags = list(parent.tags)
    if payload.agent_ids is not None:
        new_prompt.agents = db.query(Agent).filter(Agent.id.in_(payload.agent_ids)).all()
    else:
        new_prompt.agents = list(parent.agents)
    db.add(new_prompt)
    db.commit()
    db.refresh(new_prompt)
    return _build_prompt_response(new_prompt, db)


@router.get(
    '/{prompt_id}/versions',
    response_model=list[PromptListResponse],
    summary='Get version history',
    description=(
        'Returns the complete version lineage for the given prompt. '
        'The API walks up to the root ancestor, then performs a breadth-first traversal '
        'to collect every descendant. The result therefore includes all versions regardless '
        'of which version ID you supply within the lineage.'
    ),
    response_description='All versions in the lineage, ordered root-first.',
    responses={404: {'description': 'Prompt not found or ancestry is inconsistent.'}},
)
def get_versions(prompt_id: int, db: Annotated[Session, Depends(get_db)]):
    prompt = _get_prompt_or_404(prompt_id, db)
    # Collect the full ancestry chain
    root = prompt
    while root.parent_id:
        parent = db.get(Prompt, root.parent_id)
        if parent is None:
            raise HTTPException(
                status_code=404,
                detail="Prompt ancestry is inconsistent or parent was not found.",
            )
        root = parent
    # Collect all descendants of the root
    versions: list[Prompt] = []
    queue: deque[Prompt] = deque([root])
    while queue:
        current = queue.popleft()
        versions.append(current)
        children = db.query(Prompt).filter(Prompt.parent_id == current.id).all()
        queue.extend(children)
    return _build_list_responses(versions, db)


@router.post(
    '/{prompt_id}/render',
    response_model=RenderResponse,
    summary='Render a prompt',
    description=(
        'Resolves a prompt template by substituting `{{variable_name}}` placeholders with the supplied values '
        'and recursively expanding `{{component:<id>}}` references. '
        'Required variables (declared with `required: true`) must be present in the request body. '
        'Optional variables fall back to their `default` value if omitted. '
        'Returns a 422 if a required variable is missing or a circular component reference is detected.'
    ),
    response_description='The rendered prompt text together with metadata about variables and components used.',
    responses={
        404: {'description': 'Prompt not found.'},
        422: {'description': 'Missing required variable or circular component reference detected.'},
    },
)
def render(prompt_id: int, payload: RenderRequest, db: Annotated[Session, Depends(get_db)]):
    prompt = _get_prompt_or_404(prompt_id, db)
    try:
        rendered, vars_used, components = render_prompt(prompt, payload.variables, db)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return RenderResponse(
        rendered_content=rendered,
        variables_used=vars_used,
        components_resolved=components,
    )


def _validate_test_agent(agent_id: Optional[int], db: Session) -> None:
    if agent_id is not None and db.get(Agent, agent_id) is None:
        raise HTTPException(status_code=404, detail=f'Agent {agent_id} not found')


def _resolve_test_provider(payload: PromptTestRequest, db: Session) -> tuple[LLMProviderConfig, str, Optional[str]]:
    """Look up and validate the provider for a test run. Returns (config, model, decrypted api_key)."""
    config = db.get(LLMProviderConfig, payload.provider_id)
    if config is None:
        raise HTTPException(status_code=404, detail=f'Provider {payload.provider_id} not found')
    if not config.enabled:
        raise HTTPException(status_code=400, detail=f'Provider {payload.provider_id} is disabled')

    model = payload.model or config.default_model
    if not model:
        raise HTTPException(status_code=400, detail='No model specified and the provider has no default_model configured')

    api_key = None
    if config.api_key_encrypted:
        try:
            api_key = encryption.decrypt(config.api_key_encrypted)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=f'Failed to decrypt provider API key: {exc}') from exc

    return config, model, api_key


def _record_failed_test_execution(
    prompt_id: int,
    payload: PromptTestRequest,
    rendered: str,
    exc: Exception,
    execution_time_ms: int,
    db: Session,
) -> NoReturn:
    """Record a failed PromptExecution for a provider-call failure, then raise the matching HTTPException."""
    failed_execution = PromptExecution(
        prompt_id=prompt_id,
        agent_id=payload.agent_id,
        input_variables=payload.variables,
        rendered_prompt=rendered,
        response=None,
        execution_time_ms=execution_time_ms,
        success=0,
    )
    db.add(failed_execution)
    db.commit()
    update_prompt_stats(prompt_id, db)
    if isinstance(exc, ProviderAuthError):
        raise HTTPException(status_code=400, detail=f'Provider authentication failed: {exc}') from exc
    if isinstance(exc, ProviderBadRequestError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail=f'Provider request failed: {exc}') from exc


def _compute_test_cost(config: LLMProviderConfig, result: CompletionResult) -> float:
    cost = 0.0
    if config.cost_per_1k_input_tokens:
        cost += (result.prompt_tokens / 1000) * config.cost_per_1k_input_tokens
    if config.cost_per_1k_output_tokens:
        cost += (result.completion_tokens / 1000) * config.cost_per_1k_output_tokens
    return cost


@router.post(
    '/{prompt_id}/test',
    response_model=PromptTestResponse,
    summary='Test a prompt against a live LLM provider',
    description=(
        'Renders the prompt with the supplied variables, exactly like `POST /render`, then sends the '
        'rendered text to a configured LLM provider for a live completion. A `PromptExecution` is '
        'recorded for both successful and failed provider calls, and the prompt\'s aggregate stats '
        '(`usage_count`, `avg_rating`, `success_rate`) are refreshed on every run, success or failure.'
    ),
    response_description='The LLM output together with token/latency stats and the recorded execution ID.',
    responses={
        400: {'description': 'Provider is disabled, rejected the request, or authentication failed.'},
        404: {'description': 'Prompt, provider, or agent not found.'},
        422: {'description': 'Missing required variable or circular component reference detected.'},
        500: {'description': "Failed to decrypt the provider's stored API key."},
        502: {'description': 'Provider is unreachable or timed out.'},
    },
)
async def test_prompt(prompt_id: int, payload: PromptTestRequest, db: Annotated[Session, Depends(get_db)]):
    prompt = _get_prompt_or_404(prompt_id, db)
    try:
        rendered, _vars_used, _components = render_prompt(prompt, payload.variables, db)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    _validate_test_agent(payload.agent_id, db)
    config, model, api_key = _resolve_test_provider(payload, db)

    params = payload.params.model_dump(exclude_none=True) if payload.params else None

    # Per-user LLM-call rate limiting is out of scope here (tracked separately as a hardening follow-up).
    t0 = time.monotonic()
    try:
        provider = get_provider({'type': config.provider_type, 'base_url': config.base_url, 'api_key': api_key})
        result = await provider.chat(
            messages=[{'role': 'user', 'content': rendered}],
            model=model,
            params=params,
        )
    except (ProviderAuthError, ProviderBadRequestError, ProviderUnavailableError, ProviderTimeoutError) as exc:
        _record_failed_test_execution(prompt_id, payload, rendered, exc, int((time.monotonic() - t0) * 1000), db)

    execution = PromptExecution(
        prompt_id=prompt_id,
        agent_id=payload.agent_id,
        input_variables=payload.variables,
        rendered_prompt=rendered,
        response=result.content,
        execution_time_ms=int(result.latency_ms),
        token_count=result.total_tokens,
        cost=_compute_test_cost(config, result),
        success=1,
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)
    update_prompt_stats(prompt_id, db)

    return PromptTestResponse(
        output=result.content,
        model=result.model,
        provider=config.name,
        rendered_prompt=rendered,
        latency_ms=result.latency_ms,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        total_tokens=result.total_tokens,
        execution_id=execution.id,
    )


@router.post(
    '/{prompt_id}/executions',
    response_model=ExecutionResponse,
    status_code=201,
    summary='Record an execution',
    description=(
        'Stores the result of executing a prompt against an LLM. '
        'After recording, the prompt\'s aggregate stats (`usage_count`, `avg_rating`, `success_rate`) '
        'are automatically recalculated. '
        'All fields except `success` are optional — you can log a minimal execution with just `success: 1`.'
    ),
    response_description='The recorded execution with its auto-assigned `id` and `timestamp`.',
    responses={404: {'description': 'Prompt not found.'}},
)
def create_execution(prompt_id: int, payload: ExecutionCreate, db: Annotated[Session, Depends(get_db)]):
    _get_prompt_or_404(prompt_id, db)
    execution = PromptExecution(
        prompt_id=prompt_id,
        agent_id=payload.agent_id,
        input_variables=payload.input_variables,
        rendered_prompt=payload.rendered_prompt,
        response=payload.response,
        execution_time_ms=payload.execution_time_ms,
        token_count=payload.token_count,
        cost=payload.cost,
        success=payload.success,
        rating=payload.rating,
        metadata_=payload.metadata,
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)
    update_prompt_stats(prompt_id, db)
    return execution


@router.get(
    '/{prompt_id}/executions',
    response_model=list[ExecutionResponse],
    summary='Get execution history',
    description='Returns past executions for a prompt, ordered most-recent first. Use `skip` and `limit` for pagination.',
    response_description='Array of execution records.',
    responses={404: {'description': 'Prompt not found.'}},
)
def get_executions(
    prompt_id: int,
    db: Annotated[Session, Depends(get_db)],
    skip: int = Query(0, ge=0, description='Number of records to skip.'),
    limit: int = Query(50, ge=1, le=200, description='Maximum records to return (1–200).'),
):
    _get_prompt_or_404(prompt_id, db)
    return (
        db.query(PromptExecution)
        .filter(PromptExecution.prompt_id == prompt_id)
        .order_by(PromptExecution.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post(
    '/{prompt_id}/metrics',
    response_model=MetricResponse,
    status_code=201,
    summary='Add a custom metric',
    description=(
        'Records a named numeric metric for a prompt (e.g. `latency_p99`, `hallucination_rate`). '
        'Metrics complement the built-in aggregates (`avg_rating`, `success_rate`) and can represent '
        'any domain-specific quality signal.'
    ),
    response_description='The newly recorded metric with its auto-assigned `id` and `timestamp`.',
    responses={404: {'description': 'Prompt not found.'}},
)
def add_metric(prompt_id: int, payload: MetricCreate, db: Annotated[Session, Depends(get_db)]):
    _get_prompt_or_404(prompt_id, db)
    metric = PromptMetric(
        prompt_id=prompt_id,
        metric_name=payload.metric_name,
        metric_value=payload.metric_value,
        metadata_=payload.metadata,
    )
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


@router.get(
    '/{prompt_id}/metrics',
    response_model=list[MetricResponse],
    summary='Get custom metrics',
    description='Returns all custom metrics recorded for a prompt, ordered most-recent first.',
    response_description='Array of metric records.',
    responses={404: {'description': 'Prompt not found.'}},
)
def get_metrics(prompt_id: int, db: Annotated[Session, Depends(get_db)]):
    _get_prompt_or_404(prompt_id, db)
    return (
        db.query(PromptMetric)
        .filter(PromptMetric.prompt_id == prompt_id)
        .order_by(PromptMetric.timestamp.desc())
        .all()
    )
