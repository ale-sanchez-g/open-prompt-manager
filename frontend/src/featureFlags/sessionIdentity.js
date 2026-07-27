// Per-visit Flagsmith identity for the registration flag split.
//
// docs/features/registration-feature.md §4.2 requires the browser and the API to
// evaluate `registration_extended_fields` against the *same* Flagsmith identity,
// otherwise a visitor can be shown fields the API then rejects. That identity is
// this value: it is passed to `flagsmith.identify()` and sent as `sessionId` on
// `POST /auth/register`.
//
// Privacy (§3.4): the project runs with `use_edge_identities: true` and org-level
// `persist_trait_data: true`, so every identify() call creates a *persistent*
// identity record for an anonymous visitor. Two rules follow, and both are code
// discipline rather than platform guarantees:
//
//   1. The identifier is random and non-correlatable. It is NOT derived from the
//      email, the IP, the device, or anything else about the user - it carries no
//      information at all.
//   2. No traits are ever set on it (see FeatureFlagProvider). `allow_client_traits`
//      is enabled, so anything we attach would be stored indefinitely against an
//      anonymous visitor.
//
// Scope is the browsing *visit*: sessionStorage, so a reload keeps the same
// bucket (no flicker between the flag being on and off) while a new tab or a
// later visit mints a fresh one. Deliberately not localStorage - a durable
// identifier for an anonymous visitor is exactly what §3.4 warns about.

const STORAGE_KEY = 'opm.flagSessionId';

// Memoised so identify() and the register payload can never disagree, even if
// sessionStorage is unavailable (Safari private mode, blocked storage, SSR).
let cachedSessionId = null;

function mintSessionId() {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  // Fallback for browsers without randomUUID (it requires a secure context in
  // some engines). Still a CSPRNG - RFC 4122 v4 laid out by hand.
  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // No crypto at all: refuse rather than mint a guessable identifier. Callers
  // treat null as "no identity", which resolves the flag to false (§4.3).
  return null;
}

function readStored() {
  try {
    return globalThis.sessionStorage?.getItem(STORAGE_KEY) || null;
  } catch {
    return null; // storage disabled - fall back to the in-memory value
  }
}

function writeStored(value) {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, value);
  } catch {
    // Non-fatal: the memoised value still keeps identify() and the register
    // payload consistent for the lifetime of this page.
  }
}

/**
 * The identifier for this visit, minted on first use.
 *
 * @returns {string|null} a random UUID, or null when no CSPRNG is available.
 */
export function getFlagSessionId() {
  if (cachedSessionId) {
    return cachedSessionId;
  }

  const stored = readStored();
  if (stored) {
    cachedSessionId = stored;
    return cachedSessionId;
  }

  const minted = mintSessionId();
  if (!minted) {
    return null;
  }

  cachedSessionId = minted;
  writeStored(minted);
  return cachedSessionId;
}

/** Test seam: forget the memoised/stored id so the next call mints a fresh one. */
export function resetFlagSessionId() {
  cachedSessionId = null;
  try {
    globalThis.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clean up
  }
}
