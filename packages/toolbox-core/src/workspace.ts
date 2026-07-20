/**
 * Resolve the Handyman workspace directory for a project root.
 *
 * Faithful port of `validate_harness.resolve_workspace` (Python). The
 * precedence is, in order:
 *   1. `harness.config.json` -> `harness_workspace` key.
 *   2. `feature_list.json` -> `config.harness_workspace`.
 *   3. `.handyman/feature_list.json` exists -> `.handyman`.
 *   4. Fallback to `root`.
 *
 * A relative workspace value resolves against `root`; an absolute value is
 * returned unchanged. Malformed or unreadable JSON is swallowed (the rule
 * falls through to the next), mirroring the Python `try/except
 * (ValueError, OSError)`.
 */
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/**
 * Platform directories where role files (`.agent.md`) are allowed to live.
 * Promoted to the core from `validate_harness.py` so every CLI shares the same
 * definition (e.g. `tools_discovery` declares the same role roots).
 */
export const PLATFORM_ROLE_DIRS: readonly string[] = [".github/agents", ".claude/agents"];

/**
 * The four-status feature contract. Shared so the validator and any other CLI
 * agree on what a valid `status` value is.
 */
export const VALID_STATUS: readonly string[] = ["pending", "in_progress", "done", "blocked"];

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Read + parse a JSON file, swallowing parse/IO errors (returns undefined). */
function readJsonSwallow(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
}

/** True for a non-empty string workspace value (Python `if ws:` truthiness). */
function usableWorkspaceValue(ws: unknown): ws is string {
  return typeof ws === "string" && ws.length > 0;
}

function resolveAgainstRoot(root: string, ws: string): string {
  return isAbsolute(ws) ? ws : join(root, ws);
}

export function resolveWorkspace(root: string): string {
  const configPath = join(root, "harness.config.json");
  if (isFile(configPath)) {
    const data = readJsonSwallow(configPath);
    const ws =
      data && typeof data === "object"
        ? (data as Record<string, unknown>).harness_workspace
        : undefined;
    if (usableWorkspaceValue(ws)) {
      return resolveAgainstRoot(root, ws);
    }
  }

  const rootFeatureList = join(root, "feature_list.json");
  if (isFile(rootFeatureList)) {
    const data = readJsonSwallow(rootFeatureList);
    const config =
      data && typeof data === "object" ? (data as Record<string, unknown>).config : undefined;
    const ws =
      config && typeof config === "object"
        ? (config as Record<string, unknown>).harness_workspace
        : undefined;
    if (usableWorkspaceValue(ws)) {
      return resolveAgainstRoot(root, ws);
    }
  }

  if (isFile(join(root, ".handyman", "feature_list.json"))) {
    return join(root, ".handyman");
  }

  return root;
}
