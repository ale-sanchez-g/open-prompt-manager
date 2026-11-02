import ipaddress
import logging
import threading
import time
import uuid
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.audit import EVENT_RATE_LIMIT_EXCEEDED, audit_event

_EXEMPT_PATHS = frozenset({'/api/health', '/api/ready', '/api/openapi.json'})
_DOCS_PREFIXES = ('/api/docs', '/api/redoc')
_AUTH_PREFIX = '/auth/'


class _SlidingWindowStore:
    """Thread-safe in-memory sliding-window rate limit store."""

    def __init__(self) -> None:
        self._store: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def is_allowed(self, key: str, limit: int, window_seconds: int = 60) -> tuple[bool, int]:
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

    async def check(self, key: str, limit: int, window_seconds: int = 60) -> tuple[bool, int]:
        return self.is_allowed(key, limit, window_seconds)


_REDIS_SLIDE_SCRIPT = """
local key, now_ms, window_ms, limit, member = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now_ms - window_ms)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_ms = math.max(1, oldest[2] + window_ms - now_ms)
  return {0, math.max(1, math.ceil(retry_ms / 1000))}
end
redis.call('ZADD', key, now_ms, member)
redis.call('PEXPIRE', key, window_ms)
return {1, 0}
"""


class _RedisSlidingWindowStore:
    """Atomic Redis sorted-set sliding window."""

    def __init__(self, url: str, required: bool = False, failure_policy: str = 'fail_open') -> None:
        try:
            from redis import asyncio as redis_async
        except ImportError as exc:
            raise RuntimeError('redis package is required when RATE_LIMIT_BACKEND=redis') from exc
        if required and not url:
            raise RuntimeError('RATE_LIMIT_REDIS_URL is required when Redis rate limiting is required')
        self._redis = redis_async.from_url(url, decode_responses=True) if url else None
        self._required = required
        self._failure_policy = failure_policy
        self._fallback = _SlidingWindowStore()
        self._logger = logging.getLogger(__name__)

    async def check(self, key: str, limit: int, window_seconds: int = 60) -> tuple[bool, int]:
        if self._redis is None:
            if self._required or self._failure_policy == 'fail_closed':
                return False, 1
            return await self._fallback.check(key, limit, window_seconds)
        try:
            now_ms = int(time.time() * 1000)
            result = await self._redis.eval(
                _REDIS_SLIDE_SCRIPT, 1, key, now_ms, window_seconds * 1000, limit,
                f'{now_ms}:{uuid.uuid4().hex}',
            )
            return bool(result[0]), int(result[1])
        except Exception as exc:
            self._logger.exception('Redis rate-limit store unavailable')
            if self._required or self._failure_policy == 'fail_closed':
                return False, 1
            return await self._fallback.check(key, limit, window_seconds)


def extract_client_ip(request: Request, trusted_proxy_count: int = 0) -> str:
    """Return the client IP, trusting only the requested number of proxy hops."""
    direct_ip = request.client.host if request.client else 'unknown'
    if trusted_proxy_count <= 0:
        return direct_ip

    forwarded = request.headers.get('X-Forwarded-For', '')
    hops = [hop.strip() for hop in forwarded.split(',') if hop.strip()]
    if len(hops) <= trusted_proxy_count:
        client_index = 0
    else:
        client_index = len(hops) - trusted_proxy_count - 1
    candidate = hops[client_index] if 0 <= client_index < len(hops) else None
    if candidate:
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            pass
    return direct_ip


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self, app, *, enabled: bool = True, per_minute: int = 200,
        auth_per_minute: int = 60, trusted_proxy_count: int = 0,
        backend: str = 'memory', redis_url: str | None = None,
        redis_required: bool = False, redis_failure_policy: str = 'fail_open', store=None,
    ) -> None:
        super().__init__(app)
        self._enabled = enabled
        self._per_minute = per_minute
        self._auth_per_minute = auth_per_minute
        self._trusted_proxy_count = max(0, trusted_proxy_count)
        if backend.lower() not in ('memory', 'redis'):
            raise ValueError('backend must be memory or redis')
        if store is not None:
            self._store = store
        elif backend.lower() == 'redis':
            if not redis_url:
                raise RuntimeError('RATE_LIMIT_REDIS_URL is required when RATE_LIMIT_BACKEND=redis')
            policy = redis_failure_policy.lower()
            if policy not in ('fail_open', 'fail_closed'):
                raise ValueError('redis_failure_policy must be fail_open or fail_closed')
            self._store = _RedisSlidingWindowStore(redis_url, redis_required, policy)
        else:
            self._store = _SlidingWindowStore()

    async def dispatch(self, request: Request, call_next):
        if not self._enabled:
            return await call_next(request)
        path = request.url.path
        if path in _EXEMPT_PATHS or any(path.startswith(p) for p in _DOCS_PREFIXES):
            return await call_next(request)

        is_auth = path.startswith(_AUTH_PREFIX)
        limit = self._auth_per_minute if is_auth else self._per_minute
        ip = extract_client_ip(request, self._trusted_proxy_count)
        key = f"opm:rate_limit:{'auth' if is_auth else 'api'}:{ip}"
        allowed, retry_after = await self._store.check(key, limit)

        if not allowed:
            audit_event(EVENT_RATE_LIMIT_EXCEEDED, request=request, actor='anonymous',
                        outcome='blocked', source_ip=ip, bucket='auth' if is_auth else 'api',
                        limit=limit)
            return JSONResponse(status_code=429, content={
                'error': 'rate_limit_exceeded',
                'detail': 'Too many requests. Please slow down and try again.',
            }, headers={
                'Retry-After': str(retry_after),
                'X-RateLimit-Limit': str(limit),
                'X-RateLimit-Window': '60',
            })
        return await call_next(request)
