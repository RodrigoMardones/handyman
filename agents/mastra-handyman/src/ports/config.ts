// Config port: the SINGLE module that maps deployment env vars to a typed
// config object. Everything else in the package receives it by parameter
// (dependency injection) — no module-level process.env reads scattered
// across agent/port files. Provider API keys (Z_AI_API_KEY, KIMI_API_KEY)
// stay with the model-catalog port, which owns that concern.
//
// The runtime is DECOUPLED from the monorepo layout (feature
// mastra_runtime_decoupling): it boots from any cwd against any registered
// handyman project. Nothing defaults to <cwd>/../.. anymore — assets, the
// toolbox CLI and state dirs resolve from the installed handyman-harness
// package and the machine-global HANDYMAN_ROOT (see ports/harness-install.ts).
//
// Variable convention (documented in README and the run-*.ts headers):
//   HANDYMAN_PROJECT_ROOT  project the agents drive: the MCP "project" arg,
//                          workspace basePath and .handyman lookups. An
//                          ABSOLUTE PATH or a NAME from the handyman registry
//                          (basename match; unknown/ambiguous names fail at
//                          boot with an actionable error). Default = cwd.
//   HANDYMAN_ROOT          machine-global handyman state root (registry.json,
//                          agent data/logs); default = ~/HANDYMAN
//   HANDYMAN_MCP_URL       handyman MCP endpoint (node handyman/dist/mcp.js --http)
//   HANDYMAN_DATA_DIR      Mastra state dir (LibSQL memory/workflows + DuckDB
//                          observability); default =
//                          <HANDYMAN_ROOT>/agent/<harnessId>/data. ONE live
//                          process per dir: the DuckDB store takes an
//                          exclusive single-writer lock and the error is
//                          FATAL to the run — parallel runs MUST point at
//                          separate dirs. (The package npm scripts pin
//                          $PWD/data so the monorepo dev flow is unchanged.)
//   HANDYMAN_TELEMETRY_DIR per-feature telemetry JSONL dir; default =
//                          <HANDYMAN_ROOT>/agent/<harnessId>/logs (npm scripts
//                          pin $PWD/logs for dev)
//   HANDYMAN_ASSETS_DIR    handyman assets dir (role templates under assets/,
//                          canonical SKILL.md at its root); default = the
//                          installed handyman-harness package, else the dev
//                          fallback <HANDYMAN_REPO_ROOT>/handyman
//   HANDYMAN_REPO_ROOT     DEV-ONLY override: the monorepo checkout — last
//                          resort for the assets dir and the toolbox command.
//                          No default; not needed when handyman-harness is
//                          installed (it is, as a workspace dependency).
//   HANDYMAN_MODEL_CATALOG personal provider catalog path; default =
//                          <this package>/model-catalog.json (package-relative)
//   HANDYMAN_SKILL_DIRS    ':'-separated skill search scopes, replacing the
//                          default chain (<package>/skills >
//                          <project>/.agents/skills > <project>/.github/skills
//                          > ~/.agents/skills)
//   HANDYMAN_TOOLBOX_CMD   toolbox register command prefix for boot-time
//                          auto-registration (the project root is appended);
//                          default = `handyman` bin on PATH, else the
//                          handyman-harness package CLI, else the dev fallback
//   HANDYMAN_HARNESS_ID    monitoring identity of the driven harness (span
//                          attribute handyman.harness.id); default = the
//                          project_name of <projectRoot>/harness.config.json,
//                          else the project dir basename
//   HANDYMAN_HARNESS_REGISTER  'off' disables the boot-time auto-registration
//                          of the project into the handyman registry
//                          (registry.json) — on by default
//   GITHUB_TOKEN / GH_TOKEN  enables GitHub's hosted MCP server for the
//                          leader (absent = handyman MCP only)
//   HANDYMAN_{LEADER,IMPLEMENTER,REVIEWER}_MODEL  per-role 'provider/model'
//                          specs (defaults in the model-catalog port)
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handymanRoot, resolveHandymanAssetsDir, resolveProjectRoot } from './harness-install';
import { resolveRoleModels } from './model-catalog';

/** This package's own root (src/ports/config.ts → ../..): the anchor for
 *  package-shipped files (model-catalog.json, skills/). */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface AppConfig {
  /** Dev-only monorepo override (HANDYMAN_REPO_ROOT). No default: assets and
   *  the toolbox command resolve via the handyman-harness package. */
  repoRoot: string | undefined;
  /** Handyman assets dir (role templates under assets/, canonical SKILL.md
   *  at its root) — env > installed handyman-harness package > dev fallback. */
  handymanAssetsDir: string;
  /** Machine-global handyman state root (registry.json; agent data/logs). */
  handymanRoot: string;
  /** Project the agents drive (absolute path): MCP project arg, workspace
   *  basePath, .handyman/memory + backlog reads. HANDYMAN_PROJECT_ROOT may
   *  name a registry entry; resolution happens here, at boot. */
  projectRoot: string;
  /** Handyman MCP endpoint URL. */
  mcpUrl: string;
  /** Mastra state dir (memory/workflows DB + observability). Single writer:
   *  one live process per dir. */
  dataDir: string;
  /** Per-feature telemetry JSONL output dir. */
  telemetryDir: string;
  /** Personal model catalog path (extra Anthropic-protocol providers). */
  modelCatalogPath: string;
  /** Token for GitHub's hosted MCP server (leader only); undefined = off. */
  githubToken: string | undefined;
  /** Monitoring identity of the driven harness: stamped as the
   *  handyman.harness.id span attribute on every exported span. Derived from
   *  HANDYMAN_HARNESS_ID, else harness.config.json's project_name, else the
   *  project dir basename. */
  harnessId: string;
  /** Per-role 'provider/model' specs. */
  models: ReturnType<typeof resolveRoleModels>;
}

/** project_name from <projectRoot>/harness.config.json (tolerant read). */
function harnessConfigName(projectRoot: string): string | undefined {
  try {
    const raw = readFileSync(join(projectRoot, 'harness.config.json'), 'utf-8');
    const name = (JSON.parse(raw) as { project_name?: unknown }).project_name;
    return typeof name === 'string' && name.trim() !== '' ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Read the deployment config from env. Pure — pass a fake env in tests. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const root = handymanRoot(env);
  const projectRoot = resolveProjectRoot(env.HANDYMAN_PROJECT_ROOT, root) ?? process.cwd();
  const harnessId =
    env.HANDYMAN_HARNESS_ID ?? harnessConfigName(projectRoot) ?? basename(projectRoot);
  return {
    repoRoot: env.HANDYMAN_REPO_ROOT,
    handymanAssetsDir: resolveHandymanAssetsDir(env),
    handymanRoot: root,
    projectRoot,
    mcpUrl: env.HANDYMAN_MCP_URL ?? 'http://127.0.0.1:8177/mcp',
    dataDir: env.HANDYMAN_DATA_DIR ?? join(root, 'agent', harnessId, 'data'),
    telemetryDir: env.HANDYMAN_TELEMETRY_DIR ?? join(root, 'agent', harnessId, 'logs'),
    modelCatalogPath: env.HANDYMAN_MODEL_CATALOG ?? join(PACKAGE_ROOT, 'model-catalog.json'),
    githubToken: env.GITHUB_TOKEN ?? env.GH_TOKEN,
    harnessId,
    models: resolveRoleModels(env),
  };
}
