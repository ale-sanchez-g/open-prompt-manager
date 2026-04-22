"""
Tests that verify the OpenAPI schema produced by the application is rich
enough to be useful for front-end and integration engineers.

These tests check that:
- Every endpoint has a non-trivial summary and description.
- Every request body schema has at least one field with a description.
- Examples are present on request body schemas.
- Important response codes (404, 409, 422) are documented where expected.
"""


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_schema(client):
    resp = client.get('/api/openapi.json')
    assert resp.status_code == 200
    return resp.json()


def _all_operations(schema):
    """Yield (path, method, operation) tuples for every operation in the schema."""
    for path, path_item in schema.get('paths', {}).items():
        for method, operation in path_item.items():
            if method in ('get', 'post', 'put', 'delete', 'patch'):
                yield path, method, operation


# ── schema presence ───────────────────────────────────────────────────────────

def test_openapi_schema_accessible(client):
    resp = client.get('/api/openapi.json')
    assert resp.status_code == 200
    data = resp.json()
    assert 'paths' in data
    assert 'components' in data


def test_openapi_title_and_description(client):
    schema = _get_schema(client)
    info = schema['info']
    assert 'Open Prompt Manager' in info['title']
    assert len(info.get('description', '')) > 100, 'API description should be descriptive'


def test_openapi_contact_and_license(client):
    schema = _get_schema(client)
    info = schema['info']
    assert 'contact' in info, 'contact info should be present'
    assert 'license' in info, 'license info should be present'


def test_openapi_tags_defined(client):
    schema = _get_schema(client)
    tag_names = {t['name'] for t in schema.get('tags', [])}
    assert 'prompts' in tag_names
    assert 'tags' in tag_names
    assert 'agents' in tag_names
    assert 'health' in tag_names


# ── per-endpoint quality ──────────────────────────────────────────────────────

def test_all_operations_have_summary(client):
    schema = _get_schema(client)
    missing = []
    for path, method, op in _all_operations(schema):
        if not op.get('summary', '').strip():
            missing.append(f'{method.upper()} {path}')
    assert missing == [], f'Operations missing summary: {missing}'


def test_all_operations_have_description(client):
    schema = _get_schema(client)
    missing = []
    for path, method, op in _all_operations(schema):
        if len(op.get('description', '').strip()) < 20:
            missing.append(f'{method.upper()} {path}')
    assert missing == [], f'Operations with insufficient description: {missing}'


def test_all_operations_have_tag(client):
    schema = _get_schema(client)
    missing = []
    for path, method, op in _all_operations(schema):
        if not op.get('tags'):
            missing.append(f'{method.upper()} {path}')
    assert missing == [], f'Operations without a tag: {missing}'


# ── schema field descriptions ─────────────────────────────────────────────────

def _collect_schema_descriptions(schema_obj, components):
    """Recursively collect all field descriptions from a JSON schema object."""
    descriptions = []
    if 'properties' in schema_obj:
        for prop_name, prop in schema_obj['properties'].items():
            if 'description' in prop:
                descriptions.append(prop['description'])
            # Resolve $ref
            if '$ref' in prop:
                ref_name = prop['$ref'].split('/')[-1]
                ref_schema = components.get('schemas', {}).get(ref_name, {})
                descriptions.extend(_collect_schema_descriptions(ref_schema, components))
    if '$ref' in schema_obj:
        ref_name = schema_obj['$ref'].split('/')[-1]
        ref_schema = components.get('schemas', {}).get(ref_name, {})
        descriptions.extend(_collect_schema_descriptions(ref_schema, components))
    return descriptions


def test_prompt_schema_fields_have_descriptions(client):
    schema = _get_schema(client)
    components = schema.get('components', {})
    prompt_schema = components.get('schemas', {}).get('PromptCreate', {})
    assert prompt_schema, 'PromptCreate schema should exist in components'
    descs = _collect_schema_descriptions(prompt_schema, components)
    assert len(descs) >= 3, f'PromptCreate should have at least 3 field descriptions, got {len(descs)}'


def test_variable_schema_fields_have_descriptions(client):
    schema = _get_schema(client)
    components = schema.get('components', {})
    var_schema = components.get('schemas', {}).get('VariableSchema', {})
    assert var_schema, 'VariableSchema should exist in components'
    descs = _collect_schema_descriptions(var_schema, components)
    assert len(descs) >= 3, f'VariableSchema should have at least 3 field descriptions, got {len(descs)}'


def test_execution_schema_fields_have_descriptions(client):
    schema = _get_schema(client)
    components = schema.get('components', {})
    exec_schema = components.get('schemas', {}).get('ExecutionCreate', {})
    assert exec_schema, 'ExecutionCreate schema should exist in components'
    descs = _collect_schema_descriptions(exec_schema, components)
    assert len(descs) >= 5, f'ExecutionCreate should have at least 5 field descriptions, got {len(descs)}'


# ── examples ─────────────────────────────────────────────────────────────────

def _schema_has_example(schema_obj):
    """Return True if the schema object or any of its properties declare an example."""
    if 'example' in schema_obj:
        return True
    for prop in schema_obj.get('properties', {}).values():
        if 'examples' in prop or 'example' in prop:
            return True
    return False


def test_prompt_create_has_example(client):
    schema = _get_schema(client)
    components = schema.get('components', {})
    prompt_schema = components.get('schemas', {}).get('PromptCreate', {})
    assert _schema_has_example(prompt_schema), 'PromptCreate schema should include an example'


def test_execution_create_has_example(client):
    schema = _get_schema(client)
    components = schema.get('components', {})
    exec_schema = components.get('schemas', {}).get('ExecutionCreate', {})
    assert _schema_has_example(exec_schema), 'ExecutionCreate schema should include an example'


def test_tag_create_has_example(client):
    schema = _get_schema(client)
    components = schema.get('components', {})
    tag_schema = components.get('schemas', {}).get('TagCreate', {})
    assert _schema_has_example(tag_schema), 'TagCreate schema should include an example'


# ── documented error responses ────────────────────────────────────────────────

def test_get_prompt_documents_404(client):
    schema = _get_schema(client)
    operation = schema['paths']['/api/prompts/{prompt_id}']['get']
    assert '404' in operation.get('responses', {}), 'GET /api/prompts/{id} should document 404'


def test_create_tag_documents_409(client):
    schema = _get_schema(client)
    operation = schema['paths']['/api/tags/']['post']
    assert '409' in operation.get('responses', {}), 'POST /api/tags/ should document 409 conflict'


def test_render_prompt_documents_422(client):
    schema = _get_schema(client)
    operation = schema['paths']['/api/prompts/{prompt_id}/render']['post']
    assert '422' in operation.get('responses', {}), 'POST /api/prompts/{id}/render should document 422'


def test_create_agent_documents_409(client):
    schema = _get_schema(client)
    operation = schema['paths']['/api/agents/']['post']
    assert '409' in operation.get('responses', {}), 'POST /api/agents/ should document 409 conflict'


# ── health endpoint ───────────────────────────────────────────────────────────

def test_health_endpoint_documented(client):
    schema = _get_schema(client)
    assert '/api/health' in schema['paths'], '/api/health should be in the OpenAPI schema'
    operation = schema['paths']['/api/health']['get']
    assert operation.get('summary'), '/api/health should have a summary'


def test_ready_endpoint_documented(client):
    schema = _get_schema(client)
    assert '/api/ready' in schema['paths'], '/api/ready should be in the OpenAPI schema'
    operation = schema['paths']['/api/ready']['get']
    assert operation.get('summary'), '/api/ready should have a summary'
    assert '503' in operation.get('responses', {}), '/api/ready should document 503 readiness failures'
