// Configuration for browser Real User Monitoring (RUM) telemetry.
//
// Vendor-neutral by design: everything is exported over plain OTLP/HTTP, so
// swapping the collector target (Grafana vs. SigNoz, decision #346) is a
// one-line env change, never a code change. Telemetry is OFF by default in
// every environment and only turns on when BOTH `VITE_OTEL_ENABLED` is
// truthy AND an exporter endpoint has been configured — this lets gate G3
// (final collector target still pending) resolve independently of merging
// this instrumentation.
//
// Recognized Vite env vars (all optional unless noted):
//   VITE_OTEL_ENABLED           - "true"/"1"/"yes"/"on" to enable telemetry. Default: disabled.
//   VITE_OTEL_EXPORTER_URL      - OTLP/HTTP traces endpoint (e.g. https://otel-collector.example.com/v1/traces). Required to actually enable.
//   VITE_OTEL_SERVICE_NAME      - `service.name` resource attribute. Default: "open-prompt-manager-frontend".
//   VITE_OTEL_ENVIRONMENT       - `deployment.environment.name` resource attribute. Default: Vite `MODE`.
//   VITE_OTEL_PROPAGATE_URLS    - comma-separated extra trusted origins/URLs (besides same-origin and VITE_API_URL) that should receive W3C traceparent headers.
//   VITE_OTEL_SAMPLE_RATIO      - trace sampling ratio in [0, 1]. Default: 1 (sample everything).

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return TRUTHY_VALUES.has(String(value).trim().toLowerCase());
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseRatio(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}

function readEnv() {
  return (typeof import.meta !== 'undefined' && import.meta.env) || {};
}

/**
 * Reads and normalizes telemetry configuration from Vite env vars.
 * Pass an explicit `env` object in tests to avoid mutating import.meta.env.
 */
export function getTelemetryConfig(env = readEnv()) {
  const exporterUrl = String(env.VITE_OTEL_EXPORTER_URL || '').trim();
  const explicitlyEnabled = parseBoolean(env.VITE_OTEL_ENABLED, false);

  return {
    // Telemetry only actually turns on when both an explicit opt-in AND a
    // real endpoint are present, so a stray `VITE_OTEL_ENABLED=true` can
    // never start exporting spans to nowhere (or throw on export).
    enabled: explicitlyEnabled && exporterUrl.length > 0,
    requestedEnabled: explicitlyEnabled,
    exporterUrl,
    serviceName: String(env.VITE_OTEL_SERVICE_NAME || 'open-prompt-manager-frontend').trim(),
    environment: String(env.VITE_OTEL_ENVIRONMENT || env.MODE || 'production').trim(),
    apiUrl: String(env.VITE_API_URL || '').trim(),
    propagateUrls: parseList(env.VITE_OTEL_PROPAGATE_URLS),
    sampleRatio: parseRatio(env.VITE_OTEL_SAMPLE_RATIO, 1),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Same-origin requests always receive W3C trace-context headers automatically
 * (that's how @opentelemetry/instrumentation-fetch/xhr behave out of the
 * box). This only needs to list additional *cross-origin* targets that
 * should also be trusted with trace headers — e.g. a `VITE_API_URL`
 * pointing at a separately hosted backend, or explicit extra allow-listed
 * URLs. Never include arbitrary third-party URLs here.
 */
export function buildPropagateTraceHeaderUrls(config) {
  const patterns = new Set();

  if (config.apiUrl) {
    patterns.add(`^${escapeRegExp(config.apiUrl)}`);
  }

  for (const url of config.propagateUrls) {
    patterns.add(`^${escapeRegExp(url)}`);
  }

  return Array.from(patterns).map((pattern) => new RegExp(pattern));
}
