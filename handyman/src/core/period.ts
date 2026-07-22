/**
 * The open work period (historically "sprint"; since the branch-as-unit rework
 * the label is normally a branch slug such as `feat-rework-tools`).
 *
 * Extracted from `sprint.ts` so `feature add`/`start` can stamp new features
 * with the open period. `sprint open` only labels features that exist at open
 * time, so anything born afterwards stayed unlabeled and `close` never
 * archived it - the gap that stranded 19 done features in 2026-SP6.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, { encoding: "utf-8" }));
}

/** The open period id, preferring harness.config.json over the feature_list
 *  config mirror (same precedence as post_run). */
export function readCurrentSprint(root: string, workspace: string): string | null {
  const cfg = join(root, "harness.config.json");
  if (existsSync(cfg)) {
    try {
      const data = readJson(cfg) as Record<string, unknown>;
      const value = data.current_sprint;
      if (typeof value === "string" && value) {
        return value;
      }
      if (value === null && "current_sprint" in data) {
        return null;
      }
    } catch {
      // fall through to the feature_list mirror
    }
  }
  const fl = join(workspace, "feature_list.json");
  if (existsSync(fl)) {
    try {
      const data = readJson(fl) as { config?: Record<string, unknown> };
      const value = data.config?.current_sprint;
      if (typeof value === "string" && value) {
        return value;
      }
    } catch {
      // ignore
    }
  }
  return null;
}
