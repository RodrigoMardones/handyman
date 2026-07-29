#!/usr/bin/env node
/**
 * Handyman trigger-evaluation helper: the deterministic/stochastic split.
 *
 * Faithful port of `scripts/evals.py`. "Testing the model evaluation" is two
 * different jobs, and this script keeps them apart so one never blocks the
 * other (see references/evals.md):
 *
 *   validate  Offline, deterministic CONTRACT of the eval set: it parses, every
 *             item is {query: str, should_trigger: bool}, both classes are
 *             present, and no query repeats. Safe for CI and the verifier -
 *             always the same answer for the same file. Optionally checks the
 *             JSON Schema too.
 *
 *   measure   Online, stochastic MEASUREMENT of the real trigger: it runs each
 *             query through a model runner N times, turns the noisy outcomes
 *             into a per-query trigger rate, thresholds that into a prediction,
 *             and scores it against the label as a confusion matrix. It needs a
 *             model + CLI + auth, so it degrades with a NOTE (never an error)
 *             when no runner is configured - the same graceful degradation the
 *             schema checks use when jsonschema is absent.
 *
 * The eval set defaults to the one shipped beside this skill
 * (evals/trigger-eval.json); pass --eval-set to point elsewhere.
 *
 * Usage:
 *   node dist/evals.js validate [--eval-set PATH] [--min-per-class N]
 *   node dist/evals.js measure  [--eval-set PATH] [--runs N] [--threshold T]
 *                               [--runner "CMD ..."] [--report-passk]
 *
 * The runner contract (measure): CMD is split with shell-free argv parsing and
 * the query is appended as the final argument. The runner prints a verdict
 * whose first whitespace token is TRIGGER (the skill fired) or anything else
 * (it did not).
 *
 * Exit codes: 0 ok, 1 the eval set is invalid (validate), 2 usage/IO error.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import { formatHalfEven } from "./core/index.js";

/** Resolve a sibling path relative to this module (works from src/ and dist/). */
function here(rel: string): string {
  // Mirrors Python `Path(__file__).resolve().parent.parent / <rel>`:
  // src/evals.ts  -> ../evals/trigger-eval.json
  // dist/evals.js -> ../evals/trigger-eval.json
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", rel);
}

/** The trigger-eval set shipped with the skill (evals/trigger-eval.json). */
function defaultEvalSet(): string {
  return here(join("evals", "trigger-eval.json"));
}

/** The bundled trigger-eval JSON Schema (absent in installed target repos). */
function schemaPath(): string {
  return here(join("assets", "schemas", "trigger_eval.schema.json"));
}

/**
 * Read and JSON-decode the eval set, raising ValueError-equivalent on any
 * problem. Returns the parsed array (typed as unknown[]; callers validate shape).
 */
function loadEvalSet(path: string): unknown[] {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (exc) {
    // Python FileNotFoundError -> "eval set not found: {path}"
    if (isNodeError(exc) && exc.code === "ENOENT") {
      throw new Error(`eval set not found: ${path}`);
    }
    throw new Error(`eval set does not parse: ${exc}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (exc) {
    throw new Error(`eval set does not parse: ${exc}`);
  }
  if (!Array.isArray(data)) {
    throw new Error("eval set must be a JSON array");
  }
  return data;
}

/** Is the given value a plain object (dict), not an array? */
function isDict(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return the deterministic contract violations (empty list == well-formed). */
function structuralProblems(evalSet: unknown[], minPerClass: number): string[] {
  const problems: string[] = [];
  if (evalSet.length === 0) {
    problems.push("eval set is empty");
    return problems;
  }

  const seen = new Set<string>();
  let positives = 0;
  let negatives = 0;
  for (let idx = 0; idx < evalSet.length; idx++) {
    const item = evalSet[idx];
    if (!isDict(item)) {
      problems.push(`item ${idx} is not an object`);
      continue;
    }
    const extra = Object.keys(item).filter((k) => k !== "query" && k !== "should_trigger");
    if (extra.length > 0) {
      problems.push(`item ${idx} has unexpected keys: ${extra.sort().join(", ")}`);
    }
    const query = item.query;
    if (typeof query !== "string" || query.trim().length === 0) {
      problems.push(`item ${idx} has a missing or empty query`);
    } else if (seen.has(query)) {
      problems.push(`item ${idx} duplicates an earlier query`);
    } else {
      seen.add(query);
    }
    const trigger = item.should_trigger;
    if (typeof trigger !== "boolean") {
      problems.push(`item ${idx} has a non-boolean should_trigger`);
    } else if (trigger) {
      positives += 1;
    } else {
      negatives += 1;
    }
  }

  if (positives < minPerClass) {
    problems.push(`too few positive items: ${positives} < ${minPerClass}`);
  }
  if (negatives < minPerClass) {
    problems.push(`too few negative items: ${negatives} < ${minPerClass}`);
  }
  return problems;
}

/** Format a float like Python `f"{value:.2f}"` (half-even rounding). */
function f2(value: number): string {
  return formatHalfEven(value, 2);
}

/**
 * shell-free argv split, faithful to Python `shlex.split` (posix mode).
 * Splits on whitespace, honoring single quotes (literal), double quotes
 * (backslash escapes inside limited to $" and \), and backslash escapes outside
 * quotes. Malformed quoting (unterminated) yields the partial tokens collected
 * so far, matching the lenient default shlex behavior used on a runner string.
 */
function shlexSplit(s: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let inToken = false;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (quote !== null) {
      if (quote === '"') {
        if (escaped) {
          // Inside double quotes only $ ` " \ and newline keep their backslash.
          if (ch === "$" || ch === "`" || ch === '"' || ch === "\\" || ch === "\n") {
            token += ch;
          } else {
            token += `\\${ch}`;
          }
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          quote = null;
        } else {
          token += ch;
        }
      } else {
        // single quote: literal until closing quote
        if (ch === "'") {
          quote = null;
        } else {
          token += ch;
        }
      }
    } else if (escaped) {
      token += ch;
      escaped = false;
      inToken = true;
    } else if (ch === "\\") {
      escaped = true;
      inToken = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch as '"' | "'";
      inToken = true;
    } else if (
      ch === " " ||
      ch === "\t" ||
      ch === "\n" ||
      ch === "\r" ||
      ch === "\f" ||
      ch === "\v"
    ) {
      if (inToken) {
        tokens.push(token);
        token = "";
        inToken = false;
      }
    } else {
      token += ch;
      inToken = true;
    }
  }
  if (inToken || quote !== null) {
    tokens.push(token);
  }
  return tokens;
}

/**
 * Locate an executable on PATH like Python `shutil.which(name)`.
 * Returns the resolved path when found and executable, else null. A name that
 * already contains a separator is resolved relative to cwd (no PATH search).
 */
function which(name: string): string | null {
  if (name.length === 0) {
    return null;
  }
  if (name.includes("/")) {
    const abs = resolve(name);
    return isExecutable(abs) ? abs : null;
  }
  const pathEnv = process.env.PATH ?? "";
  const sep = pathEnv.includes(";") && process.platform === "win32" ? ";" : ":";
  for (const dir of pathEnv.split(sep)) {
    if (dir.length === 0) {
      continue;
    }
    const candidate = join(dir, name);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    const st = statSync(path);
    return st.isFile();
  } catch {
    return false;
  }
}

interface ValidateArgs {
  evalSet: string | null;
  minPerClass: number;
}
interface MeasureArgs {
  evalSet: string | null;
  runs: number;
  threshold: number;
  runner: string | null;
  reportPassk: boolean;
}

interface ParsedArgs {
  command: "validate" | "measure" | null;
  validate: ValidateArgs;
  measure: MeasureArgs;
}

const USAGE = `usage: evals.js [-h] {validate,measure} ...

Handyman trigger-evaluation helper.

positional arguments:
  {validate,measure}
    validate            Check the eval set's deterministic contract.
    measure             Measure the real trigger rate (needs a runner).

options:
  -h, --help            show this help message and exit
`;

/** Print a usage error to stderr and return the argparse exit code 2. */
function usageError(message: string): number {
  process.stderr.write(`usage: evals.js [-h] {validate,measure} ...\n`);
  process.stderr.write(`evals.js: error: ${message}\n`);
  return 2;
}

/** Parse argv into the command + flags, mirroring argparse subparsers. */
function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    validate: { evalSet: null, minPerClass: 1 },
    measure: {
      evalSet: null,
      runs: 3,
      threshold: 0.5,
      runner: null,
      reportPassk: false,
    },
  };

  // Top-level: the first positional is the subcommand (argparse scans past
  // any global options; here there are none besides -h).
  let i = 0;
  let cmd: "validate" | "measure" | null = null;
  while (i < argv.length) {
    const arg = argv[i] as string;
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      if (arg === "validate" || arg === "measure") {
        cmd = arg;
      } else {
        process.exit(
          usageError(
            `argument {validate,measure}: invalid choice: '${arg}' (choose from 'validate', 'measure')`,
          ),
        );
      }
      i++;
      break;
    } else {
      i++;
    }
  }
  if (cmd === null) {
    // argparse with required subparser prints "the following arguments are required"
    process.exit(usageError("the following arguments are required: {validate,measure}"));
  }
  result.command = cmd;

  const rest = argv.slice(i);
  const target = cmd === "validate" ? result.validate : result.measure;
  const known: Record<string, string> =
    cmd === "validate"
      ? { "--eval-set": "evalSet", "--min-per-class": "minPerClass" }
      : {
          "--eval-set": "evalSet",
          "--runs": "runs",
          "--threshold": "threshold",
          "--runner": "runner",
          "--report-passk": "reportPassk",
        };

  let j = 0;
  while (j < rest.length) {
    const arg = rest[j] as string;
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    const eq = arg.indexOf("=");
    const isLong = arg.startsWith("--");
    const name = isLong ? (eq >= 0 ? arg.slice(0, eq) : arg) : null;
    if (name !== null && Object.hasOwn(known, name)) {
      const dest = known[name] as string;
      if (dest === "reportPassk") {
        // store_true flag
        (target as unknown as Record<string, unknown>)[dest] = true;
        j++;
      } else {
        // value option (next token, or =value)
        let raw: string | undefined;
        if (eq >= 0) {
          raw = arg.slice(eq + 1);
        } else {
          raw = rest[j + 1];
          j++;
        }
        if (raw === undefined) {
          process.exit(usageError(`argument ${name}: expected one argument`));
        }
        if (dest === "minPerClass" || dest === "runs") {
          const parsed = Number.parseInt(raw, 10);
          if (Number.isNaN(parsed)) {
            process.exit(usageError(`argument ${name}: invalid int value: '${raw}'`));
          }
          (target as unknown as Record<string, unknown>)[dest] = parsed;
        } else if (dest === "threshold") {
          const parsed = Number(raw);
          if (Number.isNaN(parsed)) {
            process.exit(usageError(`argument ${name}: invalid float value: '${raw}'`));
          }
          (target as unknown as Record<string, unknown>)[dest] = parsed;
        } else {
          (target as unknown as Record<string, unknown>)[dest] = raw;
        }
        j++;
      }
    } else if (isLong) {
      process.exit(usageError(`unrecognized arguments: ${arg}`));
    } else {
      process.exit(usageError(`unrecognized arguments: ${arg}`));
    }
  }

  return result;
}

/** Print an error to stderr and return the IO/usage exit code 2. */
function err(msg: string): number {
  process.stderr.write(`error: ${msg}\n`);
  return 2;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return typeof value === "object" && value !== null && "code" in value;
}

/**
 * Validate the eval set's deterministic contract.
 * Exit 0 OK, 1 INVALID, 2 IO error (missing/unparseable eval set).
 */
function cmdValidate(args: ValidateArgs): number {
  const path = args.evalSet ?? defaultEvalSet();
  let evalSet: unknown[];
  try {
    evalSet = loadEvalSet(path);
  } catch (exc) {
    return err((exc as Error).message);
  }

  const problems = structuralProblems(evalSet, args.minPerClass);

  let positives = 0;
  let negatives = 0;
  for (const item of evalSet) {
    if (isDict(item) && item.should_trigger === true) {
      positives += 1;
    } else if (isDict(item) && item.should_trigger === false) {
      negatives += 1;
    }
  }
  process.stdout.write(`eval set: ${path}\n`);
  process.stdout.write(`items: ${evalSet.length} (positive=${positives}, negative=${negatives})\n`);

  const schemaFile = schemaPath();
  if (!existsSync(schemaFile)) {
    process.stdout.write(`NOTE: schema not found at ${schemaFile} - schema conformance skipped.\n`);
  } else {
    const schema = JSON.parse(readFileSync(schemaFile, "utf-8"));
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const ok = validate(evalSet);
    const schemaErrors: { loc: string; message: string }[] = [];
    if (!ok && validate.errors) {
      for (const e of validate.errors) {
        // Python `"/".join(map(str, e.path))` over the instance location.
        const instancePath = e.instancePath === "" ? [] : e.instancePath.split("/").slice(1);
        const params = e.params;
        // ajv reports `additionalProperties` with the offending key in
        // params.additionalProperty; Python jsonschema includes it in the path.
        if (params && typeof params === "object" && "additionalProperty" in params) {
          instancePath.push(String((params as Record<string, unknown>).additionalProperty));
        }
        const loc = instancePath.join("/") || "<root>";
        schemaErrors.push({ loc, message: pythonizeAjvMessage(e.message ?? "") });
      }
    }
    // Python sorts by list(e.path) (the instance location); stable by loc then message.
    schemaErrors.sort((a, b) => {
      if (a.loc === b.loc) {
        return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
      }
      return a.loc < b.loc ? -1 : 1;
    });
    for (const e of schemaErrors) {
      problems.push(`schema: ${e.loc}: ${e.message}`);
    }
  }

  if (problems.length > 0) {
    process.stderr.write("validate: INVALID\n");
    for (const problem of problems) {
      process.stderr.write(`  - ${problem}\n`);
    }
    return 1;
  }
  process.stdout.write("validate: OK\n");
  return 0;
}

/**
 * Translate an ajv error message toward the jsonschema/Python phrasing the
 * tests might assert on (e.g. "must be boolean", "must be string",
 * "is not allowed"). Best-effort: the structural checks already gate the
 * deterministic contract, so schema messages only add detail.
 */
function pythonizeAjvMessage(message: string): string {
  let m = message;
  m = m.replace(/must be boolean/g, "is not of type 'boolean'");
  m = m.replace(/must be string/g, "is not of type 'string'");
  m = m.replace(/must NOT have additional properties/g, "Additional properties are not allowed");
  return m;
}

/** Sample standard deviation (0.0 for an empty sample). */
function stddev(values: number[], mean: number): number {
  if (values.length === 0) {
    return 0.0;
  }
  let acc = 0;
  for (const v of values) {
    acc += (v - mean) ** 2;
  }
  return Math.sqrt(acc / values.length);
}

/**
 * Run the model runner once and report whether the skill triggered.
 * The runner output is data, not instructions: only its first whitespace token
 * is inspected, compared against the literal TRIGGER.
 */
function triggerOnce(runnerArgv: string[], query: string): boolean {
  try {
    const result = spawnSync(runnerArgv[0] as string, [...runnerArgv.slice(1), query], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      timeout: 120_000,
    });
    if (result.error || result.status === null) {
      // spawn failure or timeout (signaled) -> treat as no trigger
      return false;
    }
    const stdout = result.stdout ?? "";
    const tokens = stdout.trim().split(/\s+/);
    return tokens.length > 0 && (tokens[0] as string).toUpperCase() === "TRIGGER";
  } catch {
    return false;
  }
}

/** Measure the real trigger rate against a runner. Exit 0 (observes). */
function cmdMeasure(args: MeasureArgs): number {
  const path = args.evalSet ?? defaultEvalSet();
  let evalSet: unknown[];
  try {
    evalSet = loadEvalSet(path);
  } catch (exc) {
    return err((exc as Error).message);
  }
  const problems = structuralProblems(evalSet, 1);
  if (problems.length > 0) {
    process.stderr.write("error: eval set is invalid; run `evals.py validate` first\n");
    for (const problem of problems) {
      process.stderr.write(`  - ${problem}\n`);
    }
    return 1;
  }

  if (!args.runner) {
    process.stderr.write(
      "NOTE: no --runner configured - online trigger measurement needs a model runner (CLI + auth).\n",
    );
    process.stderr.write(
      '      pass --runner "<cmd>" that prints TRIGGER/NO for a query, or see references/evals.md.\n',
    );
    return 0;
  }
  const runnerArgv = shlexSplit(args.runner);
  if (runnerArgv.length === 0 || which(runnerArgv[0] as string) === null) {
    process.stderr.write(
      `NOTE: runner '${args.runner}' is not available - measurement skipped (model/CLI/auth missing).\n`,
    );
    return 0;
  }

  const runs = Math.max(1, args.runs);
  const threshold = args.threshold;
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  const posRates: number[] = [];
  const negRates: number[] = [];

  process.stdout.write(`eval set: ${path}\n`);
  process.stdout.write(
    `runner: ${args.runner}  runs/query: ${runs}  threshold: ${f2(threshold)}\n`,
  );
  const items = evalSet as Array<Record<string, unknown>>;
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx] as Record<string, unknown>;
    const query = item.query as string;
    const expected = Boolean(item.should_trigger);
    let hits = 0;
    for (let r = 0; r < runs; r++) {
      if (triggerOnce(runnerArgv, query)) {
        hits += 1;
      }
    }
    const rate = hits / runs;
    const predicted = rate >= threshold;
    (expected ? posRates : negRates).push(rate);
    if (predicted && expected) {
      tp += 1;
    } else if (predicted && !expected) {
      fp += 1;
    } else if (!predicted && !expected) {
      tn += 1;
    } else {
      fn += 1;
    }
    const mark = predicted === expected ? "OK" : "MISS";
    process.stdout.write(
      `  q${idx}: rate=${f2(rate)} predicted=` +
        `${predicted ? "trigger" : "silent"} ` +
        `expected=${expected ? "trigger" : "silent"} ${mark}\n`,
    );
  }

  const total = tp + fp + tn + fn;
  const accuracy = total > 0 ? (tp + tn) / total : 0.0;
  const posMean = posRates.length > 0 ? posRates.reduce((a, b) => a + b, 0) / posRates.length : 0.0;
  const negMean = negRates.length > 0 ? negRates.reduce((a, b) => a + b, 0) / negRates.length : 0.0;
  process.stdout.write(`confusion: TP=${tp} FP=${fp} TN=${tn} FN=${fn}\n`);
  process.stdout.write(`accuracy=${f2(accuracy)}\n`);
  process.stdout.write(
    `positives mean_rate=${f2(posMean)} stddev=${f2(stddev(posRates, posMean))}\n`,
  );
  process.stderr; // keep stream reference (parity no-op)
  process.stdout.write(
    `negatives mean_rate=${f2(negMean)} stddev=${f2(stddev(negRates, negMean))}\n`,
  );
  if (args.reportPassk) {
    reportPassk(posRates, negRates, runs);
  }
  return 0;
}

/** pass@k = mean(1 - (1 - r)^k) over the per-query rates; pass@1 is the mean. */
function reportPassk(posRates: number[], negRates: number[], k: number): void {
  const passAt = (rates: number[], kk: number): number => {
    if (rates.length === 0) {
      return 0.0;
    }
    let acc = 0;
    for (const r of rates) {
      acc += 1.0 - (1.0 - r) ** kk;
    }
    return acc / rates.length;
  };

  const p1 = passAt(posRates, 1);
  const pk = passAt(posRates, k);
  process.stdout.write(`pass@1=${f2(p1)} pass@${k}=${f2(pk)}  (positives; n=${posRates.length})\n`);
  if (negRates.length > 0) {
    const fp1 = negRates.reduce((a, b) => a + b, 0) / negRates.length;
    const fpk = passAt(negRates, k);
    process.stdout.write(`fp@1=${f2(fp1)} fp@${k}=${f2(fpk)}  (negatives; n=${negRates.length})\n`);
  }
}

export function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.command === "validate") {
    return cmdValidate(args.validate);
  }
  return cmdMeasure(args.measure);
}

// Run when executed directly (mirrors Python `if __name__ == "__main__"`).
// Basename check, not import.meta.url: bundle-proof (see toolbox.ts).
if (basename(process.argv[1] ?? "") === "evals.js") {
  process.exit(main(process.argv.slice(2)));
}
