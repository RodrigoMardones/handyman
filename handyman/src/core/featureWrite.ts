/**
 * The single validated append of a feature to `feature_list.json` (feature 60).
 *
 * Extracted from `feature.ts`'s `cmdAdd` so the CLI and the panel are two
 * presentations of ONE write, the shape feature 46 already used for
 * `writeIntake`. The alternative the plan floated - having the HTTP route
 * spawn `node dist/feature.js add` - was dropped: the observer's only other
 * write advertises `spawned_process: false` in its response body (pinned by
 * three suites), and the id would have had to be scraped back out of stdout
 * ("added feature 60 'x' (pending)"), making a human-readable line into a
 * machine contract.
 *
 * Deliberately registry-agnostic: the allowlist belongs to the panel, whose
 * caller is a browser, not to a CLI run by someone who already has the
 * filesystem. `addFeatureForRoot` in `toolbox_state.ts` layers that guard on
 * top - the same split as `writeIntake` (core write) vs `intakeHttp` (edge
 * mapping).
 *
 * Deliberately policy-free, too. An earlier draft rejected a malformed name
 * and an empty acceptance list here; `tests/test_feature.sh` went red in four
 * places, because `feature.js add` has always allowed a feature with no
 * acceptance yet - that is what the `acceptance` verb is for - and hardening a
 * CLI nobody asked to harden is the mistake feature 56 declined to make. Those
 * two checks are panel policy: registering a contract-less feature from a UI is
 * creating debt on purpose. They live in `addFeatureForRoot`, beside the
 * registry guard. This function only appends and validates.
 */
import { join } from "node:path";
import { loadFeatureList, saveFeatureList } from "./featureList.js";
import { validateFeatureList } from "./schema.js";

/** A feature name must be a safe slug: it becomes `backlog/impl_<name>.md`. */
export const FEATURE_NAME_RE = /^[A-Za-z0-9_-]+$/;

export type AddFeatureResult =
  | { status: "ok"; id: number }
  | { status: "duplicate_name" }
  | { status: "invalid_state"; errors: string[] }
  | { status: "write_error" };

export interface AddFeatureOptions {
  name: string;
  acceptance: readonly string[];
  title?: string | null;
  description?: string | null;
  dependsOn?: readonly number[] | null;
  /** Open period label to stamp at birth. `sprint open` only labels features
   *  that already exist, so without this a feature born inside an open period
   *  is never archived by `close`. */
  sprint?: string | null;
}

interface FeatureRecord {
  id?: number;
  name?: string;
  [k: string]: unknown;
}

/** Ids already handed out to archived features, so a new one never collides. */
function archivedMaxId(workspace: string): number {
  const path = join(workspace, "archive", "feature_archive.json");
  let max = 0;
  try {
    const archive = loadFeatureList<{ sprints?: Record<string, FeatureRecord[]> }>(path);
    for (const sprint of Object.values(archive.sprints ?? {})) {
      if (!Array.isArray(sprint)) {
        continue;
      }
      for (const f of sprint) {
        if (f && typeof f === "object" && typeof f.id === "number" && f.id > max) {
          max = f.id;
        }
      }
    }
  } catch {
    // no archive, or an unreadable one: live ids alone decide the next id
    return 0;
  }
  return max;
}

/**
 * Append a pending feature and return the id it was given.
 *
 * `workspace` is an already-resolved harness workspace. Writes through
 * `validateFeatureList`, so a result the `check_schema` gate would reject
 * aborts with the file untouched (the invariant feature 57 established).
 */
export function addFeature(workspace: string, opts: AddFeatureOptions): AddFeatureResult {
  const path = join(workspace, "feature_list.json");
  let data: { features?: FeatureRecord[] };
  try {
    data = loadFeatureList<{ features?: FeatureRecord[] }>(path);
  } catch {
    return { status: "write_error" };
  }
  if (!Array.isArray(data.features)) {
    data.features = [];
  }
  const features = data.features;
  if (features.some((f) => f && f.name === opts.name)) {
    return { status: "duplicate_name" };
  }

  let liveMax = 0;
  for (const f of features) {
    const id = typeof f.id === "number" ? f.id : 0;
    if (id > liveMax) {
      liveMax = id;
    }
  }
  const id = Math.max(liveMax, archivedMaxId(workspace)) + 1;

  const feature: FeatureRecord = {
    id,
    name: opts.name,
    title: opts.title ?? opts.name,
    description: opts.description ?? "",
    acceptance: [...opts.acceptance],
    status: "pending",
  };
  if (opts.sprint) {
    feature.sprint = opts.sprint;
  }
  if (opts.dependsOn && opts.dependsOn.length > 0) {
    feature.depends_on = [...new Set(opts.dependsOn)].sort((a, b) => a - b);
  }
  features.push(feature);

  const result = validateFeatureList(data);
  if (!result.valid) {
    return { status: "invalid_state", errors: result.errors };
  }
  try {
    saveFeatureList(path, data);
  } catch {
    return { status: "write_error" };
  }
  return { status: "ok", id };
}
