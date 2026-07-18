#!/usr/bin/env node
/**
 * Handyman metrics: read-only aggregation of the artifacts the workflow writes.
 *
 * Faithful port of `scripts/metrics.py`. Derives workflow measures from three
 * existing layers (never from new state):
 *
 *   - feature_list.json         -> status counts (pending/in_progress/done/blocked)
 *   - progress/history.md       -> throughput: closures per date (dated headings)
 *   - backlog/*.md frontmatter  -> review verdicts (approval rate) + report coverage
 *
 * The feature contract stays a state machine (no dates, see
 * references/workflow.md "Stages at a Glance"): every measure here is
 * *derived* from the dated artifacts each stage already leaves on disk. This
 * script observes; it never gates.
 *
 * Usage:
 *   node dist/metrics.js [--root PATH] [--json]
 *
 * Exit codes:
 *   0  always (read-only observation; missing layers degrade to empty metrics)
 *   2  usage error
 */
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter, splitLines } from "./core/frontmatter.js";
import { formatHalfEven, resolveWorkspace } from "./core/index.js";

// Written by `feature.py done`: "## 2026-06-18 - Feature 5: harness_versioning".
// The template line "## YYYY-MM-DD - Feature N: feature_name" does not match.
const HISTORY_HEADING = /^## (\d{4}-\d{2}-\d{2}) - Feature (\d+): (.+)$/;

const STATUSES = ["pending", "in_progress", "done", "blocked"] as const;

type Feature = Record<string, unknown>;
type Reports = Record<string, Record<string, string>>;

export interface Closure {
  date: string;
  id: number;
  name: string;
}

interface ReviewVerdicts {
  approved: number;
  changes_requested: number;
  approval_rate: number | null;
}

interface Coverage {
  done: number;
  with_reports: number;
  missing: unknown[];
}

export interface Metrics {
  root: string;
  workspace: string;
  status_counts: Record<string, number>;
  throughput: Record<string, number>;
  review_verdicts: ReviewVerdicts;
  coverage: Coverage;
}

/** Python `obj.get(key, dflt)` -- present-key wins even for falsy values. */
function pyGet(obj: Record<string, unknown>, key: string, dflt: unknown): unknown {
  return Object.hasOwn(obj, key) ? obj[key] : dflt;
}

/** Features from feature_list.json; [] when missing or unparseable. */
function loadFeatures(workspace: string): Feature[] {
  const path = join(workspace, "feature_list.json");
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
  const features =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>).features
      : [];
  if (!Array.isArray(features)) {
    return [];
  }
  return features.filter(
    (f): f is Feature => typeof f === "object" && f !== null && !Array.isArray(f),
  );
}

function statusCounts(features: Feature[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const status of STATUSES) {
    counts[status] = 0;
  }
  for (const feature of features) {
    const status = feature.status;
    if (typeof status === "string" && Object.hasOwn(counts, status)) {
      counts[status] = (counts[status] as number) + 1;
    }
  }
  return counts;
}

/** Closure entries derived from the dated headings in progress/history.md. */
export function historyClosures(workspace: string): Closure[] {
  const path = join(workspace, "progress", "history.md");
  let lines: string[];
  try {
    lines = splitLines(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
  const closures: Closure[] = [];
  for (const line of lines) {
    const match = HISTORY_HEADING.exec(line);
    if (match) {
      closures.push({
        date: match[1] as string,
        id: Number.parseInt(match[2] as string, 10),
        name: (match[3] as string).trim(),
      });
    }
  }
  return closures;
}

function throughput(closures: Closure[]): Record<string, number> {
  const perDate = new Map<string, number>();
  for (const entry of closures) {
    perDate.set(entry.date, (perDate.get(entry.date) ?? 0) + 1);
  }
  // Dated keys ("YYYY-MM-DD") are never integer-like, so insertion order is
  // preserved in the plain object (mirrors Python `dict(sorted(...))`).
  const sorted: Record<string, number> = {};
  for (const date of [...perDate.keys()].sort()) {
    sorted[date] = perDate.get(date) as number;
  }
  return sorted;
}

/** Map backlog report filename -> parsed frontmatter (reuses the shared parser). */
function backlogReports(workspace: string): Reports {
  const backlog = join(workspace, "backlog");
  const reports: Reports = {};
  let entries: string[];
  try {
    entries = readdirSync(backlog);
  } catch {
    return reports;
  }
  // Python `sorted(backlog.glob("*.md"))`: non-recursive, dotfiles included.
  for (const name of entries.filter((entry) => entry.endsWith(".md")).sort()) {
    reports[name] = parseFrontmatter(join(backlog, name));
  }
  return reports;
}

function reviewVerdicts(reports: Reports): ReviewVerdicts {
  let approved = 0;
  let changes = 0;
  for (const [name, front] of Object.entries(reports)) {
    if (!name.startsWith("review_")) {
      continue;
    }
    const status = pyGet(front, "status", "");
    if (status === "approved") {
      approved += 1;
    } else if (status === "changes_requested") {
      changes += 1;
    }
  }
  const total = approved + changes;
  // Python `round(approved / total, 4)` rounds half-to-even on the true double
  // and re-parses to the closest double; `Number(...)` drops trailing zeros
  // identically (0.5, not 0.5000).
  const rate = total ? Number(formatHalfEven(approved / total, 4)) : null;
  return { approved, changes_requested: changes, approval_rate: rate };
}

/** Done features that carry their impl_ + review_ evidence pair in backlog/. */
function reportCoverage(features: Feature[], reports: Reports): Coverage {
  const done = features
    .filter((f) => pyGet(f, "status", undefined) === "done")
    .map((f) => pyGet(f, "name", ""));
  const missing = done.filter(
    (name) =>
      !Object.hasOwn(reports, `impl_${name}.md`) || !Object.hasOwn(reports, `review_${name}.md`),
  );
  return { done: done.length, with_reports: done.length - missing.length, missing };
}

export function collect(root: string): Metrics {
  const workspace = resolveWorkspace(root);
  const features = loadFeatures(workspace);
  const closures = historyClosures(workspace);
  const reports = backlogReports(workspace);
  return {
    root,
    workspace,
    status_counts: statusCounts(features),
    throughput: throughput(closures),
    review_verdicts: reviewVerdicts(reports),
    coverage: reportCoverage(features, reports),
  };
}

/** Python `repr(float)` for the approval rate (json.dumps uses float.__repr__):
 *  an integral double carries a trailing ".0" (`1.0`, `0.0`); everything else
 *  matches the JS shortest round-trip formatting in the [0, 1] range. */
function pyFloatRepr(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

const RATE_TOKEN = "@@approval_rate_float@@";

/** `json.dumps(metrics, indent=2)` with the Python default ensure_ascii=True. */
function pyJsonDumps(metrics: Metrics): string {
  const rate = metrics.review_verdicts.approval_rate;
  const forJson =
    rate === null
      ? metrics
      : {
          ...metrics,
          review_verdicts: {
            ...metrics.review_verdicts,
            approval_rate: RATE_TOKEN as unknown as number,
          },
        };
  let text = JSON.stringify(forJson, null, 2);
  if (rate !== null) {
    // Splice the Python float repr back in (JSON.stringify would drop the
    // trailing ".0" of an integral rate such as 1.0).
    text = text.replace(
      `"approval_rate": "${RATE_TOKEN}"`,
      `"approval_rate": ${pyFloatRepr(rate)}`,
    );
  }
  // ensure_ascii: escape everything outside printable ASCII (0x20-0x7e) as
  // \uXXXX on UTF-16 code units, so an astral char such as "😀" becomes the
  // surrogate pair \ud83d\ude00. JSON.stringify already escaped everything
  // below 0x20 exactly like Python does, so only 0x7f and above remain.
  const parts: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    parts.push(code > 0x7e ? `\\u${code.toString(16).padStart(4, "0")}` : (text[i] as string));
  }
  return parts.join("");
}

function renderText(metrics: Metrics): void {
  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  out(`==> metrics: ${metrics.root}`);
  out(`    workspace: ${metrics.workspace}`);
  const counts = metrics.status_counts;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const joined = STATUSES.map((status) => `${status}=${counts[status]}`).join(" ");
  out(`--> status: ${joined} (total ${total})`);
  out("--> throughput (closures per date):");
  const perDate = Object.entries(metrics.throughput);
  if (perDate.length > 0) {
    for (const [date, count] of perDate) {
      out(`    ${date}  ${count}`);
    }
  } else {
    out("    (no dated closures in history.md)");
  }
  const verdicts = metrics.review_verdicts;
  const rate = verdicts.approval_rate;
  // Python `f"{rate * 100:.0f}%"`: half-even, no decimals.
  const rateTxt = rate !== null ? `${formatHalfEven(rate * 100, 0)}%` : "n/a";
  out(
    "--> review verdicts: " +
      `approved=${verdicts.approved} ` +
      `changes_requested=${verdicts.changes_requested} ` +
      `(approval rate ${rateTxt})`,
  );
  const coverage = metrics.coverage;
  out(`--> coverage: ${coverage.done} done, ${coverage.with_reports} with impl+review reports`);
  for (const name of coverage.missing) {
    out(`    missing reports: ${name}`);
  }
  out("==> metrics: read-only report complete (exit 0)");
}

function parseArgs(argv: string[]): { root: string; json: boolean } {
  let root = ".";
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      root = argv[i + 1] ?? "";
      i++;
    } else if (arg?.startsWith("--root=")) {
      root = arg.slice("--root=".length);
    } else if (arg === "--json") {
      json = true;
    }
  }
  return { root, json };
}

export function main(argv: string[]): number {
  const args = parseArgs(argv);
  // Python `Path(args.root).resolve()`: absolutize and resolve symlinks
  // (non-strict -- a missing path is still absolutized).
  let root = resolve(args.root);
  try {
    root = realpathSync(root);
  } catch {
    // keep the absolutized path; the is-dir check below will reject it.
  }
  let rootIsDir: boolean;
  try {
    rootIsDir = statSync(root).isDirectory();
  } catch {
    rootIsDir = false;
  }
  if (!rootIsDir) {
    process.stderr.write(`root is not a directory: ${root}\n`);
    return 2;
  }
  const metrics = collect(root);
  if (args.json) {
    process.stdout.write(`${pyJsonDumps(metrics)}\n`);
  } else {
    renderText(metrics);
  }
  return 0;
}

// Run when executed directly (mirrors Python `if __name__ == "__main__"`).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
