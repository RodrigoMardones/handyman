/**
 * Runtime loader for buildState (feature 43).
 *
 * The handyman CLI package CANNOT be bundled: its modules resolve on-disk
 * assets relative to import.meta.url (SKILL.md for the skill version, the
 * intake template, the panel asset), and both Next bundlers rewrite
 * import.meta.url when they inline a symlinked workspace package -
 * serverExternalPackages does not exempt packages whose real path lives
 * outside node_modules. So the state entrypoint is loaded at RUNTIME as
 * plain ESM, through a dynamic import whose specifier is a variable (opaque
 * to the bundler), from the real workspace layout on disk.
 *
 * The repo root is found by walking up from cwd until the handyman dist
 * entry exists - this covers `next dev`/`next start` (cwd: apps/web) and
 * the standalone server (cwd: .next/standalone/apps/web, still inside the
 * repo since the observer is a local tool). TOOLBOX_REPO_ROOT overrides the
 * walk for exotic launch layouts (the Fase-4 CLI wrapper sets it).
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STATE_ENTRY = join("handyman", "dist", "toolbox_state.js");
const MAX_WALK_UP = 8;

export type BuildStateFn = (hroot: string) => Record<string, unknown>;

export type GraphFileResult =
  | { status: "unknown_harness" }
  | { status: "no_export" }
  | { status: "ok"; text: string; type: string };

/** Outcome of registering a feature in a fleet harness (feature 60). */
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

export type AddFeatureForRootFn = (
  hroot: string,
  root: string,
  name: string,
  acceptance: readonly string[],
  opts?: { title?: string | null; description?: string | null },
) => AddFeatureForRootResult;

/** The handyman web entry (dist/toolbox_state.js): state + served assets. */
export interface ToolboxEntry {
  buildState: BuildStateFn;
  vendorText: (name: string) => string | null;
  graphFile: (hroot: string, wanted: string, kind: "html" | "json") => GraphFileResult;
  addFeatureForRoot: AddFeatureForRootFn;
}

function findRepoRoot(): string {
  const override = process.env.TOOLBOX_REPO_ROOT;
  if (override && existsSync(join(override, STATE_ENTRY))) {
    return resolve(override);
  }
  let dir = process.cwd();
  for (let i = 0; i < MAX_WALK_UP; i++) {
    if (existsSync(join(dir, STATE_ENTRY))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    `toolbox state entry not found walking up from ${process.cwd()} (set TOOLBOX_REPO_ROOT)`,
  );
}

const globalStore = globalThis as typeof globalThis & {
  __handymanToolboxEntry?: Promise<ToolboxEntry>;
};

// Turbopack rewrites even variable dynamic imports into a runtime stub
// ("Cannot find module as expression is too dynamic"), so the import is
// built through Function: a genuine native import() the bundler cannot see.
const nativeImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<unknown>;

/** Load (once per process) the handyman web entry from handyman/dist. */
export function getToolboxEntry(): Promise<ToolboxEntry> {
  globalStore.__handymanToolboxEntry ??= (async () => {
    const entryUrl = pathToFileURL(join(findRepoRoot(), STATE_ENTRY)).href;
    return (await nativeImport(entryUrl)) as ToolboxEntry;
  })();
  return globalStore.__handymanToolboxEntry;
}

/** Convenience: just buildState (pages + /api/state). */
export async function getBuildState(): Promise<BuildStateFn> {
  return (await getToolboxEntry()).buildState;
}

/** handyman/assets on disk: the intake template dir the draft relay needs
 * (buildDraftSystem takes it explicitly since feature 42 - the core package
 * cannot know the handyman skill-asset location). */
export function getHandymanAssetsDir(): string {
  return join(findRepoRoot(), "handyman", "assets");
}
