// Strategy 3 - geographic targeting without IP or precise location
// (docs/features/registration-feature.md §13.3).
//
// Deliberately NOT `navigator.geolocation`: it needs a permission prompt on a
// public, anonymous registration page (a poor funnel trade for a targeting
// convenience, spec §1.2) and it returns a precise coordinate, which is far
// more than "which broad region" requires. Deliberately NOT an IP-based
// lookup either: that needs a server-side call and treats the IP itself as
// the identifying value, which is exactly the kind of sensitive input this
// strategy is meant to avoid.
//
// Instead: the browser's IANA timezone (`Intl.DateTimeFormat`) requires no
// permission and no network call, and is bucketed down to one of a handful of
// coarse regions below - never the raw zone name - before it ever becomes a
// Flagsmith trait. Like deviceContext.js, this trades the default
// no-traits-ever posture (§3.4) for a persisted-but-coarse signal; the
// bucketing is what keeps "the visitor is roughly in Europe" from becoming
// "the visitor is in this specific city".

const STORAGE_KEY = 'opm.flagGeoRegion';

let cached;

const REGION_BY_PREFIX = [
  [/^America\//, 'americas'],
  [/^(Europe|Africa)\//, 'europe-africa'],
  [/^(Asia|Australia|Pacific|Indian)\//, 'asia-pacific'],
];

function detectRegion() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const match = REGION_BY_PREFIX.find(([pattern]) => pattern.test(timeZone));
    return match ? match[1] : 'other';
  } catch {
    // No Intl support, or resolution failed: no region signal at all rather
    // than a guessed default.
    return null;
  }
}

function readStored() {
  try {
    return globalThis.sessionStorage?.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, value);
  } catch {
    // Non-fatal: the in-memory cache still keeps one visit consistent.
  }
}

/**
 * Coarse region bucket for this visit - one of `americas`, `europe-africa`,
 * `asia-pacific`, `other`. Computed once per visit.
 *
 * @returns {string|null} null when the timezone cannot be resolved at all.
 */
export function getGeoRegion() {
  if (cached !== undefined) {
    return cached;
  }

  const stored = readStored();
  if (stored) {
    cached = stored;
    return cached;
  }

  const region = detectRegion();
  cached = region || null;
  if (cached) {
    writeStored(cached);
  }
  return cached;
}

/** Test seam: forget the memoised/stored value so the next call recomputes it. */
export function resetGeoRegion() {
  cached = undefined;
  try {
    globalThis.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clean up
  }
}
