// Harness-install locator (feature mastra_runtime_decoupling): everything the
// runtime must FIND about the handyman toolchain installation — the assets
// dir (role templates + canonical SKILL.md), the toolbox CLI for boot-time
// auto-registration, the machine-global state root and the project registry —
// WITHOUT assuming the monorepo layout (<cwd>/../..), so the agent boots from
// any cwd against any registered project.
//
// Resolution is env-first everywhere; the installed `handyman-harness` npm
// package (a workspace dependency in the monorepo) is the portable anchor;
// HANDYMAN_REPO_ROOT survives only as a dev-checkout override/fallback.
// The registry/root semantics mirror @handyman/toolbox-core (registry.ts) and
// the MCP's resolveProject (handyman/src/mcp.ts) — duplicated LOCALLY on
// purpose: the agent does not take a toolbox-core dependency for two JSON
// reads and a basename match.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

/** Machine-global handyman state root (registry.json, agent data/logs):
 *  HANDYMAN_ROOT ?? ~/HANDYMAN, with ~ expanded (same rule as toolbox-core). */
export function handymanRoot(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.HANDYMAN_ROOT;
  if (raw) return resolve(raw.replace(/^~(?=$|\/)/, homedir()));
  return join(homedir(), 'HANDYMAN');
}

/** Directory of the installed handyman-harness package (holds assets/,
 *  SKILL.md and dist/), resolved through node's module resolution from THIS
 *  package — undefined when the package is not installed. */
export function handymanPackageDir(): string | undefined {
  try {
    return dirname(createRequire(import.meta.url).resolve('handyman-harness/package.json'));
  } catch {
    return undefined;
  }
}

/** Assets dir of the handyman package (role templates under assets/, the
 *  canonical SKILL.md at its root). Precedence: HANDYMAN_ASSETS_DIR >
 *  installed handyman-harness package > dev fallback
 *  <HANDYMAN_REPO_ROOT>/handyman. `packageDir`: pass null in tests to force
 *  "package not installed". Throws an actionable error when nothing resolves. */
export function resolveHandymanAssetsDir(
  env: NodeJS.ProcessEnv = process.env,
  packageDir: string | null | undefined = undefined,
): string {
  if (env.HANDYMAN_ASSETS_DIR) return env.HANDYMAN_ASSETS_DIR;
  const pkg = packageDir === undefined ? handymanPackageDir() : packageDir;
  if (pkg) return pkg;
  if (env.HANDYMAN_REPO_ROOT) return join(env.HANDYMAN_REPO_ROOT, 'handyman');
  throw new Error(
    'cannot locate the handyman assets (role templates, SKILL.md): set HANDYMAN_ASSETS_DIR, ' +
      'install the handyman-harness package, or point HANDYMAN_REPO_ROOT at a monorepo checkout.',
  );
}

/** project_root entries of $HANDYMAN_ROOT/registry.json. A missing or
 *  corrupt registry reads as empty (the resolve error then names the path). */
export function readRegistryRoots(root: string): string[] {
  try {
    const raw = readFileSync(join(root, 'registry.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { harnesses?: { project_root?: unknown }[] };
    return (parsed.harnesses ?? [])
      .map((entry) => entry.project_root)
      .filter((root): root is string => typeof root === 'string');
  } catch {
    return [];
  }
}

/** Resolve HANDYMAN_PROJECT_ROOT: an absolute path passes through untouched;
 *  anything else is a registry NAME (basename match, same rule and same
 *  error shapes as the MCP's resolveProject). undefined in → undefined out
 *  (the caller applies its own default). */
export function resolveProjectRoot(value: string | undefined, root: string): string | undefined {
  if (!value) return undefined;
  if (isAbsolute(value)) return value;
  const roots = readRegistryRoots(root);
  const matches = roots.filter((candidate) => basename(candidate) === value);
  if (matches.length === 0) {
    const names = roots.map((candidate) => basename(candidate)).join(', ');
    throw new Error(
      `project '${value}' is not registered in ${join(root, 'registry.json')}. ` +
        `Registered harnesses: ${names || '(none)'}. ` +
        'Pass a registered name, an absolute project root, or register it with ' +
        `'handyman toolbox register <root>'.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `project name '${value}' is ambiguous: ${matches.length} registered harnesses share it: ` +
        `${matches.join(', ')}. Pass the absolute project root instead of the name.`,
    );
  }
  return matches[0];
}

/** A resolved toolbox register invocation: the project root is appended to
 *  `args` by the caller. */
export interface ToolboxCommand {
  file: string;
  args: string[];
  /** Human-readable origin, for logs/warnings. */
  source: string;
}

/** First `name` executable found on PATH (sync stat per entry). */
function whichBin(name: string, env: NodeJS.ProcessEnv): string | undefined {
  for (const dir of (env.PATH ?? '').split(':')) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Toolbox register command, by precedence: HANDYMAN_TOOLBOX_CMD (a full
 *  command prefix, e.g. 'handyman toolbox register' — the project root is
 *  appended) > `handyman` bin on PATH (`handyman toolbox register`) >
 *  installed handyman-harness package (`node <pkg>/dist/cli.js toolbox
 *  register`) > dev fallback (`node <HANDYMAN_REPO_ROOT>/handyman/dist/
 *  toolbox.js register`). undefined = no way to register found.
 *  `packageDir`: pass null in tests to force "package not installed". */
export function resolveToolboxCommand(
  env: NodeJS.ProcessEnv = process.env,
  packageDir: string | null | undefined = undefined,
): ToolboxCommand | undefined {
  const override = env.HANDYMAN_TOOLBOX_CMD?.trim();
  if (override) {
    const [file, ...args] = override.split(/\s+/);
    return { file: file as string, args, source: 'HANDYMAN_TOOLBOX_CMD' };
  }
  const bin = whichBin('handyman', env);
  if (bin) return { file: bin, args: ['toolbox', 'register'], source: 'handyman bin on PATH' };
  const pkg = packageDir === undefined ? handymanPackageDir() : packageDir;
  if (pkg) {
    return {
      file: 'node',
      args: [join(pkg, 'dist', 'cli.js'), 'toolbox', 'register'],
      source: 'handyman-harness package',
    };
  }
  if (env.HANDYMAN_REPO_ROOT) {
    return {
      file: 'node',
      args: [join(env.HANDYMAN_REPO_ROOT, 'handyman', 'dist', 'toolbox.js'), 'register'],
      source: 'HANDYMAN_REPO_ROOT dev checkout',
    };
  }
  return undefined;
}
