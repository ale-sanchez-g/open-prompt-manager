// The per-visit Flagsmith identifier (docs/features/registration-feature.md
// §3.4, §4.2).
//
// This value is the whole basis of the frontend/backend handshake and it is also
// a privacy surface: every identify() call creates a persistent identity record
// for an anonymous visitor. The properties asserted here - random, stable within
// a visit, not durable beyond it - are requirements, not implementation detail.

import { getFlagSessionId, resetFlagSessionId } from '../featureFlags/sessionIdentity';

const STORAGE_KEY = 'opm.flagSessionId';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function overrideCrypto(descriptor) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, ...descriptor });
  return () => Object.defineProperty(globalThis, 'crypto', original);
}

describe('flag session identity', () => {
  beforeEach(() => {
    resetFlagSessionId();
    globalThis.sessionStorage.clear();
  });

  it('mints a v4 UUID', () => {
    expect(getFlagSessionId()).toMatch(UUID_V4);
  });

  it('returns the same value for the whole visit', () => {
    const first = getFlagSessionId();
    expect(getFlagSessionId()).toBe(first);
    expect(getFlagSessionId()).toBe(first);
  });

  it('survives a reload via sessionStorage', () => {
    const minted = getFlagSessionId();
    expect(globalThis.sessionStorage.getItem(STORAGE_KEY)).toBe(minted);

    // A reload wipes the module cache but not sessionStorage. Re-minting here
    // would re-bucket the visitor and the fields would flicker in and out.
    resetFlagSessionId();
    globalThis.sessionStorage.setItem(STORAGE_KEY, minted);
    expect(getFlagSessionId()).toBe(minted);
  });

  it('does not persist beyond the visit', () => {
    getFlagSessionId();
    // localStorage would make an anonymous visitor durably re-identifiable,
    // which is exactly what §3.4 warns against.
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('mints an unrelated value for a new visit', () => {
    const first = getFlagSessionId();
    resetFlagSessionId();
    expect(getFlagSessionId()).not.toBe(first);
  });

  it('stays consistent when sessionStorage throws', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    try {
      // Safari private mode and blocked-storage settings. The in-memory memo has
      // to hold, or identify() and the register payload would disagree and the
      // API would bucket the visitor differently from the browser.
      const first = getFlagSessionId();
      expect(first).toMatch(UUID_V4);
      expect(getFlagSessionId()).toBe(first);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    // randomUUID needs a secure context in some engines, so the fallback is a
    // path real browsers take, not dead code.
    const realCrypto = globalThis.crypto;
    const restore = overrideCrypto({
      value: { getRandomValues: (array) => realCrypto.getRandomValues(array) },
    });

    try {
      expect(getFlagSessionId()).toMatch(UUID_V4);
    } finally {
      restore();
    }
  });

  it('returns null rather than a guessable id when there is no CSPRNG', () => {
    const restore = overrideCrypto({ value: undefined });

    try {
      // Null means "no identity", which resolves the flag to false on both
      // sides. Math.random() here would be a bucketing bug and a weak
      // identifier at the same time.
      expect(getFlagSessionId()).toBeNull();
    } finally {
      restore();
    }
  });

  // Strategy 1 - QA/verification override (§13.1).
  describe('opm_qa_session override', () => {
    afterEach(() => {
      window.history.pushState({}, '', '/');
    });

    it('pins the identifier to the URL value instead of minting one', () => {
      window.history.pushState({}, '', '/register?opm_qa_session=qa-tester-one');
      expect(getFlagSessionId()).toBe('qa-tester-one');
    });

    it('wins over a value already cached this visit', () => {
      const minted = getFlagSessionId();
      window.history.pushState({}, '', `/register?opm_qa_session=qa-override`);
      expect(getFlagSessionId()).toBe('qa-override');
      expect(getFlagSessionId()).not.toBe(minted);
    });

    it('persists the override to sessionStorage like a minted id', () => {
      window.history.pushState({}, '', '/register?opm_qa_session=qa-persisted');
      getFlagSessionId();
      expect(globalThis.sessionStorage.getItem(STORAGE_KEY)).toBe('qa-persisted');
    });

    it('ignores a value outside the safe charset/length', () => {
      window.history.pushState({}, '', `/register?opm_qa_session=${'x'.repeat(65)}`);
      expect(getFlagSessionId()).toMatch(UUID_V4);
    });

    it('ignores an empty override and mints normally', () => {
      window.history.pushState({}, '', '/register?opm_qa_session=');
      expect(getFlagSessionId()).toMatch(UUID_V4);
    });
  });
});
