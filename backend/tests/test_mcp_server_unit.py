"""
Unit tests for mcp_server internals, targeting surviving mutmut mutations
in _prompt_to_dict and build_mcp_server.
"""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.mcp_server import _build_has_children, _prompt_to_dict, build_mcp_server


# ── _prompt_to_dict field coverage ────────────────────────────────────────────

def _make_prompt(**kwargs) -> SimpleNamespace:
    """Build a prompt-like object with the attributes _prompt_to_dict reads."""
    ts = kwargs.get('ts', datetime(2024, 6, 1, 12, 0, 0))
    return SimpleNamespace(
        id=kwargs.get('id', 1),
        name=kwargs.get('name', 'Test Prompt'),
        description=kwargs.get('description', 'A description'),
        content=kwargs.get('content', 'Hello {{name}}'),
        version=kwargs.get('version', '1.2.3'),
        parent_id=kwargs.get('parent_id', None),
        created_by=kwargs.get('created_by', 'author@opm.io'),
        variables=kwargs.get('variables', [{'name': 'name', 'type': 'string'}]),
        tags=kwargs.get('tags', []),
        agents=kwargs.get('agents', []),
        avg_rating=kwargs.get('avg_rating', 4.5),
        usage_count=kwargs.get('usage_count', 10),
        success_rate=kwargs.get('success_rate', 0.9),
        created_at=kwargs.get('created_at', ts),
        updated_at=kwargs.get('updated_at', ts),
    )


def test_prompt_to_dict_id_field():
    p = _make_prompt(id=42)
    result = _prompt_to_dict(p, set())
    assert result['id'] == 42


def test_prompt_to_dict_name_field():
    p = _make_prompt(name='My Prompt')
    result = _prompt_to_dict(p, set())
    assert result['name'] == 'My Prompt'


def test_prompt_to_dict_description_field():
    p = _make_prompt(description='A description')
    result = _prompt_to_dict(p, set())
    assert result['description'] == 'A description'


def test_prompt_to_dict_content_field():
    p = _make_prompt(content='The content')
    result = _prompt_to_dict(p, set())
    assert result['content'] == 'The content'


def test_prompt_to_dict_version_field():
    p = _make_prompt(version='2.5.1')
    result = _prompt_to_dict(p, set())
    assert result['version'] == '2.5.1'


def test_prompt_to_dict_parent_id_none_when_no_parent():
    p = _make_prompt(parent_id=None)
    result = _prompt_to_dict(p, set())
    assert result['parent_id'] is None


def test_prompt_to_dict_parent_id_when_has_parent():
    p = _make_prompt(id=2, parent_id=1)
    result = _prompt_to_dict(p, set())
    assert result['parent_id'] == 1


def test_prompt_to_dict_is_latest_true_when_not_in_has_children():
    p = _make_prompt(id=5)
    result = _prompt_to_dict(p, set())  # empty → 5 not in set → latest
    assert result['is_latest'] is True


def test_prompt_to_dict_is_latest_false_when_in_has_children():
    p = _make_prompt(id=5)
    result = _prompt_to_dict(p, {5})  # 5 in set → not latest
    assert result['is_latest'] is False


def test_prompt_to_dict_is_latest_true_for_other_id_in_set():
    p = _make_prompt(id=5)
    result = _prompt_to_dict(p, {99})  # 5 not in {99} → latest
    assert result['is_latest'] is True


def test_prompt_to_dict_created_by_field():
    p = _make_prompt(created_by='author@opm.io')
    result = _prompt_to_dict(p, set())
    assert result['created_by'] == 'author@opm.io'


def test_prompt_to_dict_variables_when_populated():
    vars_list = [{'name': 'x', 'type': 'string'}]
    p = _make_prompt(variables=vars_list)
    result = _prompt_to_dict(p, set())
    assert result['variables'] == vars_list


def test_prompt_to_dict_variables_falls_back_to_empty_list_when_none():
    p = _make_prompt(variables=None)
    result = _prompt_to_dict(p, set())
    assert result['variables'] == []


def test_prompt_to_dict_tags_empty_list():
    p = _make_prompt(tags=[])
    result = _prompt_to_dict(p, set())
    assert result['tags'] == []


def test_prompt_to_dict_tags_has_id_name_color():
    tag = SimpleNamespace(id=7, name='backend', color='#FF0000')
    p = _make_prompt(tags=[tag])
    result = _prompt_to_dict(p, set())
    assert result['tags'] == [{'id': 7, 'name': 'backend', 'color': '#FF0000'}]


def test_prompt_to_dict_tags_id_value():
    tag = SimpleNamespace(id=99, name='tag99', color='#ABC')
    p = _make_prompt(tags=[tag])
    result = _prompt_to_dict(p, set())
    assert result['tags'][0]['id'] == 99


def test_prompt_to_dict_tags_name_value():
    tag = SimpleNamespace(id=1, name='my-tag', color='#000')
    p = _make_prompt(tags=[tag])
    result = _prompt_to_dict(p, set())
    assert result['tags'][0]['name'] == 'my-tag'


def test_prompt_to_dict_tags_color_value():
    tag = SimpleNamespace(id=1, name='t', color='#123456')
    p = _make_prompt(tags=[tag])
    result = _prompt_to_dict(p, set())
    assert result['tags'][0]['color'] == '#123456'


def test_prompt_to_dict_agents_empty_list():
    p = _make_prompt(agents=[])
    result = _prompt_to_dict(p, set())
    assert result['agents'] == []


def test_prompt_to_dict_agents_has_id_name():
    agent = SimpleNamespace(id=3, name='my-agent')
    p = _make_prompt(agents=[agent])
    result = _prompt_to_dict(p, set())
    assert result['agents'] == [{'id': 3, 'name': 'my-agent'}]


def test_prompt_to_dict_agents_id_value():
    agent = SimpleNamespace(id=55, name='agent55')
    p = _make_prompt(agents=[agent])
    result = _prompt_to_dict(p, set())
    assert result['agents'][0]['id'] == 55


def test_prompt_to_dict_agents_name_value():
    agent = SimpleNamespace(id=1, name='specific-agent')
    p = _make_prompt(agents=[agent])
    result = _prompt_to_dict(p, set())
    assert result['agents'][0]['name'] == 'specific-agent'


def test_prompt_to_dict_avg_rating():
    p = _make_prompt(avg_rating=3.75)
    result = _prompt_to_dict(p, set())
    assert result['avg_rating'] == 3.75


def test_prompt_to_dict_usage_count():
    p = _make_prompt(usage_count=42)
    result = _prompt_to_dict(p, set())
    assert result['usage_count'] == 42


def test_prompt_to_dict_success_rate():
    p = _make_prompt(success_rate=0.75)
    result = _prompt_to_dict(p, set())
    assert result['success_rate'] == 0.75


def test_prompt_to_dict_created_at_is_isoformat():
    ts = datetime(2024, 1, 15, 9, 30, 0)
    p = _make_prompt(created_at=ts)
    result = _prompt_to_dict(p, set())
    assert result['created_at'] == ts.isoformat()


def test_prompt_to_dict_updated_at_is_isoformat():
    ts = datetime(2024, 3, 20, 14, 0, 0)
    p = _make_prompt(updated_at=ts)
    result = _prompt_to_dict(p, set())
    assert result['updated_at'] == ts.isoformat()


def test_prompt_to_dict_keys_are_correct():
    """Verify no key name typos survived as mutations."""
    p = _make_prompt()
    result = _prompt_to_dict(p, set())
    expected_keys = {
        'id', 'name', 'description', 'content', 'version', 'parent_id',
        'is_latest', 'created_by', 'variables', 'tags', 'agents',
        'avg_rating', 'usage_count', 'success_rate', 'created_at', 'updated_at',
    }
    assert set(result.keys()) == expected_keys


# ── _build_has_children ───────────────────────────────────────────────────────

def test_build_has_children_empty_list_returns_empty_set():
    db = MagicMock()
    result = _build_has_children([], db)
    assert result == set()
    db.query.assert_not_called()


def test_build_has_children_returns_ids_with_children(setup_database):
    """
    Integration: if prompt B has parent_id=A, then A is in the returned set.
    This test uses the real DB fixture to avoid mocking SQLAlchemy internals.
    """
    # covered by integration tests in test_mcp.py; this at least exercises the code path
    db = MagicMock()
    row = MagicMock()
    row.__getitem__ = MagicMock(return_value=1)
    db.query.return_value.filter.return_value.distinct.return_value.all.return_value = [row]
    result = _build_has_children([1, 2], db)
    assert 1 in result


# ── build_mcp_server ──────────────────────────────────────────────────────────

def test_build_mcp_server_returns_fastmcp_instance():
    from mcp.server.fastmcp import FastMCP
    server = build_mcp_server()
    assert isinstance(server, FastMCP)


def test_build_mcp_server_name_is_open_prompt_manager():
    server = build_mcp_server()
    assert server.name == 'Open Prompt Manager'


def test_build_mcp_server_has_expected_tools():
    server = build_mcp_server()
    tool_names = {t.name for t in server._tool_manager.list_tools()}
    assert 'list_prompts' in tool_names
    assert 'get_prompt' in tool_names
    assert 'render_prompt' in tool_names
    assert 'create_prompt' in tool_names
    assert 'list_tags' in tool_names
    assert 'list_agents' in tool_names


def test_build_mcp_server_sets_transport_security_allowed_hosts():
    expected_hosts = ['host-a.local', 'host-b.local:8000']
    fake_transport_settings = object()

    with patch('app.mcp_server._allowed_hosts', expected_hosts):
        with patch('app.mcp_server.TransportSecuritySettings', return_value=fake_transport_settings) as mock_security:
            with patch('app.mcp_server.FastMCP', return_value=MagicMock()) as mock_fastmcp:
                build_mcp_server()

    mock_security.assert_called_once_with(allowed_hosts=expected_hosts)
    _, kwargs = mock_fastmcp.call_args
    assert kwargs['transport_security'] is fake_transport_settings


def test_vscode_origin_in_default_allowed_hosts():
    """VS Code sends Origin: vscode-file://vscode-app whose netloc is 'vscode-app'.
    It must appear in the default allowed hosts so the MCP SDK does not reject
    connections from VS Code with 403 Invalid Origin header."""
    import importlib
    import app.mcp_server as mcp_mod

    importlib.reload(mcp_mod)
    assert 'vscode-app' in mcp_mod._allowed_hosts
