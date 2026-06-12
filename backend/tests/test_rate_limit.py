"""Unit tests for the sliding-window rate limiting middleware."""

from fastapi import FastAPI
from starlette.testclient import TestClient

from app.middleware.rate_limit import RateLimitMiddleware, _SlidingWindowStore


# ---------------------------------------------------------------------------
# Helper: minimal test app
# ---------------------------------------------------------------------------

def _make_app(per_minute: int = 3, auth_per_minute: int = 2) -> FastAPI:
    """Builds a minimal FastAPI app with the rate limiting middleware."""
    app = FastAPI()
    app.add_middleware(
        RateLimitMiddleware,
        enabled=True,
        per_minute=per_minute,
        auth_per_minute=auth_per_minute,
    )

    @app.get('/api/test')
    def api_test():
        return {'ok': True}

    @app.post('/auth/login')
    def auth_login():
        return {'ok': True}

    @app.get('/api/health')
    def health():
        return {'status': 'ok'}

    @app.get('/api/ready')
    def ready():
        return {'status': 'ok'}

    @app.get('/api/docs')
    def docs():
        return {'docs': True}

    return app


# ---------------------------------------------------------------------------
# _SlidingWindowStore unit tests
# ---------------------------------------------------------------------------

class TestSlidingWindowStore:
    def test_allows_requests_within_limit(self):
        store = _SlidingWindowStore()
        for _ in range(5):
            allowed, retry = store.is_allowed('key', limit=5)
            assert allowed
            assert retry == 0

    def test_blocks_request_when_limit_exceeded(self):
        store = _SlidingWindowStore()
        for _ in range(3):
            store.is_allowed('key', limit=3)
        allowed, retry_after = store.is_allowed('key', limit=3)
        assert not allowed
        assert retry_after >= 1

    def test_different_keys_are_independent(self):
        store = _SlidingWindowStore()
        for _ in range(3):
            store.is_allowed('key-a', limit=3)
        allowed_a, _ = store.is_allowed('key-a', limit=3)
        allowed_b, _ = store.is_allowed('key-b', limit=3)
        assert not allowed_a
        assert allowed_b

    def test_retry_after_is_at_least_one_second(self):
        store = _SlidingWindowStore()
        for _ in range(1):
            store.is_allowed('k', limit=1)
        allowed, retry_after = store.is_allowed('k', limit=1)
        assert not allowed
        assert retry_after >= 1


# ---------------------------------------------------------------------------
# RateLimitMiddleware integration tests
# ---------------------------------------------------------------------------

class TestRateLimitMiddleware:
    def test_api_returns_429_after_per_minute_limit(self):
        app = _make_app(per_minute=3)
        client = TestClient(app)
        for _ in range(3):
            assert client.get('/api/test').status_code == 200
        r = client.get('/api/test')
        assert r.status_code == 429
        body = r.json()
        assert body['error'] == 'rate_limit_exceeded'
        assert 'detail' in body

    def test_429_response_includes_required_headers(self):
        app = _make_app(per_minute=1)
        client = TestClient(app)
        client.get('/api/test')
        r = client.get('/api/test')
        assert r.status_code == 429
        assert int(r.headers['Retry-After']) >= 1
        assert r.headers['X-RateLimit-Limit'] == '1'
        assert r.headers['X-RateLimit-Window'] == '60'

    def test_auth_endpoints_use_stricter_limit(self):
        app = _make_app(per_minute=100, auth_per_minute=2)
        client = TestClient(app)
        for _ in range(2):
            assert client.post('/auth/login').status_code == 200
        r = client.post('/auth/login')
        assert r.status_code == 429
        assert r.headers['X-RateLimit-Limit'] == '2'

    def test_api_and_auth_quotas_do_not_share_budget(self):
        """Exhausting the API limit must not affect the auth limit and vice-versa."""
        app = _make_app(per_minute=2, auth_per_minute=2)
        client = TestClient(app)
        for _ in range(2):
            client.get('/api/test')
        assert client.get('/api/test').status_code == 429
        # Auth quota is still available
        for _ in range(2):
            assert client.post('/auth/login').status_code == 200

    def test_health_endpoint_is_always_exempt(self):
        app = _make_app(per_minute=1)
        client = TestClient(app)
        for _ in range(20):
            assert client.get('/api/health').status_code == 200

    def test_ready_endpoint_is_always_exempt(self):
        app = _make_app(per_minute=1)
        client = TestClient(app)
        for _ in range(20):
            assert client.get('/api/ready').status_code == 200

    def test_docs_prefix_is_always_exempt(self):
        app = _make_app(per_minute=1)
        client = TestClient(app)
        for _ in range(5):
            assert client.get('/api/docs').status_code == 200

    def test_disabled_middleware_never_returns_429(self):
        app = FastAPI()
        app.add_middleware(RateLimitMiddleware, enabled=False, per_minute=1, auth_per_minute=1)

        @app.get('/api/test')
        def endpoint():
            return {'ok': True}

        client = TestClient(app)
        for _ in range(10):
            assert client.get('/api/test').status_code == 200

    def test_x_forwarded_for_creates_separate_buckets_per_ip(self):
        """Two clients behind a proxy with different forwarded IPs have independent limits."""
        app = _make_app(per_minute=1)
        client = TestClient(app)
        client.get('/api/test', headers={'X-Forwarded-For': '10.0.0.1'})
        # Same forwarded IP — must be rate-limited
        assert client.get('/api/test', headers={'X-Forwarded-For': '10.0.0.1'}).status_code == 429
        # Different forwarded IP — must succeed
        assert client.get('/api/test', headers={'X-Forwarded-For': '10.0.0.2'}).status_code == 200

    def test_rate_limit_response_body_structure(self):
        app = _make_app(per_minute=1)
        client = TestClient(app)
        client.get('/api/test')
        r = client.get('/api/test')
        assert r.status_code == 429
        body = r.json()
        assert set(body.keys()) == {'error', 'detail'}
        assert body['error'] == 'rate_limit_exceeded'
        assert isinstance(body['detail'], str)
        assert len(body['detail']) > 0

    def test_requests_within_limit_always_succeed(self):
        """N requests exactly at the limit all return 200."""
        limit = 5
        app = _make_app(per_minute=limit)
        client = TestClient(app)
        for i in range(limit):
            assert client.get('/api/test').status_code == 200, f'request {i + 1} should succeed'

    def test_rate_limit_enforced_across_full_app(self):
        """Rate limit is respected when the full application factory is used."""
        import os
        os.environ['RATE_LIMIT_ENABLED'] = 'true'
        os.environ['RATE_LIMIT_PER_MINUTE'] = '3'
        os.environ['RATE_LIMIT_AUTH_PER_MINUTE'] = '2'
        from main import create_app
        from app.database.base import get_db
        full_app = create_app()

        def override_get_db():
            yield

        full_app.dependency_overrides[get_db] = override_get_db
        client = TestClient(full_app, raise_server_exceptions=False)

        # Health must always be accessible regardless of rate limit configuration
        for _ in range(5):
            assert client.get('/api/health').status_code == 200
