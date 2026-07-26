import { getFlagsmithConfig, FLAGS } from '../featureFlags/config';

const DEFAULT_API = 'https://edge.api.flagsmith.com/api/v1/';

describe('getFlagsmithConfig', () => {
  it('is disabled when no environment ID is set', () => {
    const cfg = getFlagsmithConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.environmentID).toBe('');
    expect(cfg.api).toBe(DEFAULT_API);
  });

  it('is enabled when an environment ID is present', () => {
    const cfg = getFlagsmithConfig({ VITE_FLAGSMITH_ENVIRONMENT_ID: 'abc123' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.environmentID).toBe('abc123');
  });

  it('honours the kill switch even when an ID is present', () => {
    for (const value of ['false', '0', 'no', 'off', 'OFF']) {
      const cfg = getFlagsmithConfig({
        VITE_FLAGSMITH_ENVIRONMENT_ID: 'abc123',
        VITE_FLAGSMITH_ENABLED: value,
      });
      expect(cfg.enabled).toBe(false);
    }
  });

  it('stays enabled for non-falsy VITE_FLAGSMITH_ENABLED values', () => {
    const cfg = getFlagsmithConfig({
      VITE_FLAGSMITH_ENVIRONMENT_ID: 'abc123',
      VITE_FLAGSMITH_ENABLED: 'true',
    });
    expect(cfg.enabled).toBe(true);
  });

  it('allows overriding the API base URL', () => {
    const cfg = getFlagsmithConfig({
      VITE_FLAGSMITH_ENVIRONMENT_ID: 'abc123',
      VITE_FLAGSMITH_API_URL: 'https://flags.internal.example.com/api/v1/',
    });
    expect(cfg.api).toBe('https://flags.internal.example.com/api/v1/');
  });

  it('trims whitespace around the environment ID', () => {
    const cfg = getFlagsmithConfig({ VITE_FLAGSMITH_ENVIRONMENT_ID: '  abc123  ' });
    expect(cfg.environmentID).toBe('abc123');
    expect(cfg.enabled).toBe(true);
  });

  it('exposes the dashboard_welcome_banner flag key', () => {
    expect(FLAGS.DASHBOARD_WELCOME_BANNER).toBe('dashboard_welcome_banner');
  });
});
