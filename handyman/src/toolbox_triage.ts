/**
 * Shim (feature 32): the backlog-triage + evidence-debt layer lives in
 * @handyman/toolbox-core (packages/toolbox-core/src/triage.ts), which is
 * HTTP-agnostic so it can be unit-tested without a server. Consumers are
 * apps/web (via the package exports) and tests/test_toolbox_triage.js.
 *
 * No local logic: unlike toolbox_draft.ts there is no bundled asset to
 * rebind, so this is a straight re-export.
 */

export * from "@handyman/toolbox-core/triage";
