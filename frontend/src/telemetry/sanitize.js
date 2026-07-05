// PII / secret scrubbing helpers shared by every instrumentation hook.
//
// Rules enforced here:
//   1. Query strings and fragments are always stripped from URL-shaped
//      attributes (they routinely carry tokens, emails, search terms, etc).
//   2. Any attribute whose key looks like it could hold an auth header,
//      cookie, or token value is redacted outright. In practice the OTel web
//      instrumentations never populate header values as attributes unless a
//      hook explicitly copies them in — we never do that — but this acts as
//      defense in depth against future config drift.

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|password|api[-_]?key)/i;

/**
 * Strips query string, fragment, and credentials from a URL, keeping only
 * the origin + pathname. Falls back to a best-effort string split if the
 * value isn't a parseable URL (e.g. an opaque relative path).
 */
export function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;

  const base = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost';

  try {
    const parsed = new URL(rawUrl, base);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return rawUrl.split(/[?#]/)[0];
  }
}

function isUrlLikeKey(key) {
  return key === 'http.url' || key === 'url.full' || key.endsWith('.url');
}

/**
 * Mutates a span's attributes in place: sanitizes URL-shaped values and
 * redacts anything that looks like a secret. Safe to call multiple times.
 * OTel JS spans expose a live `attributes` object alongside `setAttribute`,
 * so this works uniformly across every span type we create or instrument.
 */
export function sanitizeSpanAttributes(span) {
  if (!span || typeof span.setAttribute !== 'function' || !span.attributes) return;

  for (const key of Object.keys(span.attributes)) {
    const value = span.attributes[key];

    if (SENSITIVE_KEY_PATTERN.test(key)) {
      span.setAttribute(key, '[redacted]');
      continue;
    }

    if (isUrlLikeKey(key) && typeof value === 'string') {
      span.setAttribute(key, sanitizeUrl(value));
    }
  }
}
