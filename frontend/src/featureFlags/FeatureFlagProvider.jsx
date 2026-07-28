import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import flagsmith from '@flagsmith/flagsmith';
import { FlagsmithProvider, useFlags } from '@flagsmith/flagsmith/react';

import { getFlagsmithConfig } from './config';
import { getFlagSessionId } from './sessionIdentity';

const config = getFlagsmithConfig();

export function FeatureFlagProvider({ children }) {
  // When disabled (no Environment ID), don't start the SDK. Every useFeatureFlag
  // call falls back to its default, so the app renders current behaviour.
  if (!config.enabled) {
    return children;
  }

  return (
    <FlagsmithProvider
      flagsmith={flagsmith}
      options={{
        environmentID: config.environmentID,
        api: config.api,
        cacheFlags: true, // serve last-known flags instantly on reload
      }}
    >
      {children}
    </FlagsmithProvider>
  );
}

FeatureFlagProvider.propTypes = { children: PropTypes.node.isRequired };

/**
 * Read a single boolean flag. Returns `defaultValue` when flags are disabled,
 * the SDK hasn't loaded, or the flag doesn't exist — so callers are always safe.
 *
 * @param {string} flagKey - key from FLAGS in ./config
 * @param {boolean} [defaultValue=false]
 * @returns {boolean}
 */
export function useFeatureFlag(flagKey, defaultValue = false) {
  if (!config.enabled) {
    return defaultValue;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- config.enabled is constant for the app lifetime
  const flags = useFlags([flagKey]);
  return flags?.[flagKey]?.enabled ?? defaultValue;
}

// The identity (identifier + traits) we have already handed to
// flagsmith.identify() on this page load. Flagsmith holds a single identity
// for the whole client, so re-calling identify() with the same value would
// only re-fetch the same flags and burn API calls against the 50,000/month
// ceiling (§3.4). Tracking the composite key rather than a boolean means a
// genuinely new identifier or trait bag (a test resetting the session id, an
// opt-in targeting strategy) is still honoured.
let identifiedAs = null;

/**
 * Opt a flow into per-identity flag evaluation and hand back the identifier.
 *
 * Vendor detail stays in this module: callers get a plain string and never
 * import the Flagsmith SDK (§7, Agent C brief). The returned value must be sent
 * as `sessionId` on `POST /auth/register` so the API re-evaluates the same flag
 * against the same identity (§4.2) - the browser never tells the API that a flag
 * is on, it only says *who* to ask about.
 *
 * **No traits by default.** `allow_client_traits` is enabled and identities are
 * persisted (§3.4), so any trait is stored indefinitely against an anonymous
 * visitor - calling this with no `options` (the vast majority of visits) calls
 * `identify()` with the identifier alone, exactly as before.
 *
 * **Opt-in traits** (`options.traits`) exist only for the device/geo targeting
 * strategies in docs/features/registration-feature.md §13.2/§13.3, sourced from
 * `targetingStrategy.getTargetingTraits()`. Pass an empty object/omit `traits`
 * to get the no-traits behaviour; a non-empty object is forwarded to
 * `identify()` as-is. This module does not sanitise trait values - that already
 * happened in the coarse-enum modules that produced them (deviceContext.js,
 * geoContext.js) - so any caller passing hand-built traits is responsible for
 * the same coarse-enum discipline.
 *
 * Why this is opt-in per flow rather than global provider setup: identifying
 * every visitor of every page would (a) create a persistent Flagsmith identity
 * for people who never register, and (b) move `dashboard_welcome_banner` off the
 * anonymous evaluation it uses today. Only the registration flow calls this, so
 * every other page keeps evaluating anonymously exactly as before. Within one
 * SPA session a visitor who opens /register and then navigates to /dashboard
 * does carry the identity - that is harmless because `dashboard_welcome_banner`
 * has no segment or identity overrides, so identified and anonymous evaluation
 * both return the environment default. Anyone adding a segment override to that
 * flag must re-check this note.
 *
 * @param {{traits?: Record<string, string>}} [options]
 * @returns {string|null} the per-visit identifier, or null when flags are
 *   disabled (no Environment ID, kill switch, tests). Null means "no identity",
 *   which resolves the flag to its default on both sides.
 */
export function useFlagIdentity(options) {
  const traits = options?.traits;
  const sessionId = config.enabled ? getFlagSessionId() : null;
  const hasTraits = Boolean(traits && Object.keys(traits).length > 0);
  // Stringified so the effect only re-runs on an actual value change, not a
  // new object reference from the caller re-computing the same traits.
  const traitsKey = hasTraits ? JSON.stringify(traits) : '';

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    const identityKey = `${sessionId}|${traitsKey}`;
    if (identifiedAs === identityKey) {
      return;
    }
    identifiedAs = identityKey;

    try {
      // Second argument omitted entirely for the default (no traits) case -
      // not even an empty object - to match identify()'s own contract for
      // "no traits" exactly.
      const call = hasTraits ? flagsmith.identify(sessionId, traits) : flagsmith.identify(sessionId);
      Promise.resolve(call).catch(() => {
        // Flag evaluation stays at its default, which is the safe/legacy UI.
        // Allow a retry on the next mount rather than sticking on a failure.
        identifiedAs = null;
      });
    } catch {
      identifiedAs = null;
    }
    // `traitsKey` is the real dependency - it changes if and only if the
    // *value* of `traits` changes. `traits` itself is intentionally omitted:
    // callers commonly recompute it fresh each render (e.g. from
    // getTargetingTraits()), and a new object reference with the same
    // contents must not re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, traitsKey]);

  return sessionId;
}
