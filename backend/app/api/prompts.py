from collections import deque
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.base import get_db
from app.models.prompt import Prompt, Tag, Agent, PromptMetric, PromptExecution
from app.models.schemas import (
    PromptCreate, PromptUpdate, PromptResponse, PromptListResponse,
    VersionCreate, RenderRequest, RenderResponse,
    ExecutionCreate, ExecutionResponse,
    MetricCreate, MetricResponse,
)
from app.services.prompt_service import render_prompt, update_prompt_stats, _increment_version

router = APIRouter(prefix='/api/prompts', tags=['prompts'])


def _get_prompt_or_404(prompt_id: int, db: Session) -> Prompt:
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail=f'Prompt {prompt_id} not found')
    return prompt


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
    search: Optional[str] = Query(None, description='Full-text search against prompt name and description.'),
    tag_id: Optional[int] = Query(None, description='Filter to prompts that carry this tag ID.'),
    agent_id: Optional[int] = Query(None, description='Filter to prompts associated with this agent ID.'),
    skip: int = Query(0, ge=0, description='Number of records to skip (for pagination).'),
    limit: int = Query(50, ge=1, le=200, description='Maximum number of records to return (1–200).'),
    db: Session = Depends(get_db),
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
def create_prompt(payload: PromptCreate, db: Session = Depends(get_db)):
    db_prompt = Prompt(
        name=payload.name,
        description=payload.description,
        content=payload.content,
        version=payload.version,
        created_by=payload.created_by,
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
def get_prompt(prompt_id: int, db: Session = Depends(get_db)):
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
    responses={404: {'description': 'Prompt not found.'}},
)
def update_prompt(prompt_id: int, payload: PromptUpdate, db: Session = Depends(get_db)):
    prompt = _get_prompt_or_404(prompt_id, db)
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
        404: {'description': 'Prompt not found.'},
    },
)
def delete_prompt(prompt_id: int, db: Session = Depends(get_db)):
    prompt = _get_prompt_or_404(prompt_id, db)
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
    responses={404: {'description': 'Parent prompt not found.'}},
)
def create_version(prompt_id: int, payload: VersionCreate, db: Session = Depends(get_db)):
    parent = _get_prompt_or_404(prompt_id, db)
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
    new_prompt.tags = list(parent.tags)
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
def get_versions(prompt_id: int, db: Session = Depends(get_db)):
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
def render(prompt_id: int, payload: RenderRequest, db: Session = Depends(get_db)):
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
def create_execution(prompt_id: int, payload: ExecutionCreate, db: Session = Depends(get_db)):
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
    skip: int = Query(0, ge=0, description='Number of records to skip.'),
    limit: int = Query(50, ge=1, le=200, description='Maximum records to return (1–200).'),
    db: Session = Depends(get_db),
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
def add_metric(prompt_id: int, payload: MetricCreate, db: Session = Depends(get_db)):
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
def get_metrics(prompt_id: int, db: Session = Depends(get_db)):
    _get_prompt_or_404(prompt_id, db)
    return (
        db.query(PromptMetric)
        .filter(PromptMetric.prompt_id == prompt_id)
        .order_by(PromptMetric.timestamp.desc())
        .all()
    )
