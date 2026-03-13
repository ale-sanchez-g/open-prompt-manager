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

router = APIRouter(prefix='/prompts', tags=['prompts'])


def _get_prompt_or_404(prompt_id: int, db: Session) -> Prompt:
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail=f'Prompt {prompt_id} not found')
    return prompt


@router.get('/', response_model=list[PromptListResponse])
def list_prompts(
    search: Optional[str] = Query(None),
    tag_id: Optional[int] = Query(None),
    agent_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
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
    return query.order_by(Prompt.updated_at.desc()).offset(skip).limit(limit).all()


@router.post('/', response_model=PromptResponse, status_code=201)
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
    return db_prompt


@router.get('/{prompt_id}', response_model=PromptResponse)
def get_prompt(prompt_id: int, db: Session = Depends(get_db)):
    return _get_prompt_or_404(prompt_id, db)


@router.put('/{prompt_id}', response_model=PromptResponse)
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
    return prompt


@router.delete('/{prompt_id}', status_code=204)
def delete_prompt(prompt_id: int, db: Session = Depends(get_db)):
    prompt = _get_prompt_or_404(prompt_id, db)
    db.delete(prompt)
    db.commit()


@router.post('/{prompt_id}/versions', response_model=PromptResponse, status_code=201)
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
    return new_prompt


@router.get('/{prompt_id}/versions', response_model=list[PromptListResponse])
def get_versions(prompt_id: int, db: Session = Depends(get_db)):
    prompt = _get_prompt_or_404(prompt_id, db)
    # Collect the full ancestry chain
    root = prompt
    while root.parent_id:
        root = db.query(Prompt).get(root.parent_id)
    # Collect all descendants of the root
    versions = []
    queue = [root]
    while queue:
        current = queue.pop(0)
        versions.append(current)
        children = db.query(Prompt).filter(Prompt.parent_id == current.id).all()
        queue.extend(children)
    return versions


@router.post('/{prompt_id}/render', response_model=RenderResponse)
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


@router.post('/{prompt_id}/executions', response_model=ExecutionResponse, status_code=201)
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


@router.get('/{prompt_id}/executions', response_model=list[ExecutionResponse])
def get_executions(
    prompt_id: int,
    skip: int = 0,
    limit: int = 50,
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


@router.post('/{prompt_id}/metrics', response_model=MetricResponse, status_code=201)
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


@router.get('/{prompt_id}/metrics', response_model=list[MetricResponse])
def get_metrics(prompt_id: int, db: Session = Depends(get_db)):
    _get_prompt_or_404(prompt_id, db)
    return (
        db.query(PromptMetric)
        .filter(PromptMetric.prompt_id == prompt_id)
        .order_by(PromptMetric.timestamp.desc())
        .all()
    )
