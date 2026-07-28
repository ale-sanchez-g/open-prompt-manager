// Opt-in gate for the device/geo targeting strategies
// (docs/features/registration-feature.md §13). The default (no ?opm_target=)
// case must return `{}` so the default visitor sends no traits at all -
// that's what keeps guardrail 2 (OFF path identical to main) true once these
// strategies exist.

import { getTargetingTraits } from '../featureFlags/targetingStrategy';
import { resetDeviceContext } from '../featureFlags/deviceContext';
import { resetGeoRegion } from '../featureFlags/geoContext';

describe('getTargetingTraits', () => {
  beforeEach(() => {
    resetDeviceContext();
    resetGeoRegion();
    globalThis.sessionStorage.clear();
    window.history.pushState({}, '', '/register');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('returns no traits by default', () => {
    expect(getTargetingTraits()).toEqual({});
  });

  it('returns no traits for an unrecognised opm_target value', () => {
    window.history.pushState({}, '', '/register?opm_target=something-else');
    expect(getTargetingTraits()).toEqual({});
  });

  it('returns coarse device traits for opm_target=device', () => {
    window.history.pushState({}, '', '/register?opm_target=device');
    const traits = getTargetingTraits();
    expect(traits).toHaveProperty('device_type');
    expect(traits).toHaveProperty('os_family');
    expect(traits).toHaveProperty('browser_family');
  });

  it('returns a geo_region trait for opm_target=geo', () => {
    window.history.pushState({}, '', '/register?opm_target=geo');
    const traits = getTargetingTraits();
    expect(Object.keys(traits)).toEqual(['geo_region']);
    expect(typeof traits.geo_region).toBe('string');
  });
});
