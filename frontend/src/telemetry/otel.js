import { getTelemetryConfig, buildPropagateTraceHeaderUrls } from './config';
import { sanitizeSpanAttributes, sanitizeUrl } from './sanitize';

let initPromise = null;

/**
 * Whether RUM telemetry should be active. Exported separately from
 * `initTelemetry` so callers (and tests) can check the gate without paying
 * for the dynamic import of the OTel SDK.
 */
export function isTelemetryEnabled(config = getTelemetryConfig()) {
  return config.enabled;
}

/**
 * Initializes browser RUM: OTLP/HTTP trace export, document-load +
 * user-interaction + fetch/XHR instrumentation, Web Vitals, and unhandled
 * error capture. A strict no-op (no imports, no globals touched) unless
 * telemetry is enabled via env config — see ./config.js.
 *
 * Safe to call multiple times; the SDK is only ever set up once. Never
 * throws — a telemetry failure must not break the app.
 */
export function initTelemetry() {
  const config = getTelemetryConfig();

  if (!config.enabled) {
    return Promise.resolve(null);
  }

  if (!initPromise) {
    initPromise = setupTelemetry(config).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[otel] failed to initialize browser telemetry', error);
      initPromise = null;
      return null;
    });
  }

  return initPromise;
}

async function setupTelemetry(config) {
  const [
    { WebTracerProvider },
    { BatchSpanProcessor, ParentBasedSampler, TraceIdRatioBasedSampler },
    { OTLPTraceExporter },
    { resourceFromAttributes },
    { registerInstrumentations },
    { DocumentLoadInstrumentation },
    { UserInteractionInstrumentation },
    { FetchInstrumentation },
    { XMLHttpRequestInstrumentation },
    { ZoneContextManager },
  ] = await Promise.all([
    import('@opentelemetry/sdk-trace-web'),
    import('@opentelemetry/sdk-trace-base'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/instrumentation'),
    import('@opentelemetry/instrumentation-document-load'),
    import('@opentelemetry/instrumentation-user-interaction'),
    import('@opentelemetry/instrumentation-fetch'),
    import('@opentelemetry/instrumentation-xml-http-request'),
    import('@opentelemetry/context-zone'),
  ]);

  const resource = resourceFromAttributes({
    'service.name': config.serviceName,
    'deployment.environment.name': config.environment,
  });

  const exporter = new OTLPTraceExporter({ url: config.exporterUrl });

  const provider = new WebTracerProvider({
    resource,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.sampleRatio) }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  provider.register({ contextManager: new ZoneContextManager() });

  const propagateTraceHeaderCorsUrls = buildPropagateTraceHeaderUrls(config);
  // Never re-trace the exporter's own uploads to the collector.
  const ignoreUrls = [new RegExp(`^${config.exporterUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)];

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new DocumentLoadInstrumentation({
        applyCustomAttributesOnSpan: {
          documentLoad: sanitizeSpanAttributes,
          documentFetch: sanitizeSpanAttributes,
          resourceFetch: sanitizeSpanAttributes,
        },
      }),
      new UserInteractionInstrumentation({
        // Never let a form field's value or a password input leak into span
        // attributes/names via the DOM element itself.
        shouldPreventSpanCreation: (eventType, element, span) => {
          const type = (element && element.getAttribute && element.getAttribute('type')) || '';
          if (type.toLowerCase() === 'password') return true;
          sanitizeSpanAttributes(span);
          return false;
        },
      }),
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls,
        ignoreUrls,
        clearTimingResources: true,
        applyCustomAttributesOnSpan: sanitizeSpanAttributes,
      }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls,
        ignoreUrls,
        clearTimingResources: true,
        applyCustomAttributesOnSpan: sanitizeSpanAttributes,
      }),
    ],
  });

  const tracer = provider.getTracer(config.serviceName);

  const [{ startWebVitalsReporting }, { startErrorTracking }] = await Promise.all([
    import('./webVitals'),
    import('./errorTracking'),
  ]);

  await startWebVitalsReporting(tracer);
  const stopErrorTracking = startErrorTracking(tracer);

  return { provider, tracer, stopErrorTracking };
}

// Exposed for sanitize/URL reuse by consumers that want the same PII rules
// applied to telemetry-adjacent logging (e.g. an app-level error boundary).
export { sanitizeUrl };

/** Test-only: resets module-level init state between test cases. */
export function __resetTelemetryForTests() {
  initPromise = null;
}
