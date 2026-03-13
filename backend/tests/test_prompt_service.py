"""Unit tests for the prompt rendering service."""
import pytest
from unittest.mock import MagicMock

from app.services.prompt_service import render_prompt, _increment_version
from app.models.prompt import Prompt


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
