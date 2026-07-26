// Client-side feature-flag configuration (Flagsmith).
//
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
