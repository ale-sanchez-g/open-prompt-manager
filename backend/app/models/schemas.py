from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


# Tag schemas
class TagBase(BaseModel):
    name: str = Field(
        ...,
        description='Display name for the tag. Must be unique across all tags.',
        examples=['production'],
    )
    color: str = Field(
        '#3B82F6',
        description='Hex colour string used to render the tag badge in the UI.',
        examples=['#10B981'],
    )


class TagCreate(TagBase):
    model_config = {
        'json_schema_extra': {
            'example': {'name': 'production', 'color': '#10B981'},
        }
    }


class TagResponse(TagBase):
    id: int = Field(..., description='Auto-assigned primary key.', examples=[1])

    model_config = {'from_attributes': True}


# Agent schemas
class AgentBase(BaseModel):
    name: str = Field(
        ...,
        description='Unique human-readable name for the agent.',
        examples=['customer-support-bot'],
    )
    description: Optional[str] = Field(
        None,
        description='Free-text description of what the agent does.',
        examples=['Handles tier-1 customer support queries.'],
    )
    type: Optional[str] = Field(
        None,
        description='Classifier for the agent category (e.g. "chatbot", "summariser").',
        examples=['chatbot'],
    )
    status: str = Field(
        'active',
        description='Lifecycle status of the agent. One of: active, inactive, deprecated.',
        examples=['active'],
    )


class AgentCreate(AgentBase):
    model_config = {
        'json_schema_extra': {
            'example': {
                'name': 'customer-support-bot',
                'description': 'Handles tier-1 customer support queries.',
                'type': 'chatbot',
                'status': 'active',
            }
        }
    }


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, description='New unique name for the agent.', examples=['support-bot-v2'])
    description: Optional[str] = Field(None, description='Updated description.', examples=['Updated description.'])
    type: Optional[str] = Field(None, description='Updated agent type.', examples=['summariser'])
    status: Optional[str] = Field(
        None,
        description='New lifecycle status. One of: active, inactive, deprecated.',
        examples=['inactive'],
    )

    model_config = {
        'json_schema_extra': {
            'example': {'status': 'inactive'},
        }
    }


class AgentResponse(AgentBase):
    id: int = Field(..., description='Auto-assigned primary key.', examples=[1])
    created_at: datetime = Field(..., description='UTC timestamp when the agent was created.')

    model_config = {'from_attributes': True}


class PromptSummaryResponse(BaseModel):
    id: int = Field(..., description='Auto-assigned primary key.', examples=[1])
    name: str = Field(..., description='Name of the prompt.', examples=['Greeting Prompt'])
    version: str = Field(..., description='Semantic version string.', examples=['1.0.0'])
    description: Optional[str] = Field(None, description='Short description of what the prompt does.')
    avg_rating: float = Field(0.0, description='Average execution rating (0–5).', examples=[4.2])
    usage_count: int = Field(0, description='Total number of recorded executions.', examples=[42])
    success_rate: float = Field(0.0, description='Fraction of executions marked as successful (0–1).', examples=[0.95])
    created_at: datetime = Field(..., description='UTC timestamp when the prompt was first created.')
    updated_at: datetime = Field(..., description='UTC timestamp of the last update.')

    model_config = {'from_attributes': True}


class AgentDetailResponse(AgentBase):
    id: int = Field(..., description='Auto-assigned primary key.', examples=[1])
    created_at: datetime = Field(..., description='UTC timestamp when the agent was created.')
    updated_at: datetime = Field(..., description='UTC timestamp of the last update.')
    prompts: list[PromptSummaryResponse] = Field(
        default_factory=list,
        description='Prompts currently associated with this agent.',
    )
    execution_count: int = Field(0, description='Total executions recorded for this agent.', examples=[100])
    success_rate: float = Field(0.0, description='Fraction of executions that were successful (0–1).', examples=[0.93])
    avg_rating: float = Field(0.0, description='Average rating across all executions (0–5).', examples=[4.1])

    model_config = {'from_attributes': True}


# Variable schema
class VariableSchema(BaseModel):
    name: str = Field(
        ...,
        description='Variable name as it appears in the prompt template (without braces).',
        examples=['user_name'],
    )
    type: str = Field(
        'string',
        description='Data type of the variable. One of: string, number, boolean, array, object.',
        examples=['string'],
    )
    required: bool = Field(False, description='Whether the variable must be supplied at render time.', examples=[True])
    default: Optional[Any] = Field(
        None,
        description='Default value used when the variable is not supplied and required is false.',
        examples=['World'],
    )
    description: Optional[str] = Field(
        None,
        description='Human-readable description of what the variable represents.',
        examples=["The end user's first name."],
    )


# Prompt schemas
class PromptBase(BaseModel):
    name: str = Field(
        ...,
        description='Human-readable name for the prompt. Used for search and display.',
        examples=['Customer Greeting'],
    )
    description: Optional[str] = Field(
        None,
        description='Short summary of the prompt purpose.',
        examples=['Generates a personalised greeting for new customers.'],
    )
    content: str = Field(
        ...,
        description=(
            'The prompt template. Use {{variable_name}} placeholders for dynamic values '
            'and {{component:<id>}} to embed another prompt by its integer ID.'
        ),
        examples=['Hello, {{user_name}}! Welcome to {{platform}}.'],
    )
    version: str = Field(
        '1.0.0',
        description='Semantic version string (MAJOR.MINOR.PATCH). Auto-incremented on each new version.',
        examples=['1.0.0'],
    )
    created_by: Optional[str] = Field(
        None,
        description='Username or identifier of the person who created or last updated this prompt.',
        examples=['alice@example.com'],
    )
    variables: list[VariableSchema] = Field(
        default_factory=list,
        description='Typed variable definitions declared in the prompt template.',
    )
    components: list[Any] = Field(
        default_factory=list,
        description='Reserved for future structured component metadata. Typically empty.',
    )


class PromptCreate(PromptBase):
    tag_ids: list[int] = Field(
        default_factory=list,
        description='IDs of existing tags to attach to the prompt.',
        examples=[[1, 2]],
    )
    agent_ids: list[int] = Field(
        default_factory=list,
        description='IDs of existing agents that will use this prompt.',
        examples=[[1]],
    )

    model_config = {
        'json_schema_extra': {
            'example': {
                'name': 'Customer Greeting',
                'description': 'Generates a personalised greeting.',
                'content': 'Hello, {{user_name}}! Welcome to {{platform}}.',
                'version': '1.0.0',
                'created_by': 'alice@example.com',
                'variables': [
                    {'name': 'user_name', 'type': 'string', 'required': True, 'description': "User's first name."},
                    {'name': 'platform', 'type': 'string', 'required': False, 'default': 'our platform', 'description': 'Platform name.'},
                ],
                'tag_ids': [],
                'agent_ids': [],
            }
        }
    }


class PromptUpdate(BaseModel):
    name: Optional[str] = Field(None, description='Updated prompt name.', examples=['Customer Welcome'])
    description: Optional[str] = Field(None, description='Updated description.', examples=['Updated greeting.'])
    content: Optional[str] = Field(
        None,
        description='Updated template content. Existing {{variable}} syntax is preserved.',
        examples=['Hi {{user_name}}, glad to have you on {{platform}}!'],
    )
    created_by: Optional[str] = Field(None, description='Updated author identifier.', examples=['bob@example.com'])
    variables: Optional[list[VariableSchema]] = Field(None, description='Replacement list of variable definitions.')
    components: Optional[list[Any]] = Field(None, description='Replacement component metadata list.')
    tag_ids: Optional[list[int]] = Field(None, description='Replacement set of tag IDs (replaces all existing tags).', examples=[[1]])
    agent_ids: Optional[list[int]] = Field(None, description='Replacement set of agent IDs (replaces all existing agents).', examples=[[]])

    model_config = {
        'json_schema_extra': {
            'example': {
                'name': 'Customer Welcome',
                'content': 'Hi {{user_name}}, glad to have you!',
            }
        }
    }


class PromptResponse(PromptBase):
    id: int = Field(..., description='Auto-assigned primary key.', examples=[1])
    parent_id: Optional[int] = Field(
        None,
        description='ID of the prompt this version was branched from. Null for root versions.',
        examples=[None],
    )
    is_latest: bool = Field(
        False,
        description='True when no newer version exists for this prompt lineage.',
        examples=[True],
    )
    created_at: datetime = Field(..., description='UTC timestamp when the prompt was first created.')
    updated_at: datetime = Field(..., description='UTC timestamp of the last update.')
    avg_rating: float = Field(0.0, description='Average execution rating (0–5).', examples=[4.2])
    usage_count: int = Field(0, description='Total number of recorded executions.', examples=[42])
    success_rate: float = Field(0.0, description='Fraction of executions marked as successful (0–1).', examples=[0.95])
    tags: list[TagResponse] = Field(default_factory=list, description='Tags attached to this prompt.')
    agents: list[AgentResponse] = Field(default_factory=list, description='Agents associated with this prompt.')

    model_config = {'from_attributes': True}


class PromptListResponse(BaseModel):
    id: int = Field(..., description='Auto-assigned primary key.', examples=[1])
    name: str = Field(..., description='Human-readable prompt name.', examples=['Customer Greeting'])
    description: Optional[str] = Field(None, description='Short description of the prompt purpose.')
    version: str = Field(..., description='Semantic version string.', examples=['1.0.0'])
    parent_id: Optional[int] = Field(None, description='ID of the parent prompt if this is a versioned copy.')
    is_latest: bool = Field(False, description='True when this is the newest version in its lineage.', examples=[True])
    created_at: datetime = Field(..., description='UTC creation timestamp.')
    updated_at: datetime = Field(..., description='UTC last-updated timestamp.')
    avg_rating: float = Field(0.0, description='Average execution rating (0–5).', examples=[4.2])
    usage_count: int = Field(0, description='Total recorded executions.', examples=[42])
    success_rate: float = Field(0.0, description='Fraction of successful executions (0–1).', examples=[0.95])
    tags: list[TagResponse] = Field(default_factory=list, description='Tags attached to this prompt.')
    agents: list[AgentResponse] = Field(default_factory=list, description='Agents associated with this prompt.')

    model_config = {'from_attributes': True}


# Version schemas
class VersionCreate(BaseModel):
    content: Optional[str] = Field(
        None,
        description='Updated template content for the new version. Inherits from parent if omitted.',
        examples=['Hello, {{user_name}}! This is version 2.'],
    )
    description: Optional[str] = Field(
        None,
        description='Change notes describing what was updated in this version.',
        examples=['Improved tone and added platform variable.'],
    )
    variables: Optional[list[VariableSchema]] = Field(
        None,
        description='Updated variable definitions. Inherits from parent if omitted.',
    )
    version: Optional[str] = Field(
        None,
        description='Explicit semantic version string. Auto-increments the patch segment if omitted.',
        examples=['2.0.0'],
    )

    model_config = {
        'json_schema_extra': {
            'example': {
                'content': 'Hello, {{user_name}}! This is version 2.',
                'description': 'Improved tone.',
            }
        }
    }


# Render schemas
class RenderRequest(BaseModel):
    variables: dict[str, Any] = Field(
        default_factory=dict,
        description='Key-value pairs to substitute into the prompt template. Required variables must be present.',
        examples=[{'user_name': 'Alice', 'platform': 'PromptHub'}],
    )

    model_config = {
        'json_schema_extra': {
            'example': {'variables': {'user_name': 'Alice', 'platform': 'PromptHub'}},
        }
    }


class RenderResponse(BaseModel):
    rendered_content: str = Field(
        ...,
        description='The fully-rendered prompt text after variable substitution and component resolution.',
        examples=['Hello, Alice! Welcome to PromptHub.'],
    )
    variables_used: list[str] = Field(
        ...,
        description='Names of all variables that were substituted during rendering.',
        examples=[['user_name', 'platform']],
    )
    components_resolved: list[int] = Field(
        ...,
        description='IDs of component prompts that were recursively resolved during rendering.',
        examples=[[]],
    )


# Execution schemas
class ExecutionCreate(BaseModel):
    agent_id: Optional[int] = Field(
        None,
        description='ID of the agent that performed this execution. Omit for manual/ad-hoc runs.',
        examples=[1],
    )
    input_variables: Optional[dict[str, Any]] = Field(
        None,
        description='Variable values supplied to the prompt at render time.',
        examples=[{'user_name': 'Alice', 'platform': 'PromptHub'}],
    )
    rendered_prompt: Optional[str] = Field(
        None,
        description='The fully-rendered prompt text that was sent to the LLM.',
        examples=['Hello, Alice! Welcome to PromptHub.'],
    )
    response: Optional[str] = Field(
        None,
        description='The raw response text returned by the LLM.',
        examples=["Thanks for joining us, Alice! How can I help you today?"],
    )
    execution_time_ms: Optional[int] = Field(
        None,
        description='Wall-clock time in milliseconds from prompt dispatch to response receipt.',
        examples=[340],
    )
    token_count: Optional[int] = Field(
        None,
        description='Total tokens consumed (prompt + completion).',
        examples=[64],
    )
    cost: Optional[float] = Field(
        None,
        description='Monetary cost of the LLM call in USD.',
        examples=[0.0004],
    )
    success: int = Field(
        1,
        description='1 if the execution produced a usable result, 0 if it failed or was rejected.',
        examples=[1],
    )
    rating: Optional[int] = Field(
        None,
        description='Human or automated quality rating on a 1–5 scale.',
        examples=[5],
    )
    metadata: Optional[dict[str, Any]] = Field(
        None,
        description='Arbitrary key-value pairs for custom tracking (e.g. request ID, model name).',
        examples=[{'model': 'gpt-4o', 'request_id': 'req_abc123'}],
    )

    model_config = {
        'json_schema_extra': {
            'example': {
                'agent_id': 1,
                'input_variables': {'user_name': 'Alice', 'platform': 'PromptHub'},
                'rendered_prompt': 'Hello, Alice! Welcome to PromptHub.',
                'response': "Thanks for joining us, Alice!",
                'execution_time_ms': 340,
                'token_count': 64,
                'cost': 0.0004,
                'success': 1,
                'rating': 5,
            }
        }
    }


class ExecutionResponse(BaseModel):
    id: int = Field(..., description='Auto-assigned primary key.', examples=[1])
    prompt_id: int = Field(..., description='ID of the prompt that was executed.', examples=[1])
    agent_id: Optional[int] = Field(None, description='ID of the agent that ran the execution.', examples=[1])
    input_variables: Optional[dict[str, Any]] = Field(None, description='Variables supplied at render time.')
    rendered_prompt: Optional[str] = Field(None, description='The rendered prompt text sent to the LLM.')
    response: Optional[str] = Field(None, description='Raw LLM response text.')
    execution_time_ms: Optional[int] = Field(None, description='Execution duration in milliseconds.', examples=[340])
    token_count: Optional[int] = Field(None, description='Total tokens consumed.', examples=[64])
    cost: Optional[float] = Field(None, description='Monetary cost of the LLM call in USD.', examples=[0.0004])
    success: int = Field(1, description='1 = successful, 0 = failed.', examples=[1])
    rating: Optional[int] = Field(None, description='Quality rating (1–5).', examples=[5])
    timestamp: datetime = Field(..., description='UTC timestamp when the execution was recorded.')

    model_config = {'from_attributes': True}


# Metric schemas
class MetricCreate(BaseModel):
    metric_name: str = Field(
        ...,
        description='Metric identifier (e.g. "latency_p99", "token_efficiency", "hallucination_rate").',
        examples=['latency_p99'],
    )
    metric_value: float = Field(
        ...,
        description='Numeric value for the metric.',
        examples=[312.5],
    )
    metadata: Optional[dict[str, Any]] = Field(
        None,
        description='Optional key-value context for the measurement (e.g. environment, model version).',
        examples=[{'environment': 'production', 'model': 'gpt-4o'}],
    )

    model_config = {
        'json_schema_extra': {
            'example': {
                'metric_name': 'latency_p99',
                'metric_value': 312.5,
                'metadata': {'environment': 'production'},
            }
        }
    }


class MetricResponse(BaseModel):
    id: int = Field(..., description='Auto-assigned primary key.', examples=[1])
    prompt_id: int = Field(..., description='ID of the prompt this metric belongs to.', examples=[1])
    metric_name: str = Field(..., description='Metric identifier.', examples=['latency_p99'])
    metric_value: float = Field(..., description='Numeric metric value.', examples=[312.5])
    timestamp: datetime = Field(..., description='UTC timestamp when the metric was recorded.')

    model_config = {'from_attributes': True}
