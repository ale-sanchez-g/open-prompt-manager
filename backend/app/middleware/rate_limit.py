import threading
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_EXEMPT_PATHS = frozenset({'/api/health', '/api/ready', '/api/openapi.json'})
_DOCS_PREFIXES = ('/api/docs', '/api/redoc')
_AUTH_PREFIX = '/auth/'


class _SlidingWindowStore:
    """Thread-safe in-memory sliding-window rate limit store."""

    def __init__(self) -> None:
        self._store: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def is_allowed(self, key: str, limit: int, window_seconds: int = 60) -> tuple[bool, int]:
        """
        Check whether a keyed request is within the rate limit.

        Returns (allowed, retry_after_seconds).  retry_after is 0 when allowed.
        """
        now = time.monotonic()
        window_start = now - window_seconds

        with self._lock:
            q = self._store[key]
            while q and q[0] < window_start:
                q.popleft()
            if len(q) >= limit:
                retry_after = max(int(q[0] + window_seconds - now) + 1, 1)
                return False, retry_after
            q.append(now)
            return True, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window IP-based rate limiting middleware.

    Buckets:
      - Auth paths  (/auth/*):   auth_per_minute requests / minute / IP
      - All other API paths:     per_minute requests / minute / IP
      - Health, readiness, and API-docs paths are always exempt.

    X-Forwarded-For is respected for deployments behind nginx or AWS ALB so
    that the original client address is used, not the proxy address.

    Returns HTTP 429 with Retry-After and X-RateLimit-* response headers when
    the limit is exceeded.

    Configuration via environment variables (read in create_app and forwarded as
    constructor kwargs):
      RATE_LIMIT_ENABLED          true | false  (default: true)
      RATE_LIMIT_PER_MINUTE       integer       (default: 200)
      RATE_LIMIT_AUTH_PER_MINUTE  integer       (default: 60)

    Note: the store is in-process memory only.  A multi-replica deployment
    requires an external store (e.g. Redis) for shared rate-limit state.
    See docs/adr-rate-limiting.md for the architecture decision rationale.
    """

    def __init__(
        self,
        app,
        *,
        enabled: bool = True,
        per_minute: int = 200,
        auth_per_minute: int = 60,
    ) -> None:
        super().__init__(app)
        self._enabled = enabled
        self._per_minute = per_minute
        self._auth_per_minute = auth_per_minute
        self._store = _SlidingWindowStore()

    async def dispatch(self, request: Request, call_next):
        if not self._enabled:
            return await call_next(request)

        path = request.url.path

        if path in _EXEMPT_PATHS or any(path.startswith(p) for p in _DOCS_PREFIXES):
            return await call_next(request)

        is_auth = path.startswith(_AUTH_PREFIX)
        limit = self._auth_per_minute if is_auth else self._per_minute

        forwarded_for = request.headers.get('X-Forwarded-For')
        ip = (
            forwarded_for.split(',')[0].strip()
            if forwarded_for
            else (request.client.host if request.client else 'unknown')
        )

        key = f"{ip}:{'auth' if is_auth else 'api'}"
        allowed, retry_after = self._store.is_allowed(key, limit)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    'error': 'rate_limit_exceeded',
                    'detail': 'Too many requests. Please slow down and try again.',
                },
                headers={
                    'Retry-After': str(retry_after),
                    'X-RateLimit-Limit': str(limit),
                    'X-RateLimit-Window': '60',
                },
            )

        return await call_next(request)
