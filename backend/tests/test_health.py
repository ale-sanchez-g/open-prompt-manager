import main


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_ready(client):
    response = client.get('/api/ready')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'


def test_ready_returns_503_when_db_unavailable(client, monkeypatch):
    class BrokenSession:
        def execute(self, *_args, **_kwargs):
            raise RuntimeError('db connection failed')

        def close(self):
            pass

    monkeypatch.setattr(main.db_module, 'SessionLocal', lambda: BrokenSession())

    response = client.get('/api/ready')
    assert response.status_code == 503
    assert response.json() == {'detail': 'Database not ready'}
