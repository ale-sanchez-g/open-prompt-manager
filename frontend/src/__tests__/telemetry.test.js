import { getTelemetryConfig, buildPropagateTraceHeaderUrls } from '../telemetry/config';
import { sanitizeUrl, sanitizeSpanAttributes } from '../telemetry/sanitize';
import { initTelemetry, isTelemetryEnabled } from '../telemetry/otel';

function fakeSpan(initialAttributes) {
  const attributes = { ...initialAttributes };
  return {
    attributes,
    setAttribute(key, value) {
      attributes[key] = value;
    },
  };
}

describe('telemetry config gating', () => {
  it('is disabled by default when no env vars are set', () => {
    const config = getTelemetryConfig({});
    expect(config.enabled).toBe(false);
    expect(config.requestedEnabled).toBe(false);
    expect(config.exporterUrl).toBe('');
    expect(config.serviceName).toBe('open-prompt-manager-frontend');
  });

  it('stays disabled when enabled is requested but no exporter URL is configured', () => {
    const config = getTelemetryConfig({ VITE_OTEL_ENABLED: 'true' });
    expect(config.requestedEnabled).toBe(true);
    expect(config.enabled).toBe(false);
  });

  it('stays disabled when an exporter URL is set but the flag is off', () => {
    const config = getTelemetryConfig({ VITE_OTEL_EXPORTER_URL: 'https://collector.example.com/v1/traces' });
    expect(config.enabled).toBe(false);
  });

  it('enables only when both the flag and exporter URL are present', () => {
    const config = getTelemetryConfig({
      VITE_OTEL_ENABLED: 'true',
      VITE_OTEL_EXPORTER_URL: 'https://collector.example.com/v1/traces',
      VITE_OTEL_SERVICE_NAME: 'custom-frontend',
      VITE_OTEL_ENVIRONMENT: 'staging',
      VITE_API_URL: 'https://api.example.com',
      VITE_OTEL_SAMPLE_RATIO: '0.5',
    });

    expect(config.enabled).toBe(true);
    expect(config.exporterUrl).toBe('https://collector.example.com/v1/traces');
    expect(config.serviceName).toBe('custom-frontend');
    expect(config.environment).toBe('staging');
    expect(config.apiUrl).toBe('https://api.example.com');
    expect(config.sampleRatio).toBe(0.5);
  });

  it('accepts common truthy spellings and rejects everything else for the enabled flag', () => {
    expect(getTelemetryConfig({ VITE_OTEL_ENABLED: '1', VITE_OTEL_EXPORTER_URL: 'x' }).enabled).toBe(true);
    expect(getTelemetryConfig({ VITE_OTEL_ENABLED: 'on', VITE_OTEL_EXPORTER_URL: 'x' }).enabled).toBe(true);
    expect(getTelemetryConfig({ VITE_OTEL_ENABLED: 'false', VITE_OTEL_EXPORTER_URL: 'x' }).enabled).toBe(false);
    expect(getTelemetryConfig({ VITE_OTEL_ENABLED: 'nonsense', VITE_OTEL_EXPORTER_URL: 'x' }).enabled).toBe(false);
  });

  it('falls back to a sane sample ratio when the configured value is out of range', () => {
    expect(getTelemetryConfig({ VITE_OTEL_SAMPLE_RATIO: '4' }).sampleRatio).toBe(1);
    expect(getTelemetryConfig({ VITE_OTEL_SAMPLE_RATIO: '-1' }).sampleRatio).toBe(1);
    expect(getTelemetryConfig({ VITE_OTEL_SAMPLE_RATIO: 'nan' }).sampleRatio).toBe(1);
  });
});

describe('trace-context propagation targets', () => {
  it('builds regexes anchored to the configured API origin and extra allow-listed URLs', () => {
    const config = getTelemetryConfig({
      VITE_API_URL: 'https://api.example.com',
      VITE_OTEL_PROPAGATE_URLS: 'https://extra.example.com, https://other.example.com',
    });

    const patterns = buildPropagateTraceHeaderUrls(config);
    expect(patterns).toHaveLength(3);
    expect(patterns.some((pattern) => pattern.test('https://api.example.com/api/prompts/'))).toBe(true);
    expect(patterns.some((pattern) => pattern.test('https://extra.example.com/x'))).toBe(true);
    expect(patterns.some((pattern) => pattern.test('https://untrusted.example.com/x'))).toBe(false);
  });

  it('produces no extra targets when neither an API URL nor allow-list is configured', () => {
    expect(buildPropagateTraceHeaderUrls(getTelemetryConfig({}))).toEqual([]);
  });
});

describe('PII / secret scrubbing', () => {
  it('strips query strings and fragments from URLs', () => {
    expect(sanitizeUrl('https://app.example.com/api/prompts/?token=secret&q=hello#section')).toBe(
      'https://app.example.com/api/prompts/',
    );
  });

  it('always strips the query string, even for odd/relative inputs', () => {
    const result = sanitizeUrl('not a url?token=secret');
    expect(result).not.toContain('?');
    expect(result).not.toContain('token=secret');
  });

  it('leaves non-string / empty input untouched', () => {
    expect(sanitizeUrl('')).toBe('');
    expect(sanitizeUrl(undefined)).toBeUndefined();
  });

  it('redacts attributes that look like secrets and sanitizes url-shaped attributes on a span', () => {
    const span = fakeSpan({
      'http.url': 'https://app.example.com/api/prompts/?access_token=abc123',
      'http.request.header.authorization': 'Bearer abc123',
      'some.cookie.value': 'session=abc',
      'http.method': 'GET',
    });

    sanitizeSpanAttributes(span);

    expect(span.attributes['http.url']).toBe('https://app.example.com/api/prompts/');
    expect(span.attributes['http.request.header.authorization']).toBe('[redacted]');
    expect(span.attributes['some.cookie.value']).toBe('[redacted]');
    expect(span.attributes['http.method']).toBe('GET');
  });

  it('is a no-op for spans without attributes or setAttribute', () => {
    expect(() => sanitizeSpanAttributes(null)).not.toThrow();
    expect(() => sanitizeSpanAttributes({})).not.toThrow();
  });
});

describe('initTelemetry gating (default-off behavior)', () => {
  it('is disabled in the test environment by default', () => {
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('resolves to null and never throws when telemetry is disabled', async () => {
    await expect(initTelemetry()).resolves.toBeNull();
  });

  it('is idempotent to call repeatedly while disabled', async () => {
    await expect(initTelemetry()).resolves.toBeNull();
    await expect(initTelemetry()).resolves.toBeNull();
  });
});
