import re
from typing import Any
from sqlalchemy.orm import Session

from app.models.prompt import Prompt, PromptExecution


def _increment_version(version: str) -> str:
    """Increment the patch version number."""
    parts = version.split('.')
    if len(parts) == 3:
        try:
            parts[2] = str(int(parts[2]) + 1)
            return '.'.join(parts)
        except ValueError:
            pass
    return version + '.1'


def render_prompt(
    prompt: Prompt,
    variables: dict[str, Any],
    db: Session,
    _visited: set[int] | None = None,
) -> tuple[str, list[str], list[int]]:
    """
    Render a prompt by resolving components and substituting variables.

    Returns:
        (rendered_content, variables_used, components_resolved)
    """
    if _visited is None:
        _visited = set()

    if prompt.id in _visited:
        raise ValueError(f"Circular component reference detected for prompt id={prompt.id}")
    _visited.add(prompt.id)

    content = prompt.content
    components_resolved: list[int] = []

    # Resolve {{component:id}} references first (recursive)
    component_pattern = r'\{\{component:(\d+)\}\}'
    for component_id_str in re.findall(component_pattern, content):
        component_id = int(component_id_str)
        component_prompt = db.get(Prompt, component_id)
        if component_prompt is None:
            raise ValueError(f"Component prompt id={component_id} not found")
        component_content, _, nested_components = render_prompt(
            component_prompt, variables, db, _visited=_visited
        )
        content = content.replace(f'{{{{component:{component_id_str}}}}}', component_content)
        components_resolved.append(component_id)
        components_resolved.extend(nested_components)

    # Validate required variables
    prompt_variables = prompt.variables or []
    for var_schema in prompt_variables:
        var_name = var_schema.get('name') if isinstance(var_schema, dict) else var_schema.name
        required = var_schema.get('required', False) if isinstance(var_schema, dict) else var_schema.required
        default = var_schema.get('default') if isinstance(var_schema, dict) else var_schema.default
        if required and var_name not in variables and default is None:
            raise ValueError(f"Required variable '{var_name}' is missing")

    # Substitute {{variable_name}} placeholders
    var_pattern = r'\{\{(\w+)\}\}'
    variables_used: list[str] = []

    # Build effective variable map (variables override defaults)
    effective_vars: dict[str, Any] = {}
    for var_schema in prompt_variables:
        var_name = var_schema.get('name') if isinstance(var_schema, dict) else var_schema.name
        default = var_schema.get('default') if isinstance(var_schema, dict) else var_schema.default
        if default is not None:
            effective_vars[var_name] = default
    effective_vars.update(variables)

    for var_name in re.findall(var_pattern, content):
        if var_name in effective_vars:
            content = content.replace(f'{{{{{var_name}}}}}', str(effective_vars[var_name]))
            if var_name not in variables_used:
                variables_used.append(var_name)

    return content, variables_used, components_resolved


def update_prompt_stats(prompt_id: int, db: Session) -> None:
    """Recalculate and update aggregate stats for a prompt from its executions."""
    prompt = db.get(Prompt, prompt_id)
    if prompt is None:
        return

    executions = db.query(PromptExecution).filter(
        PromptExecution.prompt_id == prompt_id
    ).all()

    if not executions:
        return

    prompt.usage_count = len(executions)

    rated = [e.rating for e in executions if e.rating is not None]
    prompt.avg_rating = sum(rated) / len(rated) if rated else 0.0

    successes = sum(1 for e in executions if e.success == 1)
    prompt.success_rate = successes / len(executions)

    db.commit()
