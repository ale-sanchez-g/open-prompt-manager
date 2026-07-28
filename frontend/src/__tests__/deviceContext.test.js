// Strategy 2 - device-based targeting (docs/features/registration-feature.md
// §13.2). Every assertion checks that the output is one of the fixed enum
// buckets, never a raw user-agent string - that constraint is what keeps this
// module from becoming a fingerprinting channel once its output is sent to
// Flagsmith as a persisted trait.

import { getDeviceContext, resetDeviceContext } from '../featureFlags/deviceContext';

const STORAGE_KEY = 'opm.flagDeviceContext';

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function setUserAgentData(uaData) {
  Object.defineProperty(window.navigator, 'userAgentData', { value: uaData, configurable: true });
}

describe('device context', () => {
  const originalUa = window.navigator.userAgent;

  beforeEach(() => {
    resetDeviceContext();
    globalThis.sessionStorage.clear();
    setUserAgentData(undefined);
  });

  afterEach(() => {
    setUserAgent(originalUa);
    setUserAgentData(undefined);
  });

  it('returns one of the fixed enum values for each field', () => {
    const context = getDeviceContext();
    expect(['mobile', 'tablet', 'desktop']).toContain(context.device_type);
    expect(['ios', 'android', 'macos', 'windows', 'linux', 'other']).toContain(context.os_family);
    expect(['chrome', 'safari', 'firefox', 'edge', 'other']).toContain(context.browser_family);
  });

  it('prefers Client Hints (userAgentData) when available', () => {
    setUserAgentData({ mobile: true, platform: 'Android', brands: [{ brand: 'Chromium' }] });
    setUserAgent('Mozilla/5.0');

    const context = getDeviceContext();
    expect(context.device_type).toBe('mobile');
    expect(context.os_family).toBe('android');
  });

  it('falls back to UA sniffing for device type when Client Hints are absent', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(getDeviceContext().device_type).toBe('mobile');
  });

  it('falls back to UA sniffing for a tablet', () => {
    setUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1');
    expect(getDeviceContext().device_type).toBe('tablet');
  });

  it('detects macOS + Safari from a desktop Safari UA', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    );
    const context = getDeviceContext();
    expect(context.device_type).toBe('desktop');
    expect(context.os_family).toBe('macos');
    expect(context.browser_family).toBe('safari');
  });

  it('detects Windows + Edge from a desktop Edge UA', () => {
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0',
    );
    const context = getDeviceContext();
    expect(context.os_family).toBe('windows');
    expect(context.browser_family).toBe('edge');
  });

  it('detects Linux + Firefox', () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0');
    const context = getDeviceContext();
    expect(context.os_family).toBe('linux');
    expect(context.browser_family).toBe('firefox');
  });

  it('returns the same value for the whole visit', () => {
    const first = getDeviceContext();
    expect(getDeviceContext()).toEqual(first);
  });

  it('persists to sessionStorage so a reload keeps the same bucket', () => {
    const first = getDeviceContext();
    expect(JSON.parse(globalThis.sessionStorage.getItem(STORAGE_KEY))).toEqual(first);

    resetDeviceContext();
    globalThis.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(first));
    expect(getDeviceContext()).toEqual(first);
  });

  it('does not persist beyond the visit', () => {
    getDeviceContext();
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
