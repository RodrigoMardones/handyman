/**
 * toolBox observer runtime for apps/web (feature 43): the single-process
 * state that used to live in toolbox_serve.ts's serveMain closure -
 * providers built once from the environment, one SummaryCache, and the
 * debounced fs.watch hub feeding /events.
 *
 * One instance per Node process, held on globalThis so dev-mode HMR (which
 * re-evaluates modules) never arms a second watcher set. instrumentation.ts
 * calls getRuntime() at boot; route handlers and pages call it on demand
 * (first caller wins, everyone shares).
 *
 * Env contract (same as serve): keys come from process.env, optionally
 * filled from a .env file - serve reads the launch cwd, here overridable
 * with TOOLBOX_ENV_DIR because the standalone server's cwd is not the repo
 * root. Existing env always wins; HANDYMAN_ROOT picks the registry root.
 */
import { watch } from "node:fs";
import {
  buildProviders,
  DEBOUNCE_MS,
  handymanRoot,
  type LlmProvider,
  loadDotEnv,
  loadRegistry,
  resolveWorkspace,
  SummaryCache,
} from "@handyman/toolbox-core";
import { type ChangeHub, createChangeHub } from "./changeHub";

export interface ToolboxRuntime {
  hroot: string;
  providers: LlmProvider[];
  summaryCache: SummaryCache;
  hub: ChangeHub;
}

function createRuntime(): ToolboxRuntime {
  loadDotEnv(process.env.TOOLBOX_ENV_DIR ?? process.cwd());
  const hroot = handymanRoot(null);
  const hub = createChangeHub({
    debounceMs: DEBOUNCE_MS,
    listTargets: () => {
      // Same targets as serve's armWatchers: the toolBox root plus the
      // resolved workspace of every registered harness.
      const [registry] = loadRegistry(hroot);
      return [hroot, ...registry.harnesses.map((entry) => resolveWorkspace(entry.project_root))];
    },
    watchTarget: (target, onEvent) => {
      try {
        const watcher = watch(target, { recursive: true }, onEvent);
        watcher.on("error", () => watcher.close());
        return watcher;
      } catch {
        // missing directory: /api/state reports the harness as UNREADABLE
        return null;
      }
    },
  });
  hub.armWatchers();
  return {
    hroot,
    providers: buildProviders(process.env),
    summaryCache: new SummaryCache(),
    hub,
  };
}

const globalStore = globalThis as typeof globalThis & {
  __handymanToolboxRuntime?: ToolboxRuntime;
};

export function getRuntime(): ToolboxRuntime {
  globalStore.__handymanToolboxRuntime ??= createRuntime();
  return globalStore.__handymanToolboxRuntime;
}
