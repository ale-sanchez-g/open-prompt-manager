# Feature Flags — Flagsmith

> **Audience:** AI coding agents and engineers adding or consuming feature flags.
> §1–§11 cover the React frontend; follow those steps in order. Every code block is
> copy-paste ready and matches the conventions already used in this repo (Vite
> `VITE_` env vars, the telemetry env-parsing style in
> `frontend/src/telemetry/config.js`, and the provider/hook shape in
> `frontend/src/context/AuthContext.jsx`). **§12 covers backend flags**, which work
> differently enough that reading it is not optional before adding one.

## 1. What and why

We use [Flagsmith](https://www.flagsmith.com/) to toggle frontend behaviour without
redeploying. Flags let the Release Train Engineer (RTE) decouple **deploy** from
**release**: ship dark code behind a flag, then flip it on per environment.

- **Provider:** Flagsmith (SaaS Edge API, or self-hosted).
- **Flagsmith project:** `opm-dx1`.
- **SDK:** `@flagsmith/flagsmith` (client-side, evaluated in the browser) for the
  frontend; `flagsmith` (Python, evaluated in-process) for the backend — see §12.
- **Scope of this doc:** client-side flags in `frontend/` (§1–§11) and server-side
  flags in `backend/` (§12).

### Principles

1. **Off by default.** A flag that is missing, or the SDK failing to init, must
   resolve to the *safe / current* behaviour. Never let a flag outage change UX.
2. **One flag = one decision.** Boolean toggles for on/off. Use remote-config
   values only when you genuinely need a non-boolean.
3. **Short-lived.** A release toggle is temporary. Record a removal owner/date when
   you add one (see §9).
4. **Never commit secrets.** Only the **client-side Environment ID** goes in
   frontend env — it is publishable by design. The Flagsmith **admin/server API
   key** never touches the frontend or the repo.

## 2. Prerequisites (one-time, per environment)

The RTE / platform owner does this once per Flagsmith environment (Development,
Staging, Production):

1. In Flagsmith, open project **`opm-dx1`**.
2. Note the **Environment** you are targeting and copy its **client-side
    Environment ID** (Settings → Keys → *Client-side Environment Key*). It often looks
    like `env_...` / a short opaque string (do not use the server-side `ser_...` key).
3. Provide that ID to the app via env var `VITE_FLAGSMITH_ENVIRONMENT_ID` (§7).

> Agents: if your Copilot environment has a Flagsmith MCP server configured, you may be able to use its `mcp__flagsmith__*` tools to create/read flags programmatically. This repo does not configure a Flagsmith MCP server, so the default is to use the Flagsmith dashboard UI.

## 3. Install the SDK

```bash
cd frontend
npm install @flagsmith/flagsmith
```

Commit the resulting `package.json` / `package-lock.json` changes.

## 4. Add the config module

Create `frontend/src/featureFlags/config.js`. This mirrors the telemetry config:
env-driven, test-friendly (`env` injectable), disabled unless an Environment ID is
present.

```js
// frontend/src/featureFlags/config.js
//
// Client-side feature-flag configuration (Flagsmith).
// Vendor detail is isolated here so the rest of the app only ever imports the
// provider/hook. Flags are OFF-safe: if no Environment ID is configured the SDK
// is not started and every flag resolves to its default.
//
// Recognized Vite env vars (all optional; without the ID, flags are disabled):
//   VITE_FLAGSMITH_ENVIRONMENT_ID - client-side Environment key for project opm-dx1. Required to enable.
//   VITE_FLAGSMITH_API_URL        - Flagsmith API base. Default: Flagsmith SaaS Edge API.
//   VITE_FLAGSMITH_ENABLED        - "false"/"0"/"no"/"off" to force-disable even when an ID is set. Default: enabled when ID present.

const FALSY_VALUES = new Set(['0', 'false', 'no', 'off']);
const DEFAULT_API_URL = 'https://edge.api.flagsmith.com/api/v1/';

function parseEnabled(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return !FALSY_VALUES.has(String(value).trim().toLowerCase());
}

function readEnv() {
  return import.meta?.env ?? {};
}

/**
 * Reads and normalizes Flagsmith config from Vite env vars.
 * Pass an explicit `env` object in tests to avoid touching import.meta.env.
 */
export function getFlagsmithConfig(env = readEnv()) {
  const environmentID = String(env.VITE_FLAGSMITH_ENVIRONMENT_ID || '').trim();
  const requestedEnabled = parseEnabled(env.VITE_FLAGSMITH_ENABLED, true);

  return {
    // Only actually start the SDK when we both have an ID AND weren't disabled.
    enabled: requestedEnabled && environmentID.length > 0,
    environmentID,
    api: String(env.VITE_FLAGSMITH_API_URL || DEFAULT_API_URL).trim(),
  };
}

// Central registry of flag keys. Add every flag here so there is one source of
// truth and no stringly-typed keys scattered across the app.
export const FLAGS = Object.freeze({
  DASHBOARD_WELCOME_BANNER: 'dashboard_welcome_banner',
});
```

## 5. Add the provider + hook

Create `frontend/src/featureFlags/FeatureFlagProvider.jsx`. It wraps Flagsmith's
provider, no-ops safely when disabled, and exposes a tiny `useFeatureFlag` hook so
components never import the vendor SDK directly.

```jsx
// frontend/src/featureFlags/FeatureFlagProvider.jsx
import React from 'react';
import PropTypes from 'prop-types';
import flagsmith from '@flagsmith/flagsmith';
import { FlagsmithProvider, useFlags } from '@flagsmith/flagsmith/react';

import { getFlagsmithConfig } from './config';

const config = getFlagsmithConfig();

export function FeatureFlagProvider({ children }) {
  // When disabled (no Environment ID), don't start the SDK. Every useFeatureFlag
  // call falls back to its default, so the app renders current behaviour.
  if (!config.enabled) {
    return children;
  }

  return (
    <FlagsmithProvider
      flagsmith={flagsmith}
      options={{
        environmentID: config.environmentID,
        api: config.api,
        cacheFlags: true, // serve last-known flags instantly on reload
      }}
    >
      {children}
    </FlagsmithProvider>
  );
}

FeatureFlagProvider.propTypes = { children: PropTypes.node.isRequired };

/**
 * Read a single boolean flag. Returns `defaultValue` when flags are disabled,
 * the SDK hasn't loaded, or the flag doesn't exist — so callers are always safe.
 *
 * @param {string} flagKey - key from FLAGS in ./config
 * @param {boolean} [defaultValue=false]
 * @returns {boolean}
 */
export function useFeatureFlag(flagKey, defaultValue = false) {
  if (!config.enabled) {
    return defaultValue;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- config.enabled is constant for the app lifetime
  const flags = useFlags([flagKey]);
  return flags?.[flagKey]?.enabled ?? defaultValue;
}
```

> Note on the hook guard: `config.enabled` is a module-level constant fixed at load
> time, so the early return never changes across renders and the Rules of Hooks are
> not actually violated. If you prefer to avoid the eslint-disable, split into two
> components (enabled vs disabled) instead.

## 6. Wire the provider into the app

Wrap the app **inside** `Router`/`AuthProvider` so flags can later be evaluated per
identified user. Edit `frontend/src/App.jsx`:

```jsx
import { FeatureFlagProvider } from './featureFlags/FeatureFlagProvider';

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <FeatureFlagProvider>
          <Routes>
            {/* ...existing routes unchanged... */}
          </Routes>
        </FeatureFlagProvider>
      </AuthProvider>
    </Router>
  );
}
```

## 7. Configure environment variables

Vite exposes only `VITE_`-prefixed vars to the browser (same rule as
`VITE_API_URL`). Set per environment:

| Var                             | Required | Example                                    | Purpose |
| ------------------------------- | -------- | ------------------------------------------ | ------- |
| `VITE_FLAGSMITH_ENVIRONMENT_ID` | Yes¹     | `ABC123clientKey`                          | Client-side key for the target `opm-dx1` environment. Without it, flags are disabled. |
| `VITE_FLAGSMITH_API_URL`        | No       | `https://edge.api.flagsmith.com/api/v1/`   | Override for self-hosted / regional API. |
| `VITE_FLAGSMITH_ENABLED`        | No       | `false`                                    | Kill switch to force-disable even when an ID is set. |

¹ Required to *enable* flags; the app is designed to run safely without it.

- **Local dev (`npm start` in `frontend/`):** add to `frontend/.env.local`
  (git-ignored). Vite reads env from the `frontend/` dir — **not** the repo-root
  `.env`.
- **Docker / AWS:** these `VITE_*` vars are **baked into the JS bundle at build
  time** (Vite inlines them during `npm run build`), so they are passed as Docker
  **build args**, and changing the value needs an **image rebuild**. See §11 for
  the exact wiring. Note: the *flag values themselves* are still fetched from
  Flagsmith at runtime — only the Environment **ID** is baked, so toggling a flag
  in Flagsmith takes effect on reload with no rebuild.

## 8. Create the first flag: `dashboard_welcome_banner`

### 8a. Create the flag in Flagsmith (project `opm-dx1`)

Either via the dashboard **or** the Flagsmith MCP server:

- **Dashboard:** Project `opm-dx1` → Features → *Create Feature* →
  - Name / ID: `dashboard_welcome_banner`
  - Type: **Flag** (boolean)
  - Default: **Disabled** in every environment to start.
- **MCP (agents):** authenticate with `mcp__flagsmith__authenticate`, then use the
  Flagsmith MCP tools to create feature `dashboard_welcome_banner` in project
  `opm-dx1`, disabled by default. Confirm it exists before wiring UI.

### 8b. Consume it in the UI

Gate a small, obviously-safe piece of UI. Example on the Dashboard
(`frontend/src/pages/Dashboard.jsx`):

```jsx
import { useFeatureFlag } from '../featureFlags/FeatureFlagProvider';
import { FLAGS } from '../featureFlags/config';

function Dashboard() {
  const showWelcomeBanner = useFeatureFlag(FLAGS.DASHBOARD_WELCOME_BANNER, false);

  return (
    <div>
      {showWelcomeBanner && (
        <div className="mb-4 rounded-lg bg-blue-600 px-4 py-3 text-white">
          Welcome to Prompt Manager — this banner is controlled by a feature flag.
        </div>
      )}
      {/* ...rest of the dashboard unchanged... */}
    </div>
  );
}
```

Default is `false`, so with the flag disabled the UI is unchanged. Flip the flag
**on** in the Development environment in Flagsmith and the banner appears (after a
reload, since `cacheFlags` serves the previous value first).

## 9. Testing

Tests must not hit the network. There is one repo-specific gotcha that makes this
important: **Vitest loads `frontend/.env.local`**, so if you have a real
`VITE_FLAGSMITH_ENVIRONMENT_ID` there, `config.enabled` becomes `true` during
tests. Any component that reads a flag but is rendered in isolation (no
`FeatureFlagProvider` ancestor) would then call the live SDK with no context and
crash.

To prevent that, flags are **forced OFF in test mode** by a committed
`frontend/.env.test`:

```
VITE_FLAGSMITH_ENABLED=false
```

With that in place, `useFeatureFlag` short-circuits to its default in every test,
so flag-consuming components render safely without a provider. This is the
baseline; you don't need to mock anything to assert the **off** (current) UI.

To test the **on** state, mock `useFeatureFlag` directly (it bypasses config):

```jsx
import { useFeatureFlag } from '../featureFlags/FeatureFlagProvider';

jest.mock('../services/api');
jest.mock('../featureFlags/FeatureFlagProvider', () => ({
  useFeatureFlag: jest.fn(),
}));

// in a test:
useFeatureFlag.mockReturnValue(true);   // assert the banner appears
useFeatureFlag.mockReturnValue(false);  // assert it does not
```

Also keep pure `getFlagsmithConfig()` unit tests for the env parsing
(enabled / disabled / kill-switch / trimming), passing an explicit `env` object so
they never touch `import.meta.env` — mirroring how telemetry config is tested.

Reference implementations already in the repo:
- `frontend/src/__tests__/featureFlagsConfig.test.js` — config env-parsing units.
- `frontend/src/__tests__/DashboardWelcomeBanner.test.jsx` — banner on/off via mock.

## 10. Lifecycle & governance (RTE)

Every flag needs an owner and an exit. When adding a flag, record it here:

| Flag key                        | Type    | Purpose                                       | Owner        | Added      | Remove by    |
| ------------------------------- | ------- | --------------------------------------------- | ------------ | ---------- | ------------ |
| `dashboard_welcome_banner`      | boolean | First toggle / reference impl.                | RTE          | 2026-07-26 | 2026-09-30   |
| `registration_extended_fields`  | boolean | Extended registration fields (OPM-FLAG-REG-001), frontend + backend | **UNASSIGNED** | 2026-07-26 | **UNSET**    |

> `registration_extended_fields` has no owner or removal date because that is open
> decision #10 in `docs/features/registration-feature.md` §12. It is recorded here
> unassigned rather than omitted: an untracked flag is worse than a visibly
> incomplete row. **It must be filled in before Stage 5 (rollout).**

- **Rollout:** enable Dev → Staging → Prod. Use Flagsmith segments/percentage
  rollout for gradual exposure when needed.
- **Kill switch:** disabling the flag in Flagsmith is the rollback — no redeploy.
  `VITE_FLAGSMITH_ENABLED=false` is the app-wide off switch. **Instant for the
  frontend only.** Backend flags evaluate against a polled environment document, so
  a flip reaches the API only after the next poll — up to
  `FLAGSMITH_REFRESH_INTERVAL_SECONDS` (≥300s). Plan rollbacks of anything
  server-side around that window; see §12.3.
- **Cleanup:** once a release toggle is permanently on (or dropped), delete the
  flag in Flagsmith, remove the key from `FLAGS`, delete the branch in the UI, and
  drop the row above. Stale flags are tech debt.

## 11. Deployment: how the Environment ID reaches each target

The single most common "I enabled the flag but nothing happened" cause is that
the **Environment ID was never baked into the running bundle**, so the SDK never
started and every flag stayed at its default. Because Vite inlines `VITE_*` at
build time, each build target must inject `VITE_FLAGSMITH_ENVIRONMENT_ID` itself.

### Which target reads which environment

| Run target        | Config source                         | Flagsmith env (default) |
| ----------------- | ------------------------------------- | ----------------------- |
| `npm start` (dev) | `frontend/.env.local`                 | Development             |
| `docker compose`  | repo-root `.env` → build arg          | (whatever you set)      |
| AWS / ECS         | `deploy.sh` → build arg               | Production              |

> They can legitimately differ — that's the point of environments. Local dev
> reads Development; a Docker/AWS image reads whatever key it was **built** with.

### Docker Compose

`frontend/Dockerfile` declares the build args and exports them as env before the
build so Vite inlines them:

```dockerfile
ARG VITE_FLAGSMITH_ENVIRONMENT_ID=""
ARG VITE_FLAGSMITH_API_URL="https://edge.api.flagsmith.com/api/v1/"
ENV VITE_FLAGSMITH_ENVIRONMENT_ID=$VITE_FLAGSMITH_ENVIRONMENT_ID
ENV VITE_FLAGSMITH_API_URL=$VITE_FLAGSMITH_API_URL
RUN ... npm run build
```

`docker-compose.yml` feeds them from the repo-root `.env`:

```yaml
  frontend:
    build:
      context: ./frontend
      args:
        VITE_FLAGSMITH_ENVIRONMENT_ID: ${VITE_FLAGSMITH_ENVIRONMENT_ID:-}
        VITE_FLAGSMITH_API_URL: ${VITE_FLAGSMITH_API_URL:-https://edge.api.flagsmith.com/api/v1/}
```

A `frontend/.dockerignore` excludes local `.env*` files so the build args are the
only source of truth. **Rebuild** after changing the key — a plain restart reuses
the old image:

```bash
docker compose up -d --build frontend
```

### AWS (Terraform + `deploy.sh`)

The frontend image is built and pushed to ECR by `deploy.sh`, which passes the
same build args to `docker buildx build`. The value comes from (in order): the
`--flagsmith-env-id` flag, the `FLAGSMITH_ENVIRONMENT_ID` env var, or the
script's default (the `opm-dx1` **Production** key).

```bash
./deploy.sh                                   # bakes the Production key
./deploy.sh --flagsmith-env-id <client-key>   # override per environment
FLAGSMITH_ENVIRONMENT_ID=<client-key> ./deploy.sh
```

The ECS **task definition needs no change** — the Environment ID lives inside the
image; ECS only injects `BACKEND_URL` at runtime (via nginx `envsubst`). So
after the first deploy, flipping a flag in Flagsmith updates the app on reload
with **no redeploy**; you only rebuild/redeploy to point at a *different*
environment.

### Checklist when a flag "doesn't show" in Docker/AWS

1. Is the flag enabled in the **same** Flagsmith environment whose key was baked?
   (Dev key ⇒ enable it in Development; Production key ⇒ enable in Production.)
   Verify with the CLI: `flagsmith get <client-key> -p`.
2. Was the image **rebuilt** after setting the key? (Bundle is built once.)
3. Is `VITE_FLAGSMITH_ENVIRONMENT_ID` actually non-empty in the build args /
   `.env`? Empty ⇒ SDK never starts ⇒ flags disabled by design.
4. Hard-reload the browser — `cacheFlags` serves the previous value first.

## 12. Backend flags (server-side)

> Added by OPM-FLAG-REG-001. Before this, backend flags did not exist in OPM and
> this doc said so. Everything below is the backend counterpart of §1–§11 — the
> principles in §1 still hold, the mechanics do not.

### 12.1 How it differs from the frontend

| | Frontend | Backend |
|---|---|---|
| SDK | `@flagsmith/flagsmith` | `flagsmith` (Python), `backend/requirements.txt` |
| Key | `VITE_FLAGSMITH_ENVIRONMENT_ID` — **publishable** | `FLAGSMITH_SERVER_KEY` (`ser.…`) — **secret** |
| Evaluation | Remote, in the browser | **Local**, in-process against a polled environment document |
| Freshness | Per page load | Per poll (≥300s) |
| Unconfigured | SDK never starts ⇒ flags false | SDK never starts ⇒ flags false |

The two keys are **not interchangeable and must never be swapped**. The frontend's
environment ID is designed to ship in a public bundle; the server key exposes every
flag and segment rule in the environment and belongs only in backend secrets.

### 12.2 The module

All vendor detail lives in `backend/app/core/flags.py`, mirroring the isolation that
`frontend/src/featureFlags/config.js` gives the frontend. **Nothing else in the
backend imports `flagsmith`.** The rest of the app imports a key constant and a
helper:

```python
from app.core.flags import extended_enabled

if payload.extended is not None and extended_enabled(payload.session_id):
    ...
```

Flag keys must match their frontend counterparts in
`frontend/src/featureFlags/config.js` character for character. There is no shared
package between `frontend/` and `backend/`, so that correspondence is enforced by
`backend/tests/test_registration_contract.py` — add an assertion there for every new
key.

### 12.3 Local evaluation and the ≥300s poll floor

The backend polls one environment document on a timer and evaluates in-process. It
does **not** call the Flagsmith API per request. This is a budget constraint, not a
preference: the plan for `opm-dx1` allows 50,000 API calls per month across every
consumer, and remote evaluation would spend one call per request *and* create a
stored Flagsmith identity for every anonymous visitor.

`FLAGSMITH_REFRESH_INTERVAL_SECONDS` defaults to 300 and is **clamped up** to 300 in
code if set lower. At 60s a single instance burns ~43,200 calls/month and OPM runs
several ECS tasks; at 300s it is ~8,600 each.

**The cost is propagation delay.** A flag flip — including a rollback — takes effect
on the backend only after the next poll, so budget up to one interval. If you need a
faster kill switch than that, a feature flag is the wrong mechanism.

Identity lookups pass `transient=True` so anonymous visitors never accumulate as
stored Flagsmith identities, even if local evaluation degrades to remote.

### 12.4 Failure semantics: off-safe, always

Principle 1 in §1 is load-bearing on a public endpoint. Concretely:

- The client is built **once**, at startup, by `init_flags()` in
  `backend/main.py`. Nothing on the request path constructs a client or makes an
  API call, so a Flagsmith outage cannot add latency to a request.
- If startup initialisation fails, flags stay off for the life of the process. A
  redeploy re-attempts. This trades self-healing for a guaranteed-fast request path.
- `extended_enabled()` returns `False` on *any* problem — no identifier, no client,
  unknown flag, timeout, any exception — and never raises into a request.

A flag lookup must never be able to turn a working endpoint into a 5xx. If your call
site cannot tolerate `False`, it is not a flag.

### 12.5 Configuration

| Variable | Default | Notes |
|---|---|---|
| `FLAGSMITH_SERVER_KEY` | *(unset)* | Secret. Unset ⇒ all backend flags false. |
| `FLAGSMITH_API_URL` | `https://edge.api.flagsmith.com/api/v1/` | |
| `FLAGSMITH_REFRESH_INTERVAL_SECONDS` | `300` | Clamped up to 300. |

Set in `.env.example` and `docker-compose.yml`. **AWS: the ECS task definition needs
`FLAGSMITH_SERVER_KEY` added as a secret** (Terraform + `deploy.sh`, §11) — it is not
a build arg, unlike the frontend's environment ID, because the backend reads it at
runtime rather than baking it into an image.

### 12.6 Testing

`FLAGSMITH_SERVER_KEY` is unset in CI and in the test suite, so `init_flags()` is a
no-op and every flag resolves false. **The OFF path therefore needs no mocking**,
which is what makes it a real regression guard rather than a mock asserting itself.

For the ON path, patch the helper *where it is imported*, not in the flags module:

```python
monkeypatch.setattr('app.api.auth.extended_enabled', lambda session_id: True)
```

Test both states, and test the outage path explicitly — a fake client that raises
must still produce the legacy response. See
`backend/tests/test_registration_extended.py` for the full pattern.

### 12.7 Governance

Backend flags go in the same §10 lifecycle table as frontend ones, with the same
removal owner and date. A flag gating both a UI and its persistence — as
`registration_extended_fields` does — is **one** flag with one row, removed from
both sides together.

## Appendix — Agent checklist (first toggle)

1. [ ] `npm install @flagsmith/flagsmith` in `frontend/`.
2. [ ] Add `frontend/src/featureFlags/config.js` (§4).
3. [ ] Add `frontend/src/featureFlags/FeatureFlagProvider.jsx` (§5).
4. [ ] Wrap the app with `FeatureFlagProvider` in `App.jsx` (§6).
5. [ ] Set `VITE_FLAGSMITH_ENVIRONMENT_ID` for the target environment (§7).
6. [ ] Create feature `dashboard_welcome_banner` (disabled) in Flagsmith project
       `opm-dx1` (§8a).
7. [ ] Gate the banner in `Dashboard.jsx` using `useFeatureFlag` (§8b).
8. [ ] Add/adjust tests; run `npm test` in `frontend/` (§9).
9. [ ] Record the flag in the lifecycle table (§10).
10. [ ] Verify: with the flag off the UI is unchanged; toggling it on in Flagsmith
        shows the banner after reload.
11. [ ] For Docker/AWS, confirm the Environment ID is passed as a build arg and the
        image is rebuilt (§11) — a flag can only show if its env key was baked in.
