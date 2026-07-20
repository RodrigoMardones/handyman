/**
 * Pure name derivation for NewFeatureForm (feature 72, runner_observer).
 *
 * Split out of the component (no JSX, no React import) so it can be
 * transpiled and unit-tested in isolation the same way app/fleet/fleetHtml.ts
 * is exercised by tests/test_web_fleet.sh: ts.transpileModule + require, no
 * Next boot needed.
 */

/** Derives a `feature.js add` name from a free-text title: lowercase, strip
 *  diacritics, replace anything outside [A-Za-z0-9_-] with "_", collapse
 *  repeated "_" and trim leading/trailing "_". The result always matches
 *  RUN_FEATURE_RE (^[A-Za-z0-9_-]+$) or is the empty string when the title
 *  had no matchable characters at all. */
export function formatFeatureName(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics after NFD
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
