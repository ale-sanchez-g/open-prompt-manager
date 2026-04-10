from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


# Tag schemas
class TagBase(BaseModel):
    name: str
    color: str = '#3B82F6'


class TagCreate(TagBase):
    pass


class TagResponse(TagBase):
    id: int

    model_config = {"from_attributes": True}


# Agent schemas
class AgentBase(BaseModel):
    name: str
    description: Optional[str] = None
    type: Optional[str] = None
    status: str = 'active'


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None


class AgentResponse(AgentBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PromptSummaryResponse(BaseModel):
    id: int
    name: str
    version: str
    description: Optional[str] = None
    avg_rating: float = 0.0
    usage_count: int = 0
    success_rate: float = 0.0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentDetailResponse(AgentBase):
    id: int
    created_at: datetime
    updated_at: datetime
    prompts: list[PromptSummaryResponse] = Field(default_factory=list)
    execution_count: int = 0
    success_rate: float = 0.0
    avg_rating: float = 0.0

    model_config = {"from_attributes": True}


# Variable schema
class VariableSchema(BaseModel):
    name: str
    type: str = 'string'  # string, number, boolean, array, object
    required: bool = False
    default: Optional[Any] = None
    description: Optional[str] = None


# Prompt schemas
class PromptBase(BaseModel):
    name: str
    description: Optional[str] = None
    content: str
    version: str = '1.0.0'
    created_by: Optional[str] = None
    variables: list[VariableSchema] = Field(default_factory=list)
    components: list[Any] = Field(default_factory=list)


class PromptCreate(PromptBase):
    tag_ids: list[int] = Field(default_factory=list)
    agent_ids: list[int] = Field(default_factory=list)


class PromptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    created_by: Optional[str] = None
    variables: Optional[list[VariableSchema]] = None
    components: Optional[list[Any]] = None
    tag_ids: Optional[list[int]] = None
    agent_ids: Optional[list[int]] = None


class PromptResponse(PromptBase):
    id: int
    parent_id: Optional[int] = None
    is_latest: bool = False
    created_at: datetime
    updated_at: datetime
    avg_rating: float = 0.0
    usage_count: int = 0
    success_rate: float = 0.0
    tags: list[TagResponse] = Field(default_factory=list)
    agents: list[AgentResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PromptListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    version: str
    parent_id: Optional[int] = None
    is_latest: bool = False
    created_at: datetime
    updated_at: datetime
    avg_rating: float = 0.0
    usage_count: int = 0
    success_rate: float = 0.0
    tags: list[TagResponse] = Field(default_factory=list)
    agents: list[AgentResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# Version schemas
class VersionCreate(BaseModel):
    content: Optional[str] = None
    description: Optional[str] = None
    variables: Optional[list[VariableSchema]] = None
    version: Optional[str] = None  # If not provided, auto-increment


# Render schemas
class RenderRequest(BaseModel):
    variables: dict[str, Any] = Field(default_factory=dict)


class RenderResponse(BaseModel):
    rendered_content: str
    variables_used: list[str]
    components_resolved: list[int]


# Execution schemas
class ExecutionCreate(BaseModel):
    agent_id: Optional[int] = None
    input_variables: Optional[dict[str, Any]] = None
    rendered_prompt: Optional[str] = None
    response: Optional[str] = None
    execution_time_ms: Optional[int] = None
    token_count: Optional[int] = None
    cost: Optional[float] = None
    success: int = 1
    rating: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None


class ExecutionResponse(BaseModel):
    id: int
    prompt_id: int
    agent_id: Optional[int] = None
    input_variables: Optional[dict[str, Any]] = None
    rendered_prompt: Optional[str] = None
    response: Optional[str] = None
    execution_time_ms: Optional[int] = None
    token_count: Optional[int] = None
    cost: Optional[float] = None
    success: int = 1
    rating: Optional[int] = None
    timestamp: datetime

    model_config = {"from_attributes": True}


# Metric schemas
class MetricCreate(BaseModel):
    metric_name: str
    metric_value: float
    metadata: Optional[dict[str, Any]] = None


class MetricResponse(BaseModel):
    id: int
    prompt_id: int
    metric_name: str
    metric_value: float
    timestamp: datetime

    model_config = {"from_attributes": True}
