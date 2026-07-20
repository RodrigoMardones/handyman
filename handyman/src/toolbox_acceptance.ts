/**
 * Shim (feature 33): the acceptance-drafting layer lives in
 * @handyman/toolbox-core (packages/toolbox-core/src/acceptance.ts), which is
 * HTTP-agnostic so it can be unit-tested without a server. Consumers are
 * apps/web (via the package exports) and tests/test_toolbox_acceptance.js.
 */

export * from "@handyman/toolbox-core/acceptance";
