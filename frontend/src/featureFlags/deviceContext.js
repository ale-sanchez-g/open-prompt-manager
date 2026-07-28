// Strategy 2 - device-based targeting (docs/features/registration-feature.md
// §13.2). Every value below comes from one of a handful of fixed enum buckets
// - never a raw `navigator.userAgent` string - so this cannot become a
// fingerprinting channel. That constraint matters here specifically because,
// unlike the default sessionId-only flow, using this module means sending a
// trait to Flagsmith, which persists it against the visitor's identity
// (`persist_trait_data: true`, spec §3.4). Coarse-only is what keeps that
// acceptable: "mobile" or "chrome" identifies a cohort, not a person.
//
// Prefers the Client Hints API (`navigator.userAgentData`), which is itself
// deliberately low-entropy by design, and falls back to coarse UA sniffing
// only where Client Hints are unavailable (Safari/Firefox at the time of
// writing). Cached per visit in sessionStorage, mirroring sessionIdentity.js.

const STORAGE_KEY = 'opm.flagDeviceContext';

let cached = null;

function detectDeviceType(uaData, ua) {
  if (uaData && typeof uaData.mobile === 'boolean') {
    return uaData.mobile ? 'mobile' : 'desktop';
  }
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectOsFamily(uaData, ua) {
  const source = `${uaData?.platform || ''} ${ua}`;
  if (/iPhone|iPad|iOS/i.test(source)) return 'ios';
  if (/Android/i.test(source)) return 'android';
  if (/Mac OS|Macintosh/i.test(source)) return 'macos';
  if (/Windows/i.test(source)) return 'windows';
  if (/Linux/i.test(source)) return 'linux';
  return 'other';
}

function detectBrowserFamily(uaData, ua) {
  const brands = Array.isArray(uaData?.brands) ? uaData.brands.map((brand) => brand?.brand || '') : [];
  const source = `${brands.join(' ')} ${ua}`;
  if (/Edg/i.test(source)) return 'edge';
  if (/Chrome|Chromium|CriOS/i.test(source)) return 'chrome';
  if (/Firefox|FxiOS/i.test(source)) return 'firefox';
  if (/Safari/i.test(source) && !/Chrome|Chromium|Edg/i.test(source)) return 'safari';
  return 'other';
}

function compute() {
  const nav = globalThis.navigator;
  if (!nav) return null;

  const uaData = nav.userAgentData;
  const ua = nav.userAgent || '';

  return {
    device_type: detectDeviceType(uaData, ua),
    os_family: detectOsFamily(uaData, ua),
    browser_family: detectBrowserFamily(uaData, ua),
  };
}

function readStored() {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Non-fatal: the in-memory cache still keeps one visit internally
    // consistent even if storage is unavailable.
  }
}

/**
 * Coarse device signals for this visit: `{ device_type, os_family,
 * browser_family }`, each a fixed enum value. Computed once per visit.
 *
 * @returns {{device_type: string, os_family: string, browser_family: string}|null}
 *   null only when there is no `navigator` at all (SSR).
 */
export function getDeviceContext() {
  if (cached) {
    return cached;
  }

  const stored = readStored();
  if (stored) {
    cached = stored;
    return cached;
  }

  const computed = compute();
  if (!computed) {
    return null;
  }

  cached = computed;
  writeStored(computed);
  return cached;
}

/** Test seam: forget the memoised/stored value so the next call recomputes it. */
export function resetDeviceContext() {
  cached = null;
  try {
    globalThis.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clean up
  }
}
