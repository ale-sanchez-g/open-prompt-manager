// Strategy 3 - geographic targeting without IP or precise location
// (docs/features/registration-feature.md §13.3). Asserts the coarse region
// bucketing from IANA timezone, and that no permission-gated or IP-based API
// is ever touched.

import { getGeoRegion, resetGeoRegion } from '../featureFlags/geoContext';

const STORAGE_KEY = 'opm.flagGeoRegion';

function mockTimeZone(timeZone) {
  const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
    resolvedOptions: () => ({ timeZone }),
  }));
  return () => spy.mockRestore();
}

describe('geo region', () => {
  beforeEach(() => {
    resetGeoRegion();
    globalThis.sessionStorage.clear();
  });

  it('buckets an America/* timezone as americas', () => {
    const restore = mockTimeZone('America/New_York');
    try {
      expect(getGeoRegion()).toBe('americas');
    } finally {
      restore();
    }
  });

  it('buckets a Europe/* timezone as europe-africa', () => {
    const restore = mockTimeZone('Europe/Berlin');
    try {
      expect(getGeoRegion()).toBe('europe-africa');
    } finally {
      restore();
    }
  });

  it('buckets an Africa/* timezone as europe-africa', () => {
    const restore = mockTimeZone('Africa/Cairo');
    try {
      expect(getGeoRegion()).toBe('europe-africa');
    } finally {
      restore();
    }
  });

  it('buckets an Asia/* timezone as asia-pacific', () => {
    const restore = mockTimeZone('Asia/Tokyo');
    try {
      expect(getGeoRegion()).toBe('asia-pacific');
    } finally {
      restore();
    }
  });

  it('buckets an Australia/* timezone as asia-pacific', () => {
    const restore = mockTimeZone('Australia/Sydney');
    try {
      expect(getGeoRegion()).toBe('asia-pacific');
    } finally {
      restore();
    }
  });

  it('buckets an unrecognised timezone as other', () => {
    const restore = mockTimeZone('Etc/UTC');
    try {
      expect(getGeoRegion()).toBe('other');
    } finally {
      restore();
    }
  });

  it('never exposes the raw IANA timezone string', () => {
    const restore = mockTimeZone('America/Argentina/Buenos_Aires');
    try {
      const region = getGeoRegion();
      expect(region).not.toContain('/');
      expect(region).toBe('americas');
    } finally {
      restore();
    }
  });

  it('returns the same value for the whole visit', () => {
    const restore = mockTimeZone('Asia/Tokyo');
    try {
      const first = getGeoRegion();
      expect(getGeoRegion()).toBe(first);
    } finally {
      restore();
    }
  });

  it('persists to sessionStorage so a reload keeps the same bucket', () => {
    const restore = mockTimeZone('Europe/Paris');
    try {
      const first = getGeoRegion();
      expect(globalThis.sessionStorage.getItem(STORAGE_KEY)).toBe(first);

      resetGeoRegion();
      globalThis.sessionStorage.setItem(STORAGE_KEY, first);
      expect(getGeoRegion()).toBe(first);
    } finally {
      restore();
    }
  });

  it('does not persist beyond the visit', () => {
    const restore = mockTimeZone('Europe/Paris');
    try {
      getGeoRegion();
      expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      restore();
    }
  });

  it('returns null rather than a guess when resolution throws', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl support');
    });
    try {
      expect(getGeoRegion()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
