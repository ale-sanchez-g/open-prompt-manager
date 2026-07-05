import { sanitizeSpanAttributes } from './sanitize';

// Web Vitals we care about for RUM: Largest Contentful Paint, Cumulative
// Layout Shift, and Interaction to Next Paint (INP replaced FID as the
// Core Web Vital responsiveness metric).
const METRIC_LOADERS = ['onLCP', 'onCLS', 'onINP'];

/**
 * Records each Web Vitals callback as a short-lived span so vitals show up
 * alongside page-load / fetch spans in the same trace backend, without
 * requiring a separate metrics pipeline. Returns a no-op cleanup handle;
 * web-vitals doesn't expose an unsubscribe API, so listeners live for the
 * page's lifetime like the rest of RUM instrumentation.
 */
export async function startWebVitalsReporting(tracer) {
  const webVitals = await import('web-vitals');

  for (const loaderName of METRIC_LOADERS) {
    const loader = webVitals[loaderName];
    if (typeof loader !== 'function') continue;

    loader((metric) => {
      const span = tracer.startSpan(`web-vitals.${metric.name.toLowerCase()}`, {
        startTime: new Date(),
      });
      span.setAttribute('web_vitals.name', metric.name);
      span.setAttribute('web_vitals.value', metric.value);
      span.setAttribute('web_vitals.rating', metric.rating);
      span.setAttribute('web_vitals.id', metric.id);
      span.setAttribute('web_vitals.navigation_type', metric.navigationType || 'unknown');
      sanitizeSpanAttributes(span);
      span.end();
    });
  }
}
