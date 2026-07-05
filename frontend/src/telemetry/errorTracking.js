import { SpanStatusCode } from '@opentelemetry/api';
import { sanitizeSpanAttributes, sanitizeUrl } from './sanitize';

function recordError(tracer, spanName, error, extraAttributes = {}) {
  const span = tracer.startSpan(spanName, { startTime: new Date() });

  span.setAttribute('exception.type', error && error.name ? error.name : 'Error');
  span.setAttribute('exception.message', error && error.message ? String(error.message) : String(error));
  if (error && error.stack) {
    span.setAttribute('exception.stacktrace', String(error.stack));
  }
  for (const [key, value] of Object.entries(extraAttributes)) {
    if (value !== undefined && value !== null) span.setAttribute(key, value);
  }

  span.setStatus({ code: SpanStatusCode.ERROR, message: 'unhandled error' });
  sanitizeSpanAttributes(span);
  span.end();
}

/**
 * Captures unhandled JS errors and unhandled promise rejections as short
 * error spans, so a crash on a page is visible in the same trace backend as
 * the page-load / fetch spans around it. Returns an unsubscribe function.
 */
export function startErrorTracking(tracer) {
  if (typeof window === 'undefined') return () => {};

  const handleError = (event) => {
    const error = event.error instanceof Error ? event.error : new Error(event.message || 'Unknown error');
    recordError(tracer, 'unhandled-exception', error, {
      'exception.source': event.filename ? sanitizeUrl(event.filename) : undefined,
      'exception.lineno': event.lineno,
      'exception.colno': event.colno,
    });
  };

  const handleRejection = (event) => {
    const reason = event.reason;
    const error = reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection');
    recordError(tracer, 'unhandled-rejection', error);
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
