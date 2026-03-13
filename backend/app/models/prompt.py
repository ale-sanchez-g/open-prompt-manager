from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Float, DateTime, ForeignKey, JSON, Table
)
from sqlalchemy.orm import relationship, backref
from app.database.base import Base


prompt_tags = Table(
    'prompt_tags',
    Base.metadata,
    Column('prompt_id', Integer, ForeignKey('prompts.id', ondelete='CASCADE'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id', ondelete='CASCADE'), primary_key=True),
)

prompt_agents = Table(
    'prompt_agents',
    Base.metadata,
    Column('prompt_id', Integer, ForeignKey('prompts.id', ondelete='CASCADE'), primary_key=True),
    Column('agent_id', Integer, ForeignKey('agents.id', ondelete='CASCADE'), primary_key=True),
)


class Prompt(Base):
    __tablename__ = 'prompts'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    content = Column(Text, nullable=False)
    version = Column(String(50), nullable=False, default='1.0.0')
    parent_id = Column(Integer, ForeignKey('prompts.id'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(100))
    variables = Column(JSON, default=list)
    components = Column(JSON, default=list)
    avg_rating = Column(Float, default=0.0)
    usage_count = Column(Integer, default=0)
    success_rate = Column(Float, default=0.0)

    tags = relationship('Tag', secondary=prompt_tags, back_populates='prompts')
    agents = relationship('Agent', secondary=prompt_agents, back_populates='prompts')
    metrics = relationship('PromptMetric', back_populates='prompt', cascade='all, delete-orphan')
    executions = relationship('PromptExecution', back_populates='prompt', cascade='all, delete-orphan')
    children = relationship(
        'Prompt',
        foreign_keys=[parent_id],
        backref=backref('parent', remote_side=[id]),
    )


class Tag(Base):
    __tablename__ = 'tags'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    color = Column(String(7), default='#3B82F6')

    prompts = relationship('Prompt', secondary=prompt_tags, back_populates='tags')


class Agent(Base):
    __tablename__ = 'agents'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    description = Column(Text)
    type = Column(String(50))
    status = Column(String(20), default='active')
    created_at = Column(DateTime, default=datetime.utcnow)

    prompts = relationship('Prompt', secondary=prompt_agents, back_populates='agents')
    executions = relationship('PromptExecution', back_populates='agent')


class PromptMetric(Base):
    __tablename__ = 'prompt_metrics'

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey('prompts.id', ondelete='CASCADE'), nullable=False)
    metric_name = Column(String(100), nullable=False)
    metric_value = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    metadata_ = Column('metadata', JSON)

    prompt = relationship('Prompt', back_populates='metrics')


class PromptExecution(Base):
    __tablename__ = 'prompt_executions'

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey('prompts.id', ondelete='CASCADE'), nullable=False)
    agent_id = Column(Integer, ForeignKey('agents.id', ondelete='SET NULL'), nullable=True)
    input_variables = Column(JSON)
    rendered_prompt = Column(Text)
    response = Column(Text)
    execution_time_ms = Column(Integer)
    token_count = Column(Integer)
    cost = Column(Float)
    success = Column(Integer, default=1)
    rating = Column(Integer)
    timestamp = Column(DateTime, default=datetime.utcnow)
    metadata_ = Column('metadata', JSON)

    prompt = relationship('Prompt', back_populates='executions')
    agent = relationship('Agent', back_populates='executions')
