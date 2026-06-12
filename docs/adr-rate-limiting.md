# ADR: IP-Based Rate Limiting for the Backend API

**Status:** Accepted  
**Date:** 2026-06-12  
**Issue:** [#147 Backend has no throttling](https://github.com/ale-sanchez-g/open-prompt-manager/issues/147)

---

## Context

The Open Prompt Manager REST API had no mechanism to limit the volume of
requests from a single client.  Without throttling:

* The `/auth/login` and `/auth/register` endpoints were vulnerable to
  credential-stuffing and brute-force attacks.
* Any API consumer (or a misconfigured client) could exhaust backend resources
  and cause degraded service for all users (a soft denial-of-service).
* AWS WAF (planned in Issue #204) provides edge-layer protection, but a
  defence-in-depth strategy requires protection at the application layer as well.

---

## Decision

Implement an **in-process, sliding-window, IP-based rate limiter** as a
Starlette `BaseHTTPMiddleware`.

### Limits

| Bucket | Default | Environment variable |
|--------|---------|----------------------|
| Auth endpoints (`/auth/*`) | 60 req/min per IP | `RATE_LIMIT_AUTH_PER_MINUTE` |
| All other API endpoints | 200 req/min per IP | `RATE_LIMIT_PER_MINUTE` |
| Health / readiness / docs | Exempt | — |

Limits and the enabled flag are configurable via environment variables so that
each deployment tier (local, staging, production) can tune them without code
changes.

### Algorithm

A **sliding window** (as opposed to a fixed window or token bucket) was chosen
because it avoids the burst-at-boundary problem inherent in fixed-window
counters: a client cannot make twice the limit of requests by timing requests
at the window boundary.

Each IP maintains a `deque` of monotonic timestamps.  On every request:
1. Timestamps older than 60 seconds are evicted from the front of the deque.
2. If the remaining count ≥ limit, return HTTP 429 with a `Retry-After` header.
3. Otherwise, append the current timestamp and pass the request through.

A `threading.Lock` protects the shared store so the implementation is safe
under uvicorn's default multi-threaded request handling.

### IP extraction

`X-Forwarded-For` is read when present so the **original client address** is
used rather than the nginx or ALB proxy address.  Only the first (leftmost)
address in the header is used to avoid header-injection spoofing.

### HTTP 429 response format

```json
{
  "error": "rate_limit_exceeded",
  "detail": "Too many requests. Please slow down and try again."
}
```

Response headers:

| Header | Value |
|--------|-------|
| `Retry-After` | Seconds until the oldest in-window request expires |
| `X-RateLimit-Limit` | The configured limit for this bucket |
| `X-RateLimit-Window` | The window size in seconds (always `60`) |

---

## Alternatives Considered

### `slowapi` library

`slowapi` (built on `limits`) is the conventional FastAPI rate-limiting library.
It was **not chosen** because:

* It requires two additional pinned runtime dependencies, adding supply-chain
  surface area.
* The custom middleware is ~80 lines, well-understood, and has no transitive
  dependencies.
* `slowapi` provides per-route decorators which are more granular than needed
  here; a single middleware layer is sufficient for the current use case.

### Redis-backed shared counter

A Redis store would support **multi-replica** deployments without per-process
state drift.  It was **not chosen** for the initial implementation because:

* The current AWS ECS deployment runs a **single backend task** (desired count
  configurable, but the default is 2 replicas with sticky sessions via ALB).
* Adding Redis increases operational complexity (cluster, VPC peering, secrets
  rotation).
* The AWS ALB already terminates connections and can forward to a single
  target; WAF (planned in #204) will provide shared-state edge protection.

**If the backend scales to many replicas** without sticky routing, the
in-process store will allow each replica to enforce the limit independently
(each sees only its share of traffic), effectively multiplying the limit.  When
this becomes a concern, migrate the store to Redis by replacing
`_SlidingWindowStore` with a Redis Lua script implementation.

### NGINX `limit_req` module

Rate limiting can be enforced at the nginx reverse-proxy layer.  This was
**not chosen** because:

* In the AWS ECS deployment, nginx is the **frontend** container that only
  serves static assets; API traffic is routed by the ALB directly to the
  backend service, bypassing nginx entirely.
* Helm and Kubernetes deployments use an nginx ingress controller where
  `limit_req` would require annotation-based configuration that is harder to
  test and version-control.

---

## Consequences

### Positive

* Brute-force and credential-stuffing attacks against `/auth/*` are rate-limited
  to 60 attempts/minute per IP by default.
* Misconfigured or runaway API clients cannot exhaust backend resources beyond
  200 requests/minute per IP.
* Rate limits are tested at three levels:
  * **Unit tests** (`backend/tests/test_rate_limit.py`) — middleware logic with
    low synthetic limits.
  * **E2E tests** (`e2e-test/specs/performance/performance.spec.ts`) — verifies
    HTTP 429 format in the running docker-compose stack.
  * **k6 performance test** (`k6/opm-ci.js`) — sustained 2-minute load test
    validating latency SLOs under concurrent traffic, run in CI after every
    merge to `main`.
* Configuration is exposed to all deployment targets (docker-compose, Helm,
  Terraform/ECS) via documented environment variables.
* Health and readiness endpoints are never rate-limited so load-balancer health
  checks and monitoring are unaffected.

### Negative / Trade-offs

* **In-process state** — restarting a task resets all counters; a spike that
  straddles a restart is not fully accounted for.
* **Per-replica enforcement** — in a multi-replica deployment without shared
  state each replica enforces independently (see the Redis alternative above).
* **IPv6 / NAT** — clients sharing a NAT gateway will share the same bucket
  (standard trade-off for IP-based rate limiting).

---

## Implementation

| File | Change |
|------|--------|
| `backend/app/middleware/rate_limit.py` | New: `_SlidingWindowStore` + `RateLimitMiddleware` |
| `backend/app/middleware/__init__.py` | New: package init |
| `backend/main.py` | Import and register `RateLimitMiddleware` |
| `backend/tests/test_rate_limit.py` | New: unit tests |
| `e2e-test/specs/performance/performance.spec.ts` | Added rate-limiting E2E tests |
| `k6/opm-ci.js` | New: CI k6 load-test script (2-minute sustained run) |
| `.github/workflows/ci.yml` | Added `performance-test` job (k6, runs after `e2e-smoke`) |
| `docker-compose.yml` | Added `RATE_LIMIT_*` env vars |
| `helm/prompt-manager/values.yaml` | Added `RATE_LIMIT_*` env vars |
| `terraform/ecs.tf` | Added `RATE_LIMIT_*` env vars to backend task definition |
| `terraform/variables.tf` | Added `rate_limit_enabled`, `rate_limit_per_minute`, `rate_limit_auth_per_minute` |
| `README.md` | Documented rate limiting feature, env vars, and response format |
