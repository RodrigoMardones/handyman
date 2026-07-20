/**
 * buildState: the /api/state document of the toolBox observer (per-harness
 * snapshot + health signals + feature queue + fleet aggregate + timeline).
 *
 * Originally extracted from toolbox_serve.ts (feature 42) so apps/web can
 * import it without HTTP, via the package.json "./state" export. The Node
 * observer (toolbox_serve.ts) was decommissioned in feature 50; apps/web
 * is now the sole consumer. This module lives in handyman (not
 * @handyman/toolbox-core) because it needs the snapshot/metrics/
 * skill-version machinery that stays with the CLI package; the registry
 * guards and readers it composes come from the core package.
 */
import { join } from "node:path";
import { isFile, isRegisteredRoot, readFeatures } from "@handyman/toolbox-core/state";
import { addFeature, FEATURE_NAME_RE } from "./core/featureWrite.js";
import { resolveWorkspace } from "./core/workspace.js";
import {
  fleetAggregate,
  harnessSignals,
  registryPath,
  type Snapshot,
  snapshots,
  toolboxTimeline,
} from "./toolbox.js";
import { currentSkillVersion } from "./upgrade_harness.js";

// The web runtime loader (apps/web/lib/toolboxState.ts) imports THIS module
// as the single handyman entry: re-export the served-assets helpers so the
// Next route handlers share the exact vendor/graph logic (feature 44).
export { type GraphFileResult, graphFile, vendorText } from "./toolbox_assets.js";

export type AddFeatureForRootResult =
  | { status: "ok"; id: number }
  | { status: "root_required" }
  | { status: "root_not_registered" }
  | { status: "invalid_name" }
  | { status: "empty_acceptance" }
  | { status: "duplicate_name" }
  | { status: "workspace_error" }
  | { status: "invalid_state"; errors: string[] }
  | { status: "write_error" };

/**
 * Register a feature in a harness of the fleet (feature 60): the panel's first
 * write of harness STATE, as opposed to `writeIntake`'s write of a document.
 *
 * The split mirrors `writeIntake` (core write) vs `intakeHttp` (edge mapping):
 * `core/featureWrite.ts` owns the append and the schema gate, and knows nothing
 * about registries; this function owns the policy that only applies when the
 * caller is a browser rather than someone who already has the filesystem.
 *
 * Validation ORDER is contract, matching writeIntake's shape:
 *   root required -> registered root -> name -> acceptance -> workspace -> write
 *
 * The two checks the CLI does NOT make live here on purpose. `feature.js add`
 * has always accepted a feature with no acceptance yet - that is what the
 * `acceptance` verb is for - but registering a contract-less feature from a UI
 * is manufacturing evidence debt on purpose, and the name has to be a safe slug
 * because it becomes `backlog/impl_<name>.md`.
 *
 * Never spawns a process.
 */
export function addFeatureForRoot(
  hroot: string,
  root: string,
  name: string,
  acceptance: readonly string[],
  opts: { title?: string | null; description?: string | null } = {},
): AddFeatureForRootResult {
  if (!root) {
    return { status: "root_required" };
  }
  if (!isRegisteredRoot(hroot, root)) {
    return { status: "root_not_registered" };
  }
  if (!FEATURE_NAME_RE.test(name)) {
    return { status: "invalid_name" };
  }
  const criteria = acceptance.filter((line) => line.trim() !== "");
  if (criteria.length === 0) {
    return { status: "empty_acceptance" };
  }
  let workspace: string;
  try {
    workspace = resolveWorkspace(root);
  } catch {
    return { status: "workspace_error" };
  }
  return addFeature(workspace, {
    name,
    acceptance: criteria,
    title: opts.title ?? null,
    description: opts.description ?? null,
  });
}

/**
 * Per-harness metrics block for the panel (Plan A). The snapshot already
 * carries metrics.collect() output (harnessSnapshot spreads it), so this only
 * regroups it; null when the harness was unreadable and collect() never ran.
 */
function snapshotMetrics(snap: Snapshot): Record<string, unknown> | null {
  const { throughput, review_verdicts, coverage } = snap;
  if (!throughput || !review_verdicts || !coverage) {
    return null;
  }
  return { throughput, review_verdicts, coverage };
}

export function buildState(hroot: string): Record<string, unknown> {
  const [snaps, _registry, loadError] = snapshots(hroot);
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const harnesses = snaps.map((snap) => ({
    ...snap,
    signals: harnessSignals(snap, today, 7, 14),
    metrics: snapshotMetrics(snap),
    features: snap.error ? [] : readFeatures(String(snap.workspace ?? "")),
    has_graph: !snap.error && isFile(join(snap.project_root, "graphify-out", "graph.html")),
  }));
  return {
    registry: registryPath(hroot),
    registry_error: loadError,
    skill_version: currentSkillVersion() || null,
    generated_at: new Date().toISOString(),
    harnesses,
    fleet: fleetAggregate(snaps),
    timeline: toolboxTimeline(hroot, snaps).slice(0, 20),
  };
}
