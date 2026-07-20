/**
 * Shim (feature 35): the retro/lessons layer lives in
 * @handyman/toolbox-core (packages/toolbox-core/src/retro.ts), which is
 * HTTP-agnostic so it can be unit-tested without a server. Consumers are
 * apps/web (via the package exports) and tests/test_toolbox_retro.js.
 */

export * from "@handyman/toolbox-core/retro";
