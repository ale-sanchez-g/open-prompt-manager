from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.base import get_db
from app.models.prompt import Tag, Agent
from app.models.schemas import (
    TagCreate, TagResponse,
    AgentCreate, AgentUpdate, AgentResponse, AgentDetailResponse, PromptSummaryResponse,
)

router = APIRouter(tags=['tags-agents'])


# ── Tags ──────────────────────────────────────────────────────────────────────

tags_router = APIRouter(prefix='/api/tags')


@tags_router.get('/', response_model=list[TagResponse])
def list_tags(db: Session = Depends(get_db)):
    return db.query(Tag).order_by(Tag.name).all()


@tags_router.post('/', response_model=TagResponse, status_code=201)
def create_tag(payload: TagCreate, db: Session = Depends(get_db)):
    existing = db.query(Tag).filter(Tag.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Tag '{payload.name}' already exists")
    tag = Tag(name=payload.name, color=payload.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@tags_router.delete('/{tag_id}', status_code=204)
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail='Tag not found')
    db.delete(tag)
    db.commit()


# ── Agents ────────────────────────────────────────────────────────────────────

agents_router = APIRouter(prefix='/api/agents')


@agents_router.get('/', response_model=list[AgentResponse])
def list_agents(db: Session = Depends(get_db)):
    return db.query(Agent).order_by(Agent.name).all()


@agents_router.post('/', response_model=AgentResponse, status_code=201)
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


@agents_router.get('/{agent_id}', response_model=AgentDetailResponse)
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail='Agent not found')
    executions = agent.executions
    execution_count = len(executions)
    success_rate = 0.0
    avg_rating = 0.0
    if execution_count > 0:
        success_count = sum(1 for e in executions if e.success)
        success_rate = success_count / execution_count
        ratings = [e.rating for e in executions if e.rating is not None]
        if ratings:
            avg_rating = sum(ratings) / len(ratings)
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


@agents_router.put('/{agent_id}', response_model=AgentResponse)
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


@agents_router.delete('/{agent_id}', status_code=204)
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail='Agent not found')
    db.delete(agent)
    db.commit()


router.include_router(tags_router)
router.include_router(agents_router)
