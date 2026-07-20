/**
 * Handyman toolBox registry: the on-disk list of registered harness roots.
 *
 * Moved verbatim from handyman/src/toolbox.ts (feature 42) so the data layer
 * is importable without the CLI. The registry doubles as the read allowlist
 * for the observer's md/graph/tag endpoints (see state.ts): a path resolves
 * only inside a REGISTERED project root or its resolved workspace.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveWorkspace } from "./workspace.js";

export interface RegistryEntry {
  project_root: string;
  registered: string;
}

export interface Registry {
  version: number;
  harnesses: RegistryEntry[];
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** toolBox root: --handyman-root flag, else $HANDYMAN_ROOT, else ~/HANDYMAN. */
export function handymanRoot(cliOverride: string | null): string {
  if (cliOverride) {
    return resolve(cliOverride.replace(/^~(?=$|\/)/, homedir()));
  }
  const env = process.env.HANDYMAN_ROOT;
  if (env) {
    return resolve(env.replace(/^~(?=$|\/)/, homedir()));
  }
  return join(homedir(), "HANDYMAN");
}

export function registryPath(hroot: string): string {
  return join(hroot, "registry.json");
}

/**
 * Return [registry, error]. Missing file -> empty registry, no error.
 * A corrupted registry is returned empty WITH an error so read-only
 * commands can degrade while writing commands refuse to clobber it.
 */
export function loadRegistry(hroot: string): [Registry, string | null] {
  const empty: Registry = { version: 1, harnesses: [] };
  const path = registryPath(hroot);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return [empty, null];
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [empty, `registry does not parse: ${path}`];
  }
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !Array.isArray((data as Record<string, unknown>).harnesses)
  ) {
    return [empty, `registry has no 'harnesses' array: ${path}`];
  }
  const record = data as Record<string, unknown>;
  const harnesses = (record.harnesses as unknown[])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && !Array.isArray(e))
    .map((e) => ({
      project_root: String(e.project_root ?? ""),
      registered: String(e.registered ?? ""),
    }));
  return [{ version: Number(record.version ?? 1), harnesses }, null];
}

export function saveRegistry(hroot: string, data: Registry): void {
  mkdirSync(hroot, { recursive: true });
  writeFileSync(registryPath(hroot), `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

/** A registrable root resolves a workspace holding feature_list.json. */
export function isHarnessRoot(root: string): boolean {
  return isFile(join(resolveWorkspace(root), "feature_list.json"));
}
