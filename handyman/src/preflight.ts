#!/usr/bin/env node
/**
 * Handyman preflight: read-only stability gate run before feature work.
 *
 * Faithful port of `scripts/preflight.py`. A thin orchestrator that reports
 * harness stability by *reusing* the existing deterministic CLIs instead of
 * reimplementing them:
 *
 *   - format   : node dist/validate_harness.js   (structure + feature_list contract)
 *   - drift    : node dist/upgrade_harness.js --check  (version drift vs the skill)
 *   - sync     : node dist/update_harness.js --check   (config <-> role-file audit)
 *   - discovery: node dist/tools_discovery.js check    (declared skills + MCPs)
 *   - worklist : node dist/feature.js ready       (claimable work + loop stop)
 *
 * Every sibling CLI now runs on Node (`dist/`); there are no Python siblings left.
 *
 * It writes nothing. It is a *stability* report, not a quality gate: the
 * blocking checks already live in `validate` (a phase of `init.sh`), so this
 * script exits 0 by default and surfaces drift/sync/discovery as `NOTE`s for
 * the operator to act on. Applying fixes (migrations, role-file rewrites)
 * stays a human decision (managed vs project-owned); the gate only makes
 * instability visible.
 *
 * With `--strict` (opt-in, meant for CI of harness repos) the report exits
 * non-zero when drift is BEHIND, sync reports DRIFT, or discovery reports a
 * MISSING declaration. Format stays out of strict: it already blocks in the
 * verifier's `validate` phase.
 *
 * Usage:
 *   node dist/preflight.js [--root PATH] [--strict]
 *
 * Exit codes:
 *   0  stable (always, without --strict; read-only stability report)
 *   1  --strict only: drift/sync/discovery reported a problem
 *   2  usage error
 */
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWorkspace } from "./core/index.js";

/**
 * Package root: both `src/` (vitest) and `dist/` (built) sit one level below
 * it, so `..` from either resolves to the same `handyman/` directory that
 * holds `dist/` (all the Node sibling CLIs), mirroring Python
 * `SCRIPT_DIR.parent` (`SCRIPT_DIR` was `scripts/`, since `preflight.py`
 * lived there).
 */
const HANDYMAN_ROOT = fileURLToPath(new URL("..", import.meta.url));

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The line boundaries of Python `str.splitlines()`: LF, VT, FF, CR, FS, GS,
 *  RS, NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR (CRLF counts as one). Local
 *  duplicate of `core/frontmatter.ts`'s `splitLines` (established precedent:
 *  small string-shape helpers are duplicated per-port rather than shared). */
const LINE_BREAKS = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029]);

function pySplitLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (LINE_BREAKS.has(code)) {
      lines.push(text.slice(start, i));
      i += code === 0x0d && text.charCodeAt(i + 1) === 0x0a ? 2 : 1;
      start = i;
    } else {
      i += 1;
    }
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
}

/** Python `repr()` of a string: quote selection, backslash/quote escapes, and
 *  `\xNN` for Latin-1 control characters; printable non-ASCII stays literal.
 *  Local duplicate of the `pyRepr` established by the sibling ports. */
function pyRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\" || ch === quote) {
      out += `\\${ch}`;
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else if (code < 0x20 || (code >= 0x7f && code <= 0xa0)) {
      out += `\\x${code.toString(16).padStart(2, "0")}`;
    } else {
      out += ch;
    }
  }
  return out + quote;
}

// --- subprocess fan-out -------------------------------------------------------

/**
 * Run a command, return `[exit_code, combined_output]`. Never throws.
 * Mirrors Python `subprocess.run(cmd, capture_output=True, text=True,
 * timeout=60, check=False)`: stdout and stderr are captured as two separate
 * buffers and concatenated stdout-then-stderr (not interleaved line by
 * line) - `(proc.stdout or "") + (proc.stderr or "")`.
 */
function run(cmd: readonly [string, ...string[]]): [number, string] {
  const [bin, ...args] = cmd;
  let result: SpawnSyncReturns<string>;
  try {
    result = spawnSync(bin, args, { timeout: 60_000, encoding: "utf-8" });
  } catch (exc) {
    return [
      127,
      `could not run ${cmd.join(" ")}: ${exc instanceof Error ? exc.message : String(exc)}`,
    ];
  }
  if (result.error) {
    return [127, `could not run ${cmd.join(" ")}: ${result.error.message}`];
  }
  const out = (result.stdout ?? "") + (result.stderr ?? "");
  const code = result.status ?? 127;
  return [code, out];
}

function block(title: string, status: string, detail: string): void {
  process.stdout.write(`--> ${title}: ${status}\n`);
  const trimmed = detail.trim();
  if (trimmed !== "") {
    for (const line of pySplitLines(trimmed)) {
      process.stdout.write(`    ${line}\n`);
    }
  }
}

function preflight(root: string, strict: boolean): number {
  const workspace = resolveWorkspace(root);
  const problems: string[] = [];
  process.stdout.write(`==> harness: ${root}\n`);
  process.stdout.write(`    workspace: ${workspace}\n`);
  process.stdout.write("==> preflight (read-only stability report)\n");

  // --- format: structure + feature_list contract ----------------------------
  const validateJs = join(HANDYMAN_ROOT, "dist", "validate_harness.js");
  let [rc, out] = run(["node", validateJs, "--root", root]);
  block("format", rc === 0 ? "OK" : "GAPS", out);

  // --- drift: version drift vs the current skill -----------------------------
  const upgradeJs = join(HANDYMAN_ROOT, "dist", "upgrade_harness.js");
  [rc, out] = run(["node", upgradeJs, "--check", "--root", root]);
  block("drift", rc === 0 ? "OK" : "BEHIND", out);
  if (rc !== 0) {
    problems.push("drift BEHIND");
  }

  // --- sync: config <-> role-file drift ---------------------------------------
  const updateJs = join(HANDYMAN_ROOT, "dist", "update_harness.js");
  [rc, out] = run(["node", updateJs, "--check", "--root", root]);
  block("sync", rc === 0 ? "OK" : "NOTE", out);
  if (rc !== 0) {
    problems.push("sync DRIFT");
    process.stdout.write(
      "    recommended for safety: run " +
        "'node dist/update_harness.js --sync' to reconcile role files to " +
        "the config before starting work\n",
    );
  }

  // --- discovery: declared skills + MCPs --------------------------------------
  const toolsDiscoveryJs = join(HANDYMAN_ROOT, "dist", "tools_discovery.js");
  [rc, out] = run(["node", toolsDiscoveryJs, "--root", root, "check"]);
  block("discovery", rc === 0 ? "OK" : "NOTE", out);
  if (rc !== 0) {
    problems.push("discovery MISSING");
  }

  // --- context: graphify graph freshness (advisory, never strict) ------------
  // The graph is the context layer agents query before exploring code; one
  // older than the last commit answers about a repo that no longer exists.
  // Silent when the harness has no graph or no git history (fixtures).
  const graphJson = join(root, "graphify-out", "graph.json");
  let graphStat: ReturnType<typeof statSync> | null = null;
  try {
    graphStat = statSync(graphJson);
  } catch {
    graphStat = null;
  }
  if (graphStat?.isFile()) {
    const [rcGit, headTs] = run(["git", "-C", root, "log", "-1", "--format=%ct"]);
    const commitSec = Number(headTs.trim());
    if (rcGit === 0 && Number.isFinite(commitSec)) {
      if (graphStat.mtimeMs < commitSec * 1000) {
        block(
          "context",
          "NOTE",
          "graphify-out/graph.json is older than the last commit - " +
            "run '/graphify --update' before querying it",
        );
      } else {
        block("context", "OK", "");
      }
    }
  }

  // --- worklist: claimable work + the unattended-loop stop condition ---------
  const featureJs = join(HANDYMAN_ROOT, "dist", "feature.js");
  [rc, out] = run(["node", featureJs, "--root", root, "ready"]);
  block("worklist", rc === 0 ? "OK" : "NOTE", out);
  if (rc === 3) {
    process.stdout.write(
      "    loop stop condition: nothing pending is ready - blocked or " +
        "dependency-gated work needs a human decision, not another session\n",
    );
  }

  if (strict && problems.length > 0) {
    process.stdout.write(`==> preflight: STRICT failure (${problems.join(", ")})\n`);
    process.stdout.write("next: fix the reported problems above, then re-run\n");
    process.stdout.write("status: error\n");
    return 1;
  }
  process.stdout.write(
    "==> preflight: stability report complete " +
      (strict ? "(strict; stable)" : "(read-only; exit 0)") +
      "\n",
  );
  // Observation shape: a stable machine-readable tail (next: hint when
  // applicable, status: always last) so callers never parse prose.
  if (problems.length > 0) {
    process.stdout.write("next: act on the NOTE blocks above before starting feature work\n");
    process.stdout.write("status: warn\n");
  } else {
    process.stdout.write("status: ok\n");
  }
  return 0;
}

// --- argparse-compatible CLI --------------------------------------------------

/**
 * Prog name kept as the historical `.py` literal (not `.js`, not the argv0
 * basename) so `--help`/usage/error output stays byte-identical with the
 * Python oracle's own argparse output without needing any normalization -
 * same convention as `validate_harness.ts`, `update_harness.ts` and
 * `upgrade_harness.ts` (argparse's `prog` defaults to
 * `os.path.basename(sys.argv[0])`, which was `preflight.py`).
 */
const PROG = "preflight.py";

function usage(): string {
  return `usage: ${PROG} [-h] [--root ROOT] [--strict]\n`;
}

function helpText(): string {
  return (
    usage() +
    "\n" +
    "Read-only stability report run before feature work. Reuses validate_harness,\n" +
    "upgrade_harness, update_harness and tools_discovery. Exits 0 unless --strict\n" +
    "finds a problem.\n" +
    "\n" +
    "options:\n" +
    "  -h, --help   show this help message and exit\n" +
    "  --root ROOT  Project root of the harness.\n" +
    "  --strict     Exit non-zero when drift/sync/discovery report a problem (opt-\n" +
    "               in, for CI).\n"
  );
}

/** argparse `parser.error(...)`: usage to stderr, `prog: error: msg`, exit 2. */
function exitUsage(message: string): never {
  process.stderr.write(usage());
  process.stderr.write(`${PROG}: error: ${message}\n`);
  process.exit(2);
}

/**
 * True when a token reads as an option, not a positional (argparse
 * heuristic). Tokens that look like negative numbers are positionals:
 * argparse's `_negative_number_matcher` (`^-\d+$|^-\d*\.\d+$`) exempts them
 * because no registered option string here looks like a negative number. A
 * token that contains a space is never an option (argparse's
 * `' ' in arg_string` rule).
 */
function looksLikeOption(token: string): boolean {
  return (
    token.length > 1 &&
    token.startsWith("-") &&
    !token.includes(" ") &&
    !/^-\d+$|^-\d*\.\d+$/.test(token)
  );
}

interface ParsedArgs {
  root: string;
  strict: boolean;
}

/** Parse argv like the Python argparse parser (exit 2 on usage, 0 on help). */
function parseArgs(argv: string[]): ParsedArgs {
  let root = ".";
  let strict = false;
  let optionsEnded = false;
  const extras: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (optionsEnded) {
      extras.push(arg);
      continue;
    }
    if (arg === "--") {
      optionsEnded = true;
      extras.push(arg);
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    if (arg === "--root") {
      const next = argv[i + 1];
      if (next === undefined || looksLikeOption(next)) {
        exitUsage("argument --root: expected one argument");
      }
      root = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      continue;
    }
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg.startsWith("--strict=")) {
      exitUsage(
        `argument --strict: ignored explicit argument ${pyRepr(arg.slice("--strict=".length))}`,
      );
    }
    extras.push(arg);
  }

  if (extras.length > 0) {
    exitUsage(`unrecognized arguments: ${extras.join(" ")}`);
  }

  return { root, strict };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);

  // Python `Path(args.root).resolve()`: absolutize then resolve symlinks.
  const rootArg = resolve(args.root);
  let root = rootArg;
  try {
    root = realpathSync(rootArg);
  } catch {
    root = rootArg;
  }
  if (!isDir(root)) {
    process.stderr.write(`root is not a directory: ${root}\n`);
    return 2;
  }

  return preflight(root, args.strict);
}

// Entry guard: run only when invoked directly (not when imported by a test).
// Same guard used by `validate_harness.ts`, `update_harness.ts` and
// `upgrade_harness.ts` (not the `realpathSync`-wrapped guard from
// `feature.ts`, which targets a symlink-fan-out bug specific to how
// `feature.py`/`feature.ts` itself gets invoked). `preflight.js` is always
// reached via a literal `node dist/preflight.js` path from its callers
// (`feature.ts`'s `runPreflight`, `init.sh`, the test suite) - never through
// a symlink - so the plain guard is sufficient and matches the nearer
// precedent.
if (import.meta.url === `file://${process.argv[1]}`) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}

export { main };
