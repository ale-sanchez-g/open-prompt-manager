// Single opt-in gate for the two trait-based targeting strategies
// (docs/features/registration-feature.md §13.2 device, §13.3 geo).
//
// Every visitor who arrives without `?opm_target=...` gets exactly today's
// behaviour: `getTargetingTraits()` returns `{}`, so `useFlagIdentity` sends
// no traits and the register payload carries no `flagTraits` key at all -
// byte-identical to before this module existed. That keeps guardrail 2 (OFF
// path identical to main) true for the general population; only an explicit
// test/rollout link opts a single visit into the trait-based strategies.

import { getDeviceContext } from './deviceContext';
import { getGeoRegion } from './geoContext';

const PARAM = 'opm_target';

function readParam() {
  try {
    return new URLSearchParams(globalThis.location?.search || '').get(PARAM);
  } catch {
    return null;
  }
}

/**
 * @returns {Record<string, string>} `{}` for the default (no traits) case, or
 *   the coarse trait bag for whichever strategy `?opm_target=` requested.
 */
export function getTargetingTraits() {
  const target = readParam();

  if (target === 'device') {
    return getDeviceContext() || {};
  }

  if (target === 'geo') {
    const geoRegion = getGeoRegion();
    return geoRegion ? { geo_region: geoRegion } : {};
  }

  return {};
}
