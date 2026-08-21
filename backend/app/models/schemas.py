from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

constants = {
    'DESCRIPTION_MESSAGE': 'Server-generated user identifier.',
    'REGISTER_USER_ID_EXAMPLE': 'usr_abc123',
    'EXAMPLE_EMAIL': 'user@opm.io',
    'EXAMPLE_PASS': 'Str0ng!Pass', # Note: these are just examples and should not be used in production
    'EXAMPLE_PROVIDER_NAME': 'My DeepSeek Account',
    'EXAMPLE_PROVIDER_BASE_URL': 'https://api.deepseek.com',
}

class AuthRequest(BaseModel):
    email: str = Field(..., description='Email address used to identify the user account.', examples=[constants['EXAMPLE_EMAIL']])
    password: str = Field(..., description='Plaintext password submitted for registration or login.', examples=[constants['EXAMPLE_PASS']])

    model_config = {
        'json_schema_extra': {
            'example': {'email': constants['EXAMPLE_EMAIL'], 'password': constants['EXAMPLE_PASS']},
        }
    }


class ExtendedRegistrationFields(BaseModel):
    """Optional profile fields collected at registration.

    Gated by the ``registration_extended_fields`` flag - see
    docs/features/registration-feature.md §4.3.

    **This model is deliberately permissive: no length limits, no format checks.**
    Guardrail 2 requires that with the flag OFF a stray ``extended`` block is
    ignored without error, exactly as today (where it is dropped as an unknown
    field). Declaring constraints here would turn an over-long company name into
    a 422 on the OFF path, which would be a behaviour change. Constraints live in
    the flag-gated service layer instead, using the limits in
    ``app.core.registration``.

    This model is never used to type ``RegisterRequest.extended`` directly (see
    the comment there): doing so would make FastAPI parse - and reject - a
    malformed or wrong-shaped block before the flag is even consulted, which is
    exactly the OFF-path regression guardrail 2 forbids.
    """

    company_name: Optional[str] = Field(
        None, alias='companyName', description='Free-text company or organisation name.', examples=['Acme Ltd']
    )
    job_role: Optional[str] = Field(
        None, alias='jobRole', description='Free-text job role.', examples=['Platform Engineer']
    )
    phone: Optional[str] = Field(
        None, description='Contact phone number. PII - normalised to E.164 before storage.', examples=['+61412345678']
    )
    marketing_opt_in: bool = Field(
        False,
        alias='marketingOptIn',
        description='Consent to marketing email. Must default to false and render unchecked.',
    )

    model_config = {'populate_by_name': True}


class RegisterRequest(AuthRequest):
    """Registration payload. Extends AuthRequest without altering it.

    ``AuthRequest`` is shared with ``POST /auth/login``; the extended-registration
    change must not widen the login contract, so the new optional fields live on
    this subclass and only the register endpoint uses it.

    Both new fields are optional. Requiring ``sessionId`` would be a breaking
    change to a public, unauthenticated endpoint and would violate guardrail 2 -
    existing clients send ``{email, password}`` only. Absent ``sessionId`` means
    no Flagsmith identity, which resolves the flag to false and takes the legacy
    path.
    """

    session_id: Optional[str] = Field(
        None,
        alias='sessionId',
        description=(
            'Opaque per-visit identifier used only to evaluate the '
            'registration_extended_fields flag against the same Flagsmith identity the '
            'browser used. Not persisted. Optional: when absent the legacy flow applies.'
        ),
        examples=['b7f1c2de-3a4b-4c5d-8e9f-0a1b2c3d4e5f'],
    )
    # Deliberately untyped (not ExtendedRegistrationFields). With the flag off,
    # any value here - including a malformed one, e.g. `"extended": "oops"` -
    # must be dropped exactly like main drops an unknown field, never a 422
    # (guardrail 2). Typing this as ExtendedRegistrationFields would make
    # FastAPI validate (and reject) it before app.api.auth.register ever
    # checks the flag. The endpoint parses it into ExtendedRegistrationFields
    # itself, but only once the flag is confirmed on for this sessionId.
    extended: Optional[Any] = Field(
        None,
        description=(
            'Extended profile fields. Only honoured when registration_extended_fields is '
            'enabled for this sessionId; ignored entirely otherwise.'
        ),
    )

    model_config = {
        'populate_by_name': True,
        'json_schema_extra': {
            'example': {
                'email': constants['EXAMPLE_EMAIL'],
                'password': constants['EXAMPLE_PASS'],
                'sessionId': 'b7f1c2de-3a4b-4c5d-8e9f-0a1b2c3d4e5f',
                'extended': {
                    'companyName': 'Acme Ltd',
                    'jobRole': 'Platform Engineer',
                    'phone': '+61412345678',
                    'marketingOptIn': False,
                },
            },
        },
    }


class RegisterResponse(BaseModel):
    id: str = Field(..., description=constants['DESCRIPTION_MESSAGE'], examples=[constants['REGISTER_USER_ID_EXAMPLE']])


class TokenResponse(BaseModel):
    access_token: str = Field(..., description='JWT access token that must be sent in the Authorization header.')
    token_type: str = Field('Bearer', description='Authentication scheme for the access token.', examples=['Bearer'])
    expires_in: int = Field(900, description='Access token lifetime in seconds.', examples=[900])


# User / role management schemas
class UserResponse(BaseModel):
    id: str = Field(..., description=constants['DESCRIPTION_MESSAGE'], examples=[constants['REGISTER_USER_ID_EXAMPLE']])
    email: str = Field(..., description='Email address that identifies the user.', examples=[constants['EXAMPLE_EMAIL']])
    role: str = Field(..., description='Access role. One of: admin, user.', examples=['admin'])
    created_at: datetime = Field(..., description='UTC timestamp when the account was created.')
    is_locked: bool = Field(
        False,
        description=(
            'Whether the account currently has an active login lockout from too many recent '
            'failed password attempts. Lockout state is in-memory (per process) and not persisted; '
            'an admin can clear it via POST /api/admin/users/{id}/unlock.'
        ),
        examples=[False],
    )

    model_config = {'from_attributes': True}


class MeResponse(BaseModel):
    id: str = Field(..., description=constants['DESCRIPTION_MESSAGE'], examples=[constants['REGISTER_USER_ID_EXAMPLE']])
    email: str = Field(..., description='Email address of the authenticated user.', examples=[constants['EXAMPLE_EMAIL']])
    role: str = Field(..., description='Access role of the authenticated user. One of: admin, user.', examples=['admin'])

    model_config = {'from_attributes': True}


class UserCreate(BaseModel):
    email: str = Field(..., description='Email address for the new account.', examples=[constants['EXAMPLE_EMAIL']])
    password: str = Field(..., description='Initial password. Must meet complexity requirements.', examples=[constants['EXAMPLE_PASS']])
    role: str = Field('user', description='Access role to assign. One of: admin, user.', examples=['user'])

    model_config = {
        'json_schema_extra': {
            'example': {'email': constants['EXAMPLE_EMAIL'], 'password': constants['EXAMPLE_PASS'], 'role': 'user'},
        }
    }


class UserUpdate(BaseModel):
    role: Optional[str] = Field(None, description='New access role. One of: admin, user.', examples=['admin'])
    password: Optional[str] = Field(None, description='Replacement password. Must meet complexity requirements.', examples=[constants['EXAMPLE_PASS']])

    model_config = {
        'json_schema_extra': {
            'example': {'role': 'admin'},
        }
    }



# Tag schemas
class TagBase(BaseModel):
    name: str = Field(
        ...,
        description='Display name for the tag. Must be unique across all tags.',
        examples=['production'],
    )
    color: str = Field(
        '#3B82F6',
        description='Hex color string used to render the tag badge in the UI.',
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
    tag_ids: Optional[list[int]] = Field(
        None,
        description='Tag IDs to associate with the new version. Inherits from parent if omitted.',
    )
    agent_ids: Optional[list[int]] = Field(
        None,
        description='Agent IDs to associate with the new version. Inherits from parent if omitted.',
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


# Prompt test-execution schemas
class PromptTestParams(BaseModel):
    temperature: Optional[float] = Field(
        None,
        description='Sampling temperature. Omit to use the provider adapter\'s own default.',
        examples=[0.7],
    )
    max_tokens: Optional[int] = Field(
        None,
        description='Maximum tokens to generate. Omit to use the provider adapter\'s own default.',
        examples=[512],
    )
    top_p: Optional[float] = Field(
        None,
        description='Nucleus sampling parameter. Omit to use the provider adapter\'s own default.',
        examples=[1.0],
    )


class PromptTestRequest(BaseModel):
    provider_id: int = Field(..., description='ID of the configured LLM provider connection to run against.', examples=[1])
    model: Optional[str] = Field(
        None,
        description="Model identifier to use. Falls back to the provider's configured default_model if omitted.",
        examples=['deepseek-chat'],
    )
    variables: dict[str, Any] = Field(
        default_factory=dict,
        description='Key-value pairs to substitute into the prompt template. Required variables must be present.',
        examples=[{'user_name': 'Alice', 'platform': 'PromptHub'}],
    )
    params: Optional[PromptTestParams] = Field(
        None,
        description='Optional generation parameters. Omitted fields fall back to the provider adapter defaults.',
    )
    agent_id: Optional[int] = Field(
        None,
        description='ID of the agent to attribute this test run to. Omit for ad-hoc runs.',
        examples=[1],
    )

    model_config = {
        'json_schema_extra': {
            'example': {
                'provider_id': 1,
                'model': 'deepseek-chat',
                'variables': {'user_name': 'Alice', 'platform': 'PromptHub'},
                'params': {'temperature': 0.7},
            }
        }
    }


class PromptTestResponse(BaseModel):
    output: str = Field(..., description='The raw text response from the LLM.', examples=['Hello, Alice! Welcome to PromptHub.'])
    model: str = Field(..., description='Model identifier actually used for the completion.', examples=['deepseek-chat'])
    provider: str = Field(..., description='Name of the provider connection used.', examples=[constants['EXAMPLE_PROVIDER_NAME']])
    rendered_prompt: str = Field(..., description='The fully-rendered prompt text sent to the LLM.', examples=['Hello, Alice! Welcome to PromptHub.'])
    latency_ms: float = Field(..., description='Round-trip latency of the LLM call in milliseconds.', examples=[340.5])
    prompt_tokens: int = Field(0, description='Tokens consumed by the prompt.', examples=[42])
    completion_tokens: int = Field(0, description='Tokens consumed by the completion.', examples=[22])
    total_tokens: int = Field(0, description='Total tokens consumed (prompt + completion).', examples=[64])
    execution_id: int = Field(..., description='ID of the PromptExecution record created for this run.', examples=[1])


# Provider schemas
class ProviderCreate(BaseModel):
    name: str = Field(..., description='Human-readable name for this provider connection.', examples=[constants['EXAMPLE_PROVIDER_NAME']])
    provider_type: Literal['ollama', 'openai_compatible'] = Field(
        ...,
        description="Adapter type. One of: 'ollama', 'openai_compatible'.",
        examples=['openai_compatible'],
    )
    base_url: str = Field(..., description='Base URL of the provider API.', examples=[constants['EXAMPLE_PROVIDER_BASE_URL']])
    api_key: Optional[str] = Field(
        None,
        description='Plaintext API key. Encrypted at rest; never returned in responses.',
        examples=['your-provider-api-key'],
    )
    default_model: Optional[str] = Field(None, description='Default model identifier to use for this provider.', examples=['deepseek-chat'])
    cost_per_1k_input_tokens: Optional[float] = Field(None, description='Cost in USD per 1,000 input tokens, for cost tracking.', examples=[0.001])
    cost_per_1k_output_tokens: Optional[float] = Field(None, description='Cost in USD per 1,000 output tokens, for cost tracking.', examples=[0.002])

    model_config = {
        'json_schema_extra': {
            'example': {
                'name': constants['EXAMPLE_PROVIDER_NAME'],
                'provider_type': 'openai_compatible',
                'base_url': constants['EXAMPLE_PROVIDER_BASE_URL'],
                'api_key': 'your-provider-api-key',
                'default_model': 'deepseek-chat',
                'cost_per_1k_input_tokens': 0.001,
                'cost_per_1k_output_tokens': 0.002,
            }
        }
    }


class ProviderUpdate(BaseModel):
    name: Optional[str] = Field(None, description='Updated display name.', examples=[constants['EXAMPLE_PROVIDER_NAME']])
    provider_type: Optional[Literal['ollama', 'openai_compatible']] = Field(None, description="Updated adapter type. One of: 'ollama', 'openai_compatible'.", examples=['openai_compatible'])
    base_url: Optional[str] = Field(None, description='Updated base URL of the provider API.', examples=[constants['EXAMPLE_PROVIDER_BASE_URL']])
    api_key: Optional[str] = Field(
        None,
        description=(
            'Replacement plaintext API key. Omit or send an empty string to keep the '
            'currently stored key unchanged.'
        ),
        examples=['your-replacement-api-key'],
    )
    default_model: Optional[str] = Field(None, description='Updated default model identifier.', examples=['deepseek-chat'])
    enabled: Optional[bool] = Field(None, description='Whether this provider is available for use.', examples=[True])
    cost_per_1k_input_tokens: Optional[float] = Field(None, description='Updated cost in USD per 1,000 input tokens.', examples=[0.001])
    cost_per_1k_output_tokens: Optional[float] = Field(None, description='Updated cost in USD per 1,000 output tokens.', examples=[0.002])

    model_config = {
        'json_schema_extra': {
            'example': {'default_model': 'deepseek-reasoner', 'enabled': True},
        }
    }


class ProviderResponse(BaseModel):
    id: int = Field(..., description='Auto-assigned primary key.', examples=[1])
    name: str = Field(..., description='Human-readable name for this provider connection.', examples=[constants['EXAMPLE_PROVIDER_NAME']])
    provider_type: str = Field(..., description='Adapter type.', examples=['openai_compatible'])
    base_url: str = Field(..., description='Base URL of the provider API.', examples=[constants['EXAMPLE_PROVIDER_BASE_URL']])
    api_key_masked: Optional[str] = Field(
        None,
        description='Masked API key (first 3 and last 3 characters only), or null if no key is stored.',
        examples=['sk-***789'],
    )
    default_model: Optional[str] = Field(None, description='Default model identifier for this provider.', examples=['deepseek-chat'])
    enabled: bool = Field(True, description='Whether this provider is available for use.', examples=[True])
    cost_per_1k_input_tokens: Optional[float] = Field(None, description='Cost in USD per 1,000 input tokens.', examples=[0.001])
    cost_per_1k_output_tokens: Optional[float] = Field(None, description='Cost in USD per 1,000 output tokens.', examples=[0.002])
    created_at: datetime = Field(..., description='UTC timestamp when the provider was added.')
    updated_at: datetime = Field(..., description='UTC timestamp of the last update.')

    model_config = {'from_attributes': True}


class ProviderModelInfo(BaseModel):
    id: str = Field(..., description='Provider-specific model identifier.', examples=['deepseek-chat'])
    name: str = Field(..., description='Display name for the model.', examples=['deepseek-chat'])
    metadata: dict[str, Any] = Field(default_factory=dict, description='Additional provider-specific model metadata.')


class ProviderModelsResponse(BaseModel):
    models: list[ProviderModelInfo] = Field(default_factory=list, description='Models available from this provider.')


class ProviderTestResponse(BaseModel):
    ok: bool = Field(..., description='True if the provider responded healthily.', examples=[True])
    latency_ms: Optional[float] = Field(None, description='Round-trip latency of the health check in milliseconds.', examples=[124.3])
    detail: Optional[str] = Field(None, description='Additional detail, especially on failure.', examples=[None])


class ProviderPresetResponse(BaseModel):
    key: str = Field(..., description='Preset identifier to use as `provider_type`-agnostic hint.', examples=['deepseek'])
    name: str = Field(..., description='Display name of the preset provider.', examples=['DeepSeek'])
    base_url: str = Field(..., description='Base URL to prefill for this preset.', examples=[constants['EXAMPLE_PROVIDER_BASE_URL']])


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
