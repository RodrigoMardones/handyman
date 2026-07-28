// Handyman runtime port (feature 98): the ONLY module in this package allowed
// to import handyman-harness/*. Everything the native tools need from the
// harness — the pure in-process handlers from dist/mcp.js and the async CLI
// subprocess runner — is re-exported from here; tool modules import from
// '../ports/handyman-runtime', never from handyman-harness directly.
//
// Two execution routes, mirroring the MCP server's contract:
//   - Pure/in-process handlers (reportWrite, handoff*, taskResult, harnessList,
//     metrics, fleet*, featureCloseAsync, buildResume): cheap and safe to call
//     in the agent event loop (their subprocesses are short-lived, read-only
//     observations, or a detached spawn).
//   - runHandymanCli / runVerifier: async spawn of the same dist/*.js CLIs the
//     roles run. The thin verb wrappers in dist/mcp.js (featureStart, verify,
//     sprintStatus, ...) are deliberately NOT re-exported: they use
//     execFileSync and would block the Flue event loop for minutes on the
//     verifier-gated paths.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildResume,
  featureCloseAsync,
  fleetHealth,
  fleetStatus,
  fleetTimeline,
  handoffClaim,
  handoffSubmit,
  harnessList,
  metrics,
  reportWrite,
  resolveProject,
  taskResult,
} from 'handyman-harness/mcp';
import type { JsonValue } from '../flue';

export {
  buildResume,
  featureCloseAsync,
  fleetHealth,
  fleetStatus,
  fleetTimeline,
  handoffClaim,
  handoffSubmit,
  harnessList,
  metrics,
  reportWrite,
  resolveProject,
  taskResult,
};

/** Harness project handle (name/root/workspace) as returned by resolveProject. */
export type HandymanProject = ReturnType<typeof resolveProject>;

/** Default per-call subprocess budget; verifier-gated verbs override to 15 min. */
const DEFAULT_TIMEOUT_MS = 120_000;
/** Same tail budget as the MCP server: the failing gate is always at the end. */
const CHARACTER_LIMIT = 20000;

function truncateTail(text: string): string {
  if (text.length <= CHARACTER_LIMIT) {
    return text;
  }
  return `[... truncated to the last ${CHARACTER_LIMIT} characters ...]\n${text.slice(-CHARACTER_LIMIT)}`;
}

/**
 * Directory containing the harness dist/*.js CLIs.
 *
 * Primary anchor: import.meta.resolve('handyman-harness/package.json'), which
 * follows the pnpm workspace symlink to the real package dir — correct under
 * vitest, flue dev, and the built server (flue build externalizes direct deps,
 * so the resolution always runs against this package's node_modules).
 * Fallback (kept for exotic runners without import.meta.resolve): the
 * cwd anchoring from src/agents/handyman-leader.ts — every documented runtime
 * runs with cwd = this package's dir, so repo root = cwd/../..
 */
export function handymanDistDir(): string {
  try {
    const packageJsonUrl = import.meta.resolve('handyman-harness/package.json');
    return join(dirname(fileURLToPath(packageJsonUrl)), 'dist');
  } catch {
    const repoRoot = process.env.HANDYMAN_REPO_ROOT ?? join(process.cwd(), '..', '..');
    return join(repoRoot, 'handyman', 'dist');
  }
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Extra CLI args after the injected `--root <projectRoot>`. */
  args?: string[];
  projectRoot: string;
  /** Kill + reject after this many ms (default 120_000). */
  timeoutMs?: number;
  /** Tool abort signal: kills the child and rejects. */
  signal?: AbortSignal;
}

/** Spawn a command; resolve with the exit code, never throw on non-zero. */
function spawnCollect(command: string, args: string[], options: RunOptions): Promise<CliResult> {
  const { projectRoot, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`subprocess timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
    }, timeoutMs);
    const onAbort = () => {
      child.kill('SIGKILL');
      reject(new Error('subprocess aborted by the caller'));
    };
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new Error('subprocess aborted by the caller'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('error', (e) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Run a sibling harness CLI (`node dist/<verb>.js --root <projectRoot> ...args`)
 * against a project root, async — the event-loop-safe replacement for the
 * execFileSync wrappers in dist/mcp.js. A non-zero exit is DATA (CLI refusals
 * such as a red verifier), never a thrown error; only timeouts, aborts, and
 * spawn failures reject.
 */
export function runHandymanCli(options: RunOptions & { verb: string }): Promise<CliResult> {
  const { verb, args = [], ...rest } = options;
  return spawnCollect(
    process.execPath,
    [join(handymanDistDir(), `${verb}.js`), '--root', options.projectRoot, ...args],
    rest,
  );
}

/**
 * Run the project verifier (`bash <verifier ?? projectRoot/init.sh>`). Same
 * async discipline as runHandymanCli; the verifier itself decides green/red
 * via its exit code, surfaced as data. Returns code 1 with a message when the
 * script does not exist (mirrors the MCP verify handler).
 */
export function runVerifier(options: RunOptions & { verifier?: string }): Promise<CliResult> {
  const { verifier, ...rest } = options;
  const script = verifier ?? join(options.projectRoot, 'init.sh');
  if (!existsSync(script)) {
    return Promise.resolve({ code: 1, stdout: '', stderr: `verifier not found: ${script}` });
  }
  return spawnCollect('bash', [script], rest);
}

/** Combined, tail-truncated subprocess output, MCP-style (`{ exit, output }`). */
export function cliOutput(result: CliResult): { exit: number; output: string } {
  return { exit: result.code, output: truncateTail(result.stdout + result.stderr).trim() };
}

/** JSON-safe tool payload: Flue snapshots a tool's run() result as JSON. */
export type Payload = { [key: string]: JsonValue };

/**
 * JSON boundary assertion for tool returns. The harness handlers declare
 * `Record<string, unknown>` / `unknown[]` in their .d.ts, but every value is
 * JSON in practice (parsed CLI output, plain records, strings) — this is the
 * one place where that is asserted instead of re-litigated per call site.
 */
export function json(value: unknown): Payload {
  return value as Payload;
}
