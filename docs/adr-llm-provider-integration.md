# ADR: LLM Provider Abstraction, Provider Configuration & Prompt Test-Execution

**Status:** Accepted
**Date:** 2026-08-14
**Issues:** [#348 AI Connectivity epic](https://github.com/ale-sanchez-g/open-prompt-manager/issues/348), [#349](https://github.com/ale-sanchez-g/open-prompt-manager/issues/349), [#350](https://github.com/ale-sanchez-g/open-prompt-manager/issues/350), [#351](https://github.com/ale-sanchez-g/open-prompt-manager/issues/351)
**PR:** [#436](https://github.com/ale-sanchez-g/open-prompt-manager/pull/436)

---

## Context

Open Prompt Manager could author and render prompt templates but had no way
to actually execute a prompt against a real LLM. Delivering that required
three things at once:

* A way to talk to more than one kind of LLM backend (a free local Ollama
  install, and any OpenAI-compatible hosted API — OpenAI, DeepSeek, Groq,
  OpenRouter, etc.) without every caller special-casing each provider's
  request/response shape and error format.
* A way for admins to register provider connections (base URL, optional API
  key) and store any API key **encrypted at rest**, since these are
  real, potentially billable, third-party credentials.
* An API endpoint that renders a prompt (reusing existing `/render`
  semantics) and executes it against a chosen provider, recording the
  result as a `PromptExecution` so `usage_count` / `avg_rating` /
  `success_rate` stay accurate.

---

## Decision

### 1. Provider abstraction layer (`backend/app/services/llm/`)

An abstract `LLMProvider` base class (`llm/base.py`) defines the contract
every adapter must implement — `chat()`, `chat_stream()`, `list_models()`,
`health_check()` — plus normalized data models (`CompletionResult`,
`ModelInfo`, `ProviderHealth`) and normalized exceptions
(`ProviderAuthError`, `ProviderTimeoutError`, `ProviderUnavailableError`,
`ProviderBadRequestError`). Callers never see provider-specific exceptions
or response shapes — every adapter translates its own errors into this
shared vocabulary.

Two adapters implement it:

| Adapter | File | Talks to |
|---------|------|----------|
| `OllamaProvider` | `llm/ollama.py` | Local/self-hosted Ollama (`/api/chat`, `/api/tags`); no API key required |
| `OpenAICompatibleProvider` | `llm/openai_compatible.py` | Any OpenAI-chat-completions-compatible endpoint, with bearer-token auth |

`llm/registry.py` exposes `get_provider(config)` — a factory keyed on a
`type` string (`'ollama'` / `'openai_compatible'`) — so callers ask for a
provider by config, not by class.

### 2. Provider configuration & credential storage

* `LLMProviderConfig` (`backend/app/models/llm_provider_config.py`) is a
  new table (`backend/migrations/add_llm_provider_config.py`) holding
  `name`, `provider_type`, `base_url`, and an encrypted `api_key`.
* `backend/app/services/encryption.py` wraps Fernet symmetric encryption,
  keyed by the `OPM_ENCRYPTION_KEY` env var. The key is read **lazily**, at
  the moment `encrypt()`/`decrypt()` is called, so Ollama-only deployments
  that never store a key don't need `OPM_ENCRYPTION_KEY` set and don't
  crash at import time.
* `backend/app/api/providers.py` exposes the management API:
  * `POST /api/providers`, `PUT /api/providers/{id}`,
    `DELETE /api/providers/{id}` — **admin-gated**.
  * `GET /api/providers` — open to any authenticated user; API keys are
    **always masked** in the response (first/last 3 chars only).
  * `GET /api/providers/{id}/models` — lists models available from a
    configured provider.
  * `POST /api/providers/{id}/test` — health-checks a provider connection.
  * `GET /api/providers/presets` — returns name/base_url pairs for
    well-known OpenAI-compatible providers (DeepSeek, Groq, OpenRouter) to
    prefill a settings UI.

### 3. Prompt test-execution API

`POST /api/prompts/{prompt_id}/test` (`backend/app/api/prompts.py`) renders
the prompt using the same template-rendering path as `POST
/{prompt_id}/render`, executes the rendered prompt against the chosen
`LLMProviderConfig` via `get_provider(...).chat(...)`, and returns the
output plus token/latency stats. A `PromptExecution` row is recorded on
**both** success and failure so prompt statistics stay in sync without a
separate manual step. Provider errors are normalized to HTTP 404 (unknown
prompt/provider), 422 (render failure), 400 (bad request to provider), or
502 (provider unreachable/auth/timeout) — the raw provider exception is
never leaked to the client.

### 4. Deployment

`OPM_ENCRYPTION_KEY` is threaded through every environment the same way
`JWT_SECRET` already was: a Terraform-managed Secrets Manager secret
(`terraform/rds.tf`), wired into the ECS task definition and execution-role
IAM policy (`terraform/ecs.tf`, `terraform/iam.tf`), generated/loaded by
`deploy.sh` on every deploy (so Terraform's one-time `random_id` fallback is
never silently regenerated), and documented as an optional env var in
`docker-compose.yml` / `README.md`. CI (`.github/workflows/ci.yml`)
generates a throwaway key per run so the providers e2e suite can exercise
the real encrypt/decrypt round trip.

---

## Alternatives Considered

### One concrete class per provider, no shared interface

Rejected: every caller (the test-execution endpoint, future streaming UI,
future batch jobs) would need to know which concrete class it was talking
to and handle each provider's own exception types. The abstraction cost is
small (~150 lines in `base.py`) and pays for itself the moment a second
adapter (`openai_compatible`) was added.

### Plaintext provider credentials in the database

Rejected outright: API keys are real, billable, third-party secrets.
Fernet symmetric encryption was chosen over a KMS-per-call scheme because
the backend already has no dependency on cloud KMS SDKs at the application
layer (KMS is only used to protect the Secrets Manager entry that holds
`OPM_ENCRYPTION_KEY` itself in the Terraform deployment) — application code
stays cloud-agnostic and works identically in docker-compose / local dev.

### Synchronous execution recorded only on success

Rejected: only recording `PromptExecution` on success would silently
under-count failures and skew `success_rate`. Both outcomes are recorded.

### A generic `/api/providers/{id}/execute` instead of `/api/prompts/{id}/test`

Rejected: the test-execution endpoint's job is to test a *prompt* (render +
execute + record stats against that prompt), not to be a generic passthrough
proxy to a provider. Provider-level testing already exists separately as
`POST /api/providers/{id}/test` (a lightweight health check, no prompt
rendering or stats recorded).

---

## Consequences

### Positive

* Adding a third provider type (e.g. Anthropic, Azure OpenAI) means writing
  one new adapter class against the existing `LLMProvider` interface — no
  changes to `providers.py` or `prompts.py` beyond a registry entry.
* Provider API keys are never stored or returned in plaintext.
* Prompt statistics (`usage_count`, `avg_rating`, `success_rate`) stay
  accurate automatically as prompts are tested, with no separate
  bookkeeping step for callers.
* `OPM_ENCRYPTION_KEY` follows the exact same generate/store/rotate
  lifecycle already established for `JWT_SECRET`, so there's one pattern to
  reason about across `deploy.sh`, Terraform, and CI rather than two.

### Negative / Trade-offs

* `OllamaProvider` and `OpenAICompatibleProvider` duplicate a fair amount of
  error-classification/response-checking scaffolding rather than sharing it
  on the base class; this has already caused the two adapters' error
  handling to drift slightly (tracked for follow-up, see code review on
  PR #436).
* `PromptExecution` does not currently persist which `LLMProviderConfig`
  served a given test run — only the transient API response does — so
  per-provider cost/success-rate analysis isn't queryable from the database
  yet.
* `test_prompt` has no per-user/per-endpoint rate limit specific to LLM
  spend beyond the existing shared IP-based rate limiter, so a non-admin
  user could still drive real provider spend up to that shared limit
  (tracked for follow-up).
* Rotating `OPM_ENCRYPTION_KEY` permanently invalidates every already-stored
  provider API key (same trade-off Fernet-based secret rotation always has;
  mitigated operationally by `deploy.sh` always re-reading the existing key
  from Secrets Manager rather than regenerating it).

---

## Implementation

| File | Change |
|------|--------|
| `backend/app/services/llm/base.py` | New: `LLMProvider` interface, shared data models, normalized exceptions |
| `backend/app/services/llm/ollama.py` | New: Ollama adapter |
| `backend/app/services/llm/openai_compatible.py` | New: OpenAI-compatible adapter + provider presets |
| `backend/app/services/llm/registry.py` | New: `get_provider()` factory |
| `backend/app/services/encryption.py` | New: Fernet encrypt/decrypt/mask helpers |
| `backend/app/models/llm_provider_config.py` | New: `LLMProviderConfig` model |
| `backend/migrations/add_llm_provider_config.py` | New: creates `llm_provider_configs` table |
| `backend/app/api/providers.py` | New: provider management API |
| `backend/app/api/prompts.py` | Added `POST /{prompt_id}/test` |
| `backend/app/models/schemas.py` | New request/response schemas for providers + test-execution |
| `backend/requirements.txt` | Added `httpx==0.28.1` |
| `terraform/rds.tf`, `terraform/variables.tf`, `terraform/iam.tf`, `terraform/ecs.tf` | `OPM_ENCRYPTION_KEY` Secrets Manager secret, IAM permission, task definition wiring |
| `deploy.sh` | `load_or_generate_opm_encryption_key`, threaded through every `terraform plan`/`apply` |
| `docker-compose.yml`, `README.md` | Documented `OPM_ENCRYPTION_KEY` |
| `.github/workflows/ci.yml` | Generate throwaway `OPM_ENCRYPTION_KEY` for CI runs |
| `.gitleaks.toml` | Allowlisted illustrative example key strings in OpenAPI schema docs |
| `backend/tests/test_llm_ollama.py`, `test_llm_openai_compatible.py`, `test_encryption.py`, `test_providers.py`, `test_prompt_test_execution.py` | New unit tests |
| `e2e-test/specs/providers/providers-api.spec.ts`, `e2e-test/specs/prompts/prompt-test-execution.spec.ts` | New e2e tests |
