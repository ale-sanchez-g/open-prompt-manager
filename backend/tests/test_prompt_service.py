"""Unit tests for the prompt rendering service."""
import pytest
from unittest.mock import MagicMock

from app.services.prompt_service import render_prompt, update_prompt_stats, _increment_version
from app.models.prompt import Prompt, PromptExecution


def make_prompt(id, content, variables=None):
    p = Prompt()
    p.id = id
    p.content = content
    p.variables = variables or []
    return p


# ── _increment_version ────────────────────────────────────────────────────────

def test_increment_patch():
    assert _increment_version("1.0.0") == "1.0.1"
    assert _increment_version("2.3.9") == "2.3.10"
    assert _increment_version("0.0.0") == "0.0.1"


def test_increment_non_semver():
    result = _increment_version("v1")
    assert result == "v1.1"


# ── render_prompt ─────────────────────────────────────────────────────────────

def test_variable_substitution():
    prompt = make_prompt(1, "Hello, {{name}}!")
    db = MagicMock()
    content, vars_used, components = render_prompt(prompt, {"name": "World"}, db)
    assert content == "Hello, World!"
    assert "name" in vars_used
    assert components == []


def test_multiple_variables():
    prompt = make_prompt(1, "{{greeting}}, {{name}}! You have {{count}} messages.")
    db = MagicMock()
    content, vars_used, _ = render_prompt(
        prompt, {"greeting": "Hi", "name": "Alice", "count": "3"}, db
    )
    assert content == "Hi, Alice! You have 3 messages."
    assert set(vars_used) == {"greeting", "name", "count"}


def test_missing_optional_variable_kept_as_placeholder():
    prompt = make_prompt(1, "Hello, {{name}}! Platform: {{platform}}.")
    db = MagicMock()
    content, vars_used, _ = render_prompt(prompt, {"name": "Bob"}, db)
    # {{platform}} is not in variables schema so no default — stays unreplaced
    assert "Bob" in content
    assert "{{platform}}" in content


def test_default_value_used_when_variable_not_provided():
    prompt = make_prompt(1, "Hello, {{name}}!", variables=[
        {"name": "name", "type": "string", "required": False, "default": "Guest"}
    ])
    db = MagicMock()
    content, _, _ = render_prompt(prompt, {}, db)
    assert content == "Hello, Guest!"


def test_provided_value_overrides_default():
    prompt = make_prompt(1, "Hello, {{name}}!", variables=[
        {"name": "name", "type": "string", "required": False, "default": "Guest"}
    ])
    db = MagicMock()
    content, _, _ = render_prompt(prompt, {"name": "Alice"}, db)
    assert content == "Hello, Alice!"


def test_required_variable_missing_raises():
    prompt = make_prompt(1, "Hello, {{name}}!", variables=[
        {"name": "name", "type": "string", "required": True}
    ])
    db = MagicMock()
    with pytest.raises(ValueError, match="Required variable 'name' is missing"):
        render_prompt(prompt, {}, db)


def test_component_resolution():
    component = make_prompt(2, "I am a component.")
    parent = make_prompt(1, "Start. {{component:2}} End.")

    db = MagicMock()
    db.get.return_value = component

    content, _, components = render_prompt(parent, {}, db)
    assert content == "Start. I am a component. End."
    assert 2 in components


def test_component_not_found_raises():
    parent = make_prompt(1, "{{component:99}}")
    db = MagicMock()
    db.get.return_value = None

    with pytest.raises(ValueError, match="Component prompt id=99 not found"):
        render_prompt(parent, {}, db)


def test_circular_component_raises():
    prompt = make_prompt(1, "{{component:1}}")
    db = MagicMock()
    db.get.return_value = prompt

    with pytest.raises(ValueError, match="Circular component reference"):
        render_prompt(prompt, {}, db)


def test_no_placeholders():
    prompt = make_prompt(1, "Static text with no placeholders.")
    db = MagicMock()
    content, vars_used, components = render_prompt(prompt, {}, db)
    assert content == "Static text with no placeholders."
    assert vars_used == []
    assert components == []


# ── render_prompt: variable deduplication ─────────────────────────────────────

def test_variable_used_multiple_times_appears_once_in_vars_used():
    """A variable referenced twice in the template should appear only once in variables_used."""
    prompt = make_prompt(1, "{{name}} says hello to {{name}}.")
    db = MagicMock()
    content, vars_used, _ = render_prompt(prompt, {"name": "Alice"}, db)
    assert content == "Alice says hello to Alice."
    assert vars_used.count("name") == 1


def test_variables_used_only_contains_actually_substituted_vars():
    """variables_used should not include vars that were not found in the template."""
    prompt = make_prompt(1, "Hello, {{name}}!")
    db = MagicMock()
    _, vars_used, _ = render_prompt(prompt, {"name": "Alice", "extra": "ignored"}, db)
    assert "name" in vars_used
    assert "extra" not in vars_used


# ── render_prompt: effective_vars override (kills mutations on effective_vars.update) ──

def test_provided_variable_overrides_default_in_effective_vars():
    """effective_vars.update(variables) must override defaults; mutation removing the update breaks this."""
    prompt = make_prompt(1, "Role: {{role}}.", variables=[
        {"name": "role", "type": "string", "required": False, "default": "user"}
    ])
    db = MagicMock()
    content, vars_used, _ = render_prompt(prompt, {"role": "admin"}, db)
    assert content == "Role: admin."
    assert "role" in vars_used


def test_default_is_used_when_no_var_provided():
    """When no variable is provided, the schema default must substitute (kills removal of effective_vars build)."""
    prompt = make_prompt(1, "Tone: {{tone}}.", variables=[
        {"name": "tone", "type": "string", "required": False, "default": "formal"}
    ])
    db = MagicMock()
    content, vars_used, _ = render_prompt(prompt, {}, db)
    assert content == "Tone: formal."
    assert "tone" in vars_used


def test_variable_with_null_default_not_required_left_unreplaced():
    """A var with default=None and required=False must not raise and must leave placeholder."""
    prompt = make_prompt(1, "Value: {{x}}.", variables=[
        {"name": "x", "type": "string", "required": False, "default": None}
    ])
    db = MagicMock()
    content, vars_used, _ = render_prompt(prompt, {}, db)
    assert "{{x}}" in content
    assert "x" not in vars_used


# ── render_prompt: nested component resolution ────────────────────────────────

def test_nested_components_resolved_list_includes_all_levels():
    """Nested component IDs must be collected via components_resolved.extend(nested_components)."""
    grandchild = make_prompt(3, "grandchild")
    child = make_prompt(2, "child {{component:3}}")
    parent = make_prompt(1, "{{component:2}}")

    call_map = {2: child, 3: grandchild}
    db = MagicMock()
    db.get.side_effect = lambda model, id_: call_map.get(id_)

    content, _, components = render_prompt(parent, {}, db)
    assert "grandchild" in content
    assert 2 in components
    assert 3 in components


def test_component_id_appended_before_nested_extend():
    """Direct component ID must appear in components_resolved (kills mutations removing append)."""
    component = make_prompt(7, "hello")
    parent = make_prompt(1, "{{component:7}}")

    db = MagicMock()
    db.get.return_value = component

    _, _, components = render_prompt(parent, {}, db)
    assert components == [7]


# ── render_prompt: _visited set prevents re-entry (kills mutations on _visited.add) ──

def test_visited_set_prevents_self_reference_at_second_nesting():
    """Repeatedly resolving the same component ID in one render path raises circular reference."""
    prompt = make_prompt(1, "{{component:2}} and {{component:2}}")
    component = make_prompt(2, "ok")

    db = MagicMock()
    db.get.return_value = component

    with pytest.raises(ValueError, match='Circular component reference'):
        render_prompt(prompt, {}, db)


# ── update_prompt_stats: direct unit tests ────────────────────────────────────

def _make_execution(success, rating=None):
    e = MagicMock(spec=PromptExecution)
    e.success = success
    e.rating = rating
    return e


def test_update_prompt_stats_all_successful():
    """success_rate=1.0 when all executions have success==1."""
    prompt = MagicMock(spec=Prompt)
    db = MagicMock()
    db.get.return_value = prompt
    db.query.return_value.filter.return_value.all.return_value = [
        _make_execution(1), _make_execution(1), _make_execution(1)
    ]
    update_prompt_stats(1, db)
    assert prompt.usage_count == 3
    assert abs(prompt.success_rate - 1.0) < 0.001
    db.commit.assert_called_once()


def test_update_prompt_stats_no_successes():
    """success_rate=0.0 when all executions have success==0."""
    prompt = MagicMock(spec=Prompt)
    db = MagicMock()
    db.get.return_value = prompt
    db.query.return_value.filter.return_value.all.return_value = [
        _make_execution(0), _make_execution(0)
    ]
    update_prompt_stats(1, db)
    assert abs(prompt.success_rate - 0.0) < 0.001


def test_update_prompt_stats_mixed_success_rate():
    """success_rate=0.5 when half succeed (kills mutation changing e.success==1 to e.success==0)."""
    prompt = MagicMock(spec=Prompt)
    db = MagicMock()
    db.get.return_value = prompt
    db.query.return_value.filter.return_value.all.return_value = [
        _make_execution(1, rating=4.0),
        _make_execution(0, rating=2.0),
    ]
    update_prompt_stats(1, db)
    assert abs(prompt.success_rate - 0.5) < 0.001
    assert abs(prompt.avg_rating - 3.0) < 0.001


def test_update_prompt_stats_avg_rating_ignores_none_ratings():
    """avg_rating must only average executions where rating is not None."""
    prompt = MagicMock(spec=Prompt)
    db = MagicMock()
    db.get.return_value = prompt
    db.query.return_value.filter.return_value.all.return_value = [
        _make_execution(1, rating=5.0),
        _make_execution(1, rating=None),   # must be excluded from average
        _make_execution(0, rating=1.0),
    ]
    update_prompt_stats(1, db)
    # avg of 5.0 and 1.0 = 3.0  (not 5.0+0+1.0 / 3)
    assert abs(prompt.avg_rating - 3.0) < 0.001
    assert abs(prompt.success_rate - (2 / 3)) < 0.001


def test_update_prompt_stats_no_rated_executions_defaults_to_zero():
    """avg_rating falls back to 0.0 when no execution has a rating."""
    prompt = MagicMock(spec=Prompt)
    db = MagicMock()
    db.get.return_value = prompt
    db.query.return_value.filter.return_value.all.return_value = [
        _make_execution(1, rating=None), _make_execution(0, rating=None)
    ]
    update_prompt_stats(1, db)
    assert prompt.avg_rating == 0.0


def test_update_prompt_stats_usage_count_equals_len_executions():
    """usage_count must equal total executions, not just successes."""
    prompt = MagicMock(spec=Prompt)
    db = MagicMock()
    db.get.return_value = prompt
    execs = [_make_execution(1), _make_execution(0), _make_execution(0), _make_execution(1)]
    db.query.return_value.filter.return_value.all.return_value = execs
    update_prompt_stats(1, db)
    assert prompt.usage_count == 4


def test_update_prompt_stats_prompt_not_found_is_noop():
    """Returns immediately without touching DB when prompt doesn't exist."""
    db = MagicMock()
    db.get.return_value = None
    update_prompt_stats(999, db)
    db.commit.assert_not_called()


def test_update_prompt_stats_no_executions_is_noop():
    """Returns immediately without touching DB when there are no executions."""
    prompt = MagicMock(spec=Prompt)
    db = MagicMock()
    db.get.return_value = prompt
    db.query.return_value.filter.return_value.all.return_value = []
    update_prompt_stats(1, db)
    db.commit.assert_not_called()
