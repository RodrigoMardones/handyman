// Hub runner (feature 105, mastra_hub_command): ONE command boots the whole
// review stack, gateway-style — the handyman MCP over HTTP + `mastra dev`
// (Studio + agents) as children of this process, with the operator's env
// passed to the studio child. Thin driver: the orchestration lives in
// src/ports/hub.ts.
//
//   pnpm run-hub -- [--project <name|path>] [--mcp-port <n>]
//   node dist-bundle/run-hub.mjs --project hm-studio
//
// Flags:
//   --project <name|path>   driven project (registry NAME or absolute path —
//                           F101 resolution); default = cwd
//   --mcp-port <n>          MCP port; default 8177
// (No --studio-port: mastra dev 1.20.3 has no port flag — it picks the first
// free port from 4111 and the hub reports the real URL in its banner.)
// Stop with Ctrl+C: both children get SIGTERM, then SIGKILL after a grace
// window. Loopback-only, no auth — same exposure as studio-local.sh.
// The monorepo .env as the LOWEST-precedence layer (keys/model vars without
// exporting). We parse it ourselves instead of passing `mastra dev -e`: the
// dev command re-assigns the file into process.env unconditionally and would
// clobber the hub wiring (HANDYMAN_PROJECT_ROOT & co). See hub.ts.
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handymanRoot,
  resolveHandymanAssetsDir,
  resolveProjectRoot,
} from './src/ports/harness-install';
import { parseEnvFile, runHub } from './src/ports/hub';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const USAGE =
  'usage: run-hub [--project <registry-name|abs-path>] [--mcp-port <n>]  (Ctrl+C stops everything)';

function flagValue(flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const unknown = argv.filter((a, i) => a.startsWith('--') && !['--project', '--mcp-port'].includes(a) && argv[i - 1] !== '--project' && argv[i - 1] !== '--mcp-port');
if (unknown.length > 0) {
  console.error(`unknown flag(s): ${unknown.join(', ')}\n${USAGE}`);
  process.exit(2);
}

const mcpPortRaw = flagValue('--mcp-port') ?? '8177';
const mcpPort = Number(mcpPortRaw);
if (!Number.isInteger(mcpPort) || mcpPort <= 0 || mcpPort > 65535) {
  console.error(`invalid --mcp-port '${mcpPortRaw}': expected an integer 1-65535`);
  process.exit(2);
}

// The package root: source layout has run-hub.ts AT the package root; the
// F102 bundle puts it in dist-bundle/ — the studio child's cwd must be the
// package dir either way (`mastra dev -d studio` resolves relative to cwd).
const here = dirname(fileURLToPath(import.meta.url));
const packageDir = basename(here) === 'dist-bundle' ? dirname(here) : here;

const root = handymanRoot(process.env);
const projectRoot = resolveProjectRoot(flagValue('--project'), root) ?? process.cwd();
const assetsDir = resolveHandymanAssetsDir(process.env);
const handymanMcpEntry = join(assetsDir, 'dist', 'mcp.js');
if (!existsSync(handymanMcpEntry)) {
  console.error(
    `cannot boot the hub: ${handymanMcpEntry} does not exist — build the handyman toolchain ` +
      `(npm run build in handyman/).`,
  );
  process.exit(1);
}
const envFile = join(packageDir, '..', '..', '.env');

const code = await runHub({
  projectRoot,
  handymanRoot: root,
  handymanMcpEntry,
  packageDir,
  mcpPort,
  dotenvVars: existsSync(envFile) ? parseEnvFile(envFile) : undefined,
  env: process.env,
});
process.exit(code);
