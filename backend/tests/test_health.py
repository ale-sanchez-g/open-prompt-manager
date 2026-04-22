import app.database.base as db_module


def test_health(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'
    assert 'version' in data


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
