// Hub orchestration port (feature 105, mastra_hub_command): the logic behind
// run-hub.ts — ONE command boots the whole review stack, gateway-style:
//   child 1  handyman MCP over HTTP (node <assetsDir>/dist/mcp.js --http
//            --host 127.0.0.1 --port <mcpPort>) with an active health-wait;
//   child 2  `mastra dev` (Studio + the agents) pointed at that MCP.
//
// Everything injectable (spawn/fetch/sleep/log/onSignal) so the orchestration
// is unit-tested without real children. Conventions verified against the
// installed toolchain (2026-07-29):
//   - mastra dev (CLI 1.20.3) has NO --port flag: it picks the first free
//     port from 4111+21 and logs `Mastra Studio running` with
//     `http://localhost:<port>` — the hub reads the REAL Studio URL from the
//     child's stdout instead of guessing.
//   - The mastra bin (node_modules/.bin/mastra) is a sh shim; the real entry
//     is <mastra pkg>/dist/index.js (spawned with process.execPath, so node
//     resolution does not depend on PATH).
//   - The MCP answers ANY HTTP POST at /mcp when listening (same probe
//     semantics as scripts/studio-local.sh).
import { spawn as nodeSpawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export interface HubOptions {
  /** Driven project, already resolved to an absolute path (F101). */
  projectRoot: string;
  /** Machine-global handyman root (registry). */
  handymanRoot: string;
  /** <handymanAssetsDir>/dist/mcp.js (F101/F104 resolution). */
  handymanMcpEntry: string;
  /** This package's dir — cwd of the `mastra dev` child (it writes .mastra/
   *  and resolves `-d studio` relative to cwd, like scripts/studio-local.sh). */
  packageDir: string;
  /** MCP port (default 8177 in run-hub.ts). */
  mcpPort: number;
  /** Vars parsed from an env file (the monorepo .env convenience — keys and
   *  model vars without exporting them). Merged with the LOWEST precedence
   *  (operator env wins over the file; the hub wiring wins over both). We do
   *  NOT pass `mastra dev -e`: the dev command re-assigns the file into
   *  process.env unconditionally (DevBundler.loadEnvVars →
   *  `for (const [k,v] of loadedEnv) process.env[k] = v` — verified in the
   *  mastra 1.20.3 dist), which would CLOBBER the hub's wiring vars
   *  (HANDYMAN_PROJECT_ROOT & co — a .env carrying them hijacks the stack). */
  dotenvVars?: Record<string, string> | undefined;
  /** Operator env — passthrough source for the studio child. */
  env: NodeJS.ProcessEnv;
}

export interface SpawnPlan {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
}

/** Real JS entry of the mastra CLI (the .bin/mastra shim execs node on it). */
export function mastraCliEntry(): string {
  const pkg = createRequire(import.meta.url).resolve('mastra/package.json');
  return join(dirname(pkg), 'dist', 'index.js');
}

/** MCP child: minimal env, like the F104 stdio spawn (registry + git only). */
export function mcpSpawnPlan(opts: HubOptions): SpawnPlan {
  return {
    command: process.execPath,
    args: [
      opts.handymanMcpEntry,
      '--http',
      '--host',
      '127.0.0.1',
      '--port',
      String(opts.mcpPort),
    ],
    env: {
      PATH: opts.env.PATH ?? '',
      HOME: opts.env.HOME ?? '',
      HANDYMAN_ROOT: opts.handymanRoot,
    },
  };
}

/** Studio child: FULL operator env passthrough (this child runs the agents —
 *  it needs the LLM keys, unlike the MCP child) over the dotenv-file vars,
 *  plus the wiring overrides. DATA/TELEMETRY flow only when the operator
 *  exported them (the F101 defaults apply inside the child otherwise). */
export function studioSpawnPlan(opts: HubOptions): SpawnPlan {
  const env: Record<string, string> = { ...(opts.dotenvVars ?? {}) };
  for (const [key, value] of Object.entries(opts.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env.HANDYMAN_PROJECT_ROOT = opts.projectRoot;
  env.HANDYMAN_MCP_URL = `http://127.0.0.1:${opts.mcpPort}/mcp`;
  env.HANDYMAN_ROOT = opts.handymanRoot;
  return {
    command: process.execPath,
    args: [mastraCliEntry(), 'dev', '-d', 'studio'],
    env,
    cwd: opts.packageDir,
  };
}

/** Minimal dotenv parse (KEY=VALUE lines, optional `export ` prefix and
 *  matching surrounding quotes; `#` comments and blanks skipped). Enough for
 *  the house .env — no interpolation, no multiline. */
export function parseEnvFile(path: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return {};
  }
  const vars: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = (rawValue ?? '').trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    }
    if (key) vars[key] = value;
  }
  return vars;
}

/** First loopback URL IN THE MASTRA DEV PORT WINDOW found in a child output
 *  line — how the real Studio URL is detected. mastra dev (1.20.3) has no
 *  --port flag: it picks the first free port from 4111..4131 (getPort over
 *  4111+i, i<21 — verified in the dist) and logs `Mastra Studio running`
 *  with it. The window filter matters: the agents' own boot log prints the
 *  MCP URL (`[mcp] connected to http://127.0.0.1:<mcpPort>/mcp`) inside the
 *  studio child's output — a naive first-URL match picks THAT. */
export function extractLocalUrl(line: string): string | undefined {
  const match = /https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)\/?/.exec(line);
  if (!match?.[1]) return undefined;
  const port = Number(match[1]);
  return port >= 4111 && port <= 4131 ? match[0] : undefined;
}

/** Poll an HTTP endpoint until ANY response (even 4xx = listening). Throws
 *  on timeout, or immediately when the watched child died (a dead child
 *  after a successful poll means the port belongs to SOMEONE ELSE). */
export async function waitForHttp(
  url: string,
  what: string,
  deps: {
    fetchFn?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    isAlive?: () => boolean;
    timeoutMs?: number;
    intervalMs?: number;
  } = {},
): Promise<void> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = deps.timeoutMs ?? 30_000;
  const intervalMs = deps.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (deps.isAlive && !deps.isAlive()) {
      throw new Error(`${what} died before answering at ${url}`);
    }
    try {
      await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${what} at ${url}`);
    }
    await sleep(intervalMs);
  }
}

/** Minimal child shape the orchestration needs (structural — fakes in tests). */
export interface HubChild {
  readonly name: string;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  kill(signal: string): unknown;
  once(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
}

export interface HubDeps {
  spawn?: (plan: SpawnPlan, name: string) => HubChild;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  onSignal?: (signal: NodeJS.Signals, handler: () => void) => void;
  mcpTimeoutMs?: number;
  studioTimeoutMs?: number;
  /** Delay between "MCP answers" and the liveness re-check (bind failures
   *  surface within this window — catches a port owned by another process
   *  whose server ALSO answers the probe). */
  mcpSettleMs?: number;
  killGraceMs?: number;
}

function defaultSpawn(plan: SpawnPlan, name: string): HubChild {
  const child = nodeSpawn(plan.command, plan.args, {
    env: plan.env,
    cwd: plan.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    name,
    stdout: child.stdout,
    stderr: child.stderr,
    kill: (signal) => child.kill(signal as NodeJS.Signals),
    once: (event, listener) => child.once(event, listener),
  };
}

/** Multiplex a child's stdout/stderr into prefixed log lines; `onLine` also
 *  sees every line (the Studio URL watcher). */
function muxLines(child: HubChild, log: (line: string) => void, onLine?: (line: string) => void) {
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line === '') continue;
        log(`[${child.name}] ${line}`);
        onLine?.(line);
      }
    });
  }
}

/** Boot both children, print the access banner when healthy, and run until a
 *  signal or a child death. Returns the process exit code:
 *  0 on operator shutdown (SIGINT/SIGTERM); the child's code when a child
 *  dies unexpectedly; 1 when a child never becomes healthy. */
export async function runHub(opts: HubOptions, deps: HubDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const spawn = deps.spawn ?? defaultSpawn;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const onSignal = deps.onSignal ?? ((signal, handler) => process.on(signal, handler));
  const mcpUrl = `http://127.0.0.1:${opts.mcpPort}/mcp`;

  // 1. MCP child + active health-wait (the port could be owned by another
  //    process: our child then dies on bind — surfaced as an actionable
  //    error naming the port and the --mcp-port escape hatch).
  const mcp = spawn(mcpSpawnPlan(opts), 'mcp');
  muxLines(mcp, log);
  let mcpAlive = true;
  mcp.once('exit', () => {
    mcpAlive = false;
  });
  const mcpPortHint = `port ${opts.mcpPort} — if another process owns it, free it or pass --mcp-port <free>`;
  try {
    await waitForHttp(mcpUrl, 'the MCP child', {
      fetchFn: deps.fetchFn,
      sleep,
      isAlive: () => mcpAlive,
      timeoutMs: deps.mcpTimeoutMs,
    });
    await sleep(deps.mcpSettleMs ?? 500);
    if (!mcpAlive) throw new Error('the MCP child died right after the port answered');
  } catch (error) {
    log(`[hub] error: the MCP did not come up at ${mcpUrl} (${mcpPortHint}): ${(error as Error).message}`);
    mcp.kill('SIGTERM');
    return 1;
  }

  // 2. Studio child; the real URL comes from its stdout (mastra dev picks
  //    the first free port from 4111 and logs it — no --port flag exists).
  const studio = spawn(studioSpawnPlan(opts), 'studio');
  let studioAlive = true;
  let studioUrl: string | undefined;
  muxLines(studio, log, (line) => {
    studioUrl ??= extractLocalUrl(line);
  });
  studio.once('exit', () => {
    studioAlive = false;
  });
  const studioDeadline = Date.now() + (deps.studioTimeoutMs ?? 120_000);
  while (!studioUrl && studioAlive && Date.now() < studioDeadline) {
    await sleep(200);
  }
  if (!studioUrl) {
    log(
      `[hub] error: Studio did not report its URL within ${deps.studioTimeoutMs ?? 120_000}ms ` +
        `(child ${studioAlive ? 'still running without a ready line' : 'exited early'}) — see [studio] lines above.`,
    );
    studio.kill('SIGTERM');
    mcp.kill('SIGTERM');
    return 1;
  }

  // 3. Access banner — the stack is up.
  log(`[hub] review stack up:`);
  log(`[hub]   Studio:  ${studioUrl}`);
  log(`[hub]   MCP:     ${mcpUrl} (embedded child of this hub)`);
  log(`[hub]   project: ${opts.projectRoot} (pinned at the agents' MCP client)`);
  log(`[hub] Ctrl+C stops everything`);

  // 4. Lifecycle: SIGINT/SIGTERM → graceful stop of both children (SIGTERM,
  //    SIGKILL after the grace window) and exit 0; an unexpected child death
  //    reports WHICH child, kills the other and exits with the child's code.
  return new Promise<number>((resolve) => {
    const state = { exiting: false };
    const shutdown = (reason: string, code: number) => {
      if (state.exiting) return;
      state.exiting = true;
      log(`[hub] ${reason} — stopping children (SIGTERM, SIGKILL after ${deps.killGraceMs ?? 3000}ms)`);
      mcp.kill('SIGTERM');
      studio.kill('SIGTERM');
      void sleep(deps.killGraceMs ?? 3000).then(() => {
        try {
          mcp.kill('SIGKILL');
          studio.kill('SIGKILL');
        } catch {
          // already gone
        }
        resolve(code);
      });
    };
    onSignal('SIGINT', () => shutdown('SIGINT received', 0));
    onSignal('SIGTERM', () => shutdown('SIGTERM received', 0));
    mcp.once('exit', (code, signal) =>
      shutdown(`MCP child exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'null'})`, code ?? 1),
    );
    studio.once('exit', (code, signal) =>
      shutdown(`studio child exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'null'})`, code ?? 1),
    );
  });
}
