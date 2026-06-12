import app.database.base as db_module


def test_health(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'
    assert 'version' in data

    cfg = data['config']
    assert isinstance(cfg['rate_limit_enabled'], bool)
    assert isinstance(cfg['rate_limit_per_minute'], int)
    assert isinstance(cfg['rate_limit_auth_per_minute'], int)
    assert isinstance(cfg['cors_origins'], list)
    assert all(isinstance(o, str) for o in cfg['cors_origins'])


def test_health_config_reflects_env_vars(monkeypatch):
    """Health endpoint exposes the rate-limit env vars that are active at startup."""
    monkeypatch.setenv('RATE_LIMIT_ENABLED', 'false')
    monkeypatch.setenv('RATE_LIMIT_PER_MINUTE', '42')
    monkeypatch.setenv('RATE_LIMIT_AUTH_PER_MINUTE', '7')
    monkeypatch.setenv('CORS_ORIGINS', 'http://example.com,http://app.example.com')

    from main import create_app
    from app.database.base import get_db
    from fastapi.testclient import TestClient

    test_app = create_app()
    test_app.dependency_overrides[get_db] = lambda: None

    with TestClient(test_app) as c:
        data = c.get('/api/health').json()

    cfg = data['config']
    assert cfg['rate_limit_enabled'] is False
    assert cfg['rate_limit_per_minute'] == 42
    assert cfg['rate_limit_auth_per_minute'] == 7
    assert cfg['cors_origins'] == ['http://example.com', 'http://app.example.com']


def test_ready(client):
    response = client.get('/api/ready')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'


def test_ready_returns_503_when_db_unavailable(client, monkeypatch):
    class BrokenSession:
        def __enter__(self):
            return self

        def __exit__(self, _exc_type, _exc, _tb):
            return False

        def execute(self, *_args, **_kwargs):
            raise RuntimeError('db connection failed')

    monkeypatch.setattr(db_module, 'SessionLocal', lambda: BrokenSession())

    response = client.get('/api/ready')
    assert response.status_code == 503
    assert response.json() == {'detail': 'Database not ready'}


def test_health_allows_vscode_origin(anon_client):
    response = anon_client.get('/api/health', headers={'Origin': 'vscode-file://vscode-app'})

    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == 'vscode-file://vscode-app'
