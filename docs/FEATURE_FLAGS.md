# Feature Flags (Frontend) — Flagsmith

> **Audience:** AI coding agents and engineers adding or consuming feature flags in
> the React frontend. Follow the steps in order. Every code block is copy-paste
> ready and matches the conventions already used in this repo (Vite `VITE_` env
> vars, the telemetry env-parsing style in `frontend/src/telemetry/config.js`, and
> the provider/hook shape in `frontend/src/context/AuthContext.jsx`).

## 1. What and why

We use [Flagsmith](https://www.flagsmith.com/) to toggle frontend behaviour without
redeploying. Flags let the Release Train Engineer (RTE) decouple **deploy** from
**release**: ship dark code behind a flag, then flip it on per environment.

- **Provider:** Flagsmith (SaaS Edge API, or self-hosted).
- **Flagsmith project:** `opm-dx1`.
- **SDK:** `@flagsmith/flagsmith` (client-side, evaluated in the browser).
- **Scope of this doc:** client-side flags in `frontend/`. Backend flags are out of
  scope.

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

> Agents: you can also drive Flagsmith through the **Flagsmith MCP server**
> (`mcp__flagsmith__*` tools) to create/read flags programmatically instead of
> clicking the dashboard. Authenticate first (`mcp__flagsmith__authenticate`).

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

| Flag key                   | Type    | Purpose                        | Owner | Added      | Remove by  |
| -------------------------- | ------- | ------------------------------ | ----- | ---------- | ---------- |
| `dashboard_welcome_banner` | boolean | First toggle / reference impl. | RTE   | 2026-07-26 | 2026-09-30 |

- **Rollout:** enable Dev → Staging → Prod. Use Flagsmith segments/percentage
  rollout for gradual exposure when needed.
- **Kill switch:** disabling the flag in Flagsmith is the instant rollback — no
  redeploy. `VITE_FLAGSMITH_ENABLED=false` is the app-wide off switch.
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
