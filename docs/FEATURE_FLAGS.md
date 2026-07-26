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
   Environment ID** (Settings → Keys → *Client-side Environment Key*). It looks
   like `ser_...` / a short opaque string.
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

- **Local dev:** add to `frontend/.env.local` (git-ignored).
- **Build/deploy:** inject where other `VITE_` vars are set (check `deploy.sh`,
  `helm/`, `docker-compose.yml`, and the frontend `Dockerfile` build args). These
  are baked at **build time**, so a new value needs a rebuild of the frontend
  image.

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

Tests must not hit the network. `useFeatureFlag` reads config at module load, so
control it by mocking the config module (Vitest, matching the repo's setup):

```jsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../featureFlags/config', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getFlagsmithConfig: () => ({ enabled: false, environmentID: '', api: '' }),
  };
});

// With enabled:false, useFeatureFlag returns the default — assert current UI.
```

To test the **on** state, mock `useFlags` from `@flagsmith/flagsmith/react` to
return `{ dashboard_welcome_banner: { enabled: true } }`, or mock
`useFeatureFlag` directly. Add tests under `frontend/src/__tests__/` alongside the
existing suites, and keep `getFlagsmithConfig()` unit tests for the env parsing
(enabled/disabled/kill-switch cases), mirroring how telemetry config is tested.

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
