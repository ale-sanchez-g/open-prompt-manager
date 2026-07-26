"""Feature-flag keys evaluated on the backend.

Vendor detail is deliberately absent from this module: it holds the *keys* only,
so the shared contract (docs/features/registration-feature.md §4.1) can be agreed
and imported before any SDK is wired up. The Flagsmith client lives alongside
this module and is added by the backend branch.

Every key here must match its frontend counterpart in
``frontend/src/featureFlags/config.js`` exactly. There is no shared package
between ``frontend/`` and ``backend/``, so that correspondence is enforced by
``backend/tests/test_registration_contract.py`` instead of by the type system.

Flagsmith project ``opm-dx1`` sets ``only_allow_lower_case_feature_names``, so
keys are lowercase snake_case.
"""

# Gates the extended registration fields across frontend, API and persistence.
# Release toggle - remove once docs/features/registration-feature.md §10 completes.
FLAG_REGISTRATION_EXTENDED = 'registration_extended_fields'
