from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.database.base import get_db
from app.models.prompt import Tag, Agent, PromptExecution
from app.models.schemas import (
    TagCreate, TagResponse,
    AgentCreate, AgentUpdate, AgentResponse, AgentDetailResponse, PromptSummaryResponse,
)

router = APIRouter(tags=['tags-agents'])


# ── Tags ──────────────────────────────────────────────────────────────────────

tags_router = APIRouter(prefix='/api/tags', tags=['tags'])


agents_router = APIRouter(prefix='/api/agents', tags=['agents'])


@tags_router.get(
    '/',
    response_model=list[TagResponse],
    summary='List tags',
    description='Returns all tags ordered alphabetically by name.',
    response_description='Array of tag objects.',
)
def list_tags(db: Session = Depends(get_db)):
    return db.query(Tag).order_by(Tag.name).all()


@tags_router.post(
    '/',
    response_model=TagResponse,
    status_code=201,
    summary='Create a tag',
    description='Creates a new tag with a unique name and an optional hex colour for badge display.',
    response_description='The newly created tag with its auto-assigned `id`.',
    responses={409: {'description': 'A tag with this name already exists.'}},
)
def create_tag(payload: TagCreate, db: Session = Depends(get_db)):
    existing = db.query(Tag).filter(Tag.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Tag '{payload.name}' already exists")
    tag = Tag(name=payload.name, color=payload.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@tags_router.delete(
    '/{tag_id}',
    status_code=204,
    summary='Delete a tag',
    description='Permanently deletes a tag and removes it from all prompts that reference it.',
    responses={
        204: {'description': 'Tag deleted.'},
        404: {'description': 'Tag not found.'},
    },
)
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail='Tag not found')
    db.delete(tag)
    db.commit()


# ── Agents ────────────────────────────────────────────────────────────────────


@agents_router.get(
    '/',
    response_model=list[AgentResponse],
    summary='List agents',
    description='Returns all agents ordered alphabetically by name.',
    response_description='Array of agent objects.',
)
def list_agents(db: Session = Depends(get_db)):
    return db.query(Agent).order_by(Agent.name).all()


@agents_router.post(
    '/',
    response_model=AgentResponse,
    status_code=201,
    summary='Create an agent',
    description=(
        'Registers a new AI agent. The `name` must be unique. '
        'Use `status` to control whether the agent is active, inactive, or deprecated.'
    ),
    response_description='The newly created agent with its auto-assigned `id` and `created_at`.',
    responses={409: {'description': 'An agent with this name already exists.'}},
)
def create_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    existing = db.query(Agent).filter(Agent.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Agent '{payload.name}' already exists")
    agent = Agent(
        name=payload.name,
        description=payload.description,
        type=payload.type,
        status=payload.status,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@agents_router.get(
    '/{agent_id}',
    response_model=AgentDetailResponse,
    summary='Get agent details',
    description=(
        'Returns a single agent with its full details: associated prompts and aggregate execution stats '
        '(`execution_count`, `success_rate`, `avg_rating`) computed across all prompt executions '
        'attributed to this agent.'
    ),
    response_description='Full agent detail including associated prompts and execution statistics.',
    responses={404: {'description': 'Agent not found.'}},
)
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = (
        db.query(Agent)
        .options(selectinload(Agent.prompts))
        .filter(Agent.id == agent_id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=404, detail='Agent not found')
    stats = (
        db.query(
            func.count(PromptExecution.id).label('execution_count'),
            func.avg(PromptExecution.success).label('success_rate'),
            func.avg(PromptExecution.rating).label('avg_rating'),
        )
        .filter(PromptExecution.agent_id == agent_id)
        .one()
    )
    execution_count = stats.execution_count or 0
    success_rate = float(stats.success_rate or 0.0)
    avg_rating = float(stats.avg_rating or 0.0)
    return AgentDetailResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        type=agent.type,
        status=agent.status,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
        prompts=[PromptSummaryResponse.model_validate(p) for p in agent.prompts],
        execution_count=execution_count,
        success_rate=success_rate,
        avg_rating=avg_rating,
    )


@agents_router.put(
    '/{agent_id}',
    response_model=AgentResponse,
    summary='Update an agent',
    description='Partially updates an agent. Only fields present in the request body are changed.',
    response_description='The updated agent.',
    responses={404: {'description': 'Agent not found.'}},
)
def update_agent(agent_id: int, payload: AgentUpdate, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail='Agent not found')
    if payload.name is not None:
        agent.name = payload.name
    if payload.description is not None:
        agent.description = payload.description
    if payload.type is not None:
        agent.type = payload.type
    if payload.status is not None:
        agent.status = payload.status
    db.commit()
    db.refresh(agent)
    return agent


@agents_router.delete(
    '/{agent_id}',
    status_code=204,
    summary='Delete an agent',
    description='Permanently deletes an agent and removes it from all associated prompts.',
    responses={
        204: {'description': 'Agent deleted.'},
        404: {'description': 'Agent not found.'},
    },
)
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail='Agent not found')
    db.delete(agent)
    db.commit()


router.include_router(tags_router)
router.include_router(agents_router)
