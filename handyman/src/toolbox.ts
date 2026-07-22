#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
/**
 * Handyman toolBox: read-only observation of every registered harness.
 *
 * TypeScript port of the legacy `scripts/fleet.py`, renamed toolBox. A
 * machine-global registry ($HANDYMAN_ROOT/registry.json, default
 * $HOME/HANDYMAN) records ONLY each harness project_root plus the
 * registration date; everything else is read live from each harness on
 * every query, so there is no mirrored state to drift (disk is the source
 * of truth). Design: docs/archive/analisis-observador-fleet-web.md.
 *
 * Subcommands:
 *   register PATH    add a harness project root (validates it resolves)
 *   unregister PATH  remove a registered root
 *   list             print registered roots (--json)
 *   discover         scan a directory tree for harnesses (--scan DIR [--register])
 *   status           per-harness live report: metrics + session + version drift
 *   health           derived signals: INVARIANT, STALE_WIP, BEHIND, IDLE, UNREADABLE
 *   heartbeat        append a closure event (post_run hook)
 *   timeline         merged closure chronology across the toolBox
 *   moc              regenerate the global toolBox MOC at $HANDYMAN_ROOT/index.md
 *   serve            boot the unified Next standalone observer (see serveMain)
 *
 * Usage:
 *   node dist/toolbox.js [--handyman-root PATH] <subcommand> [options]
 *
 * Exit codes:
 *   0  ok; status and health observe, they never gate (health --strict exits
 *      1 when at least one signal is present)
 *   1  error (register/unregister/discover failure, corrupted registry write)
 *   2  usage error
 */
import {
  accessSync,
  appendFileSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  handymanRoot,
  isHarnessRoot,
  loadRegistry,
  type Registry,
  type RegistryEntry,
  registryPath,
  saveRegistry,
} from "@handyman/toolbox-core/registry";
import { parseFrontmatter } from "./core/frontmatter.js";
import { resolveWorkspace } from "./core/index.js";
import { NOTES_HEADING, preservedNotes } from "./index_md.js";
import { collect, historyClosures } from "./metrics.js";
import { REVIEW_NOTES_USAGE, reviewNotesMain } from "./toolbox_review_notes_cli.js";
import { currentSkillVersion, parseVersion, readInstalledVersion } from "./upgrade_harness.js";

export type { Registry, RegistryEntry };
// Registry primitives moved to @handyman/toolbox-core (feature 42); the
// historical exports of this module stay stable for serve and the tests.
export { handymanRoot, loadRegistry, registryPath };

const STATUSES = ["pending", "in_progress", "done", "blocked"] as const;

// Directories never descended into while discovering harnesses.
const DISCOVER_PRUNE = new Set(["node_modules", "graphify-out", "__pycache__", ".git"]);

export interface Session {
  feature: string | null;
  status: string | null;
  role: string | null;
  updated: string | null;
}

export interface Snapshot {
  project_root: string;
  project_name: string;
  error: string | null;
  workspace?: string;
  status_counts: Record<string, number>;
  throughput?: Record<string, number>;
  session?: Session | null;
  version?: VersionInfo;
  last_closure?: string | null;
  verifier?: VerifierResult;
  [key: string]: unknown;
}

interface VersionInfo {
  installed: string | null;
  current: string | null;
  behind: boolean | null;
}

export interface VerifierResult {
  result: "green" | "red" | "skipped" | "timeout";
  exit_code: number | null;
}

export interface Signal {
  signal: string;
  detail: string;
}

export interface TimelineEntry {
  date: string;
  project_name: string;
  project_root: string;
  feature: string;
  feature_id: number | null;
  source: "history" | "event";
}

function err(msg: string): number {
  process.stderr.write(`ERROR: ${msg}\n`);
  return 1;
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// --- registry ----------------------------------------------------------------
// handymanRoot/registryPath/loadRegistry/saveRegistry/isHarnessRoot live in
// @handyman/toolbox-core/registry since feature 42 (moved verbatim).

function cmdRegister(hroot: string, target: string, stamp: string): number {
  const root = resolve(target.replace(/^~(?=$|\/)/, homedir()));
  if (!isDir(root)) {
    return err(`root is not a directory: ${root}`);
  }
  if (!isHarnessRoot(root)) {
    return err(`not a harness: no feature_list.json under the resolved workspace of ${root}`);
  }
  const [registry, loadError] = loadRegistry(hroot);
  if (loadError) {
    return err(`${loadError} (fix or remove it before registering)`);
  }
  if (registry.harnesses.some((e) => e.project_root === root)) {
    out(`already registered: ${root}`);
    return 0;
  }
  registry.harnesses.push({ project_root: root, registered: stamp });
  registry.harnesses.sort((a, b) => a.project_root.localeCompare(b.project_root));
  saveRegistry(hroot, registry);
  out(`registered ${root} -> ${registryPath(hroot)}`);
  return 0;
}

function cmdUnregister(hroot: string, target: string): number {
  const root = resolve(target.replace(/^~(?=$|\/)/, homedir()));
  const [registry, loadError] = loadRegistry(hroot);
  if (loadError) {
    return err(`${loadError} (fix or remove it before unregistering)`);
  }
  const kept = registry.harnesses.filter((e) => e.project_root !== root);
  if (kept.length === registry.harnesses.length) {
    return err(`not registered: ${root}`);
  }
  registry.harnesses = kept;
  saveRegistry(hroot, registry);
  out(`unregistered ${root}`);
  return 0;
}

/** project_name from harness.config.json, else feature_list, else basename. */
export function projectName(root: string): string {
  const config = join(root, "harness.config.json");
  if (isFile(config)) {
    try {
      const data = readJson(config) as Record<string, unknown>;
      if (data.project_name) {
        return String(data.project_name);
      }
    } catch {
      // fall through to the workspace lookups
    }
  }
  const featureList = join(resolveWorkspace(root), "feature_list.json");
  if (isFile(featureList)) {
    let data: unknown = {};
    try {
      data = readJson(featureList);
    } catch {
      data = {};
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      const config2 =
        record.config && typeof record.config === "object" && !Array.isArray(record.config)
          ? (record.config as Record<string, unknown>)
          : {};
      const name = config2.project_name || record.project;
      if (name) {
        return String(name);
      }
    }
  }
  return basename(root);
}

function cmdList(hroot: string, asJson: boolean): number {
  const [registry, loadError] = loadRegistry(hroot);
  if (loadError) {
    out(`NOTE: ${loadError}`);
  }
  const entries = registry.harnesses.map((e) => ({
    project_root: e.project_root,
    registered: e.registered,
    project_name: projectName(e.project_root),
  }));
  if (asJson) {
    out(
      JSON.stringify(
        {
          registry: registryPath(hroot),
          version: registry.version,
          harnesses: entries,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  out(`==> toolBox registry: ${registryPath(hroot)}`);
  if (entries.length === 0) {
    out("    (no harnesses registered)");
  }
  for (const entry of entries) {
    out(`    ${entry.project_name}  ${entry.project_root}  (registered ${entry.registered})`);
  }
  return 0;
}

function walkForHarnesses(base: string, maxDepth: number): string[] {
  const found: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: base, depth: 0 }];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop() as { dir: string; depth: number };
    if (
      isFile(join(dir, "harness.config.json")) ||
      isFile(join(dir, ".handyman", "feature_list.json"))
    ) {
      if (isHarnessRoot(dir)) {
        found.push(dir);
      }
    }
    if (depth >= maxDepth) {
      continue;
    }
    let children: string[];
    try {
      children = readdirSync(dir);
    } catch {
      continue;
    }
    for (const child of children.sort().reverse()) {
      if (DISCOVER_PRUNE.has(child) || child.startsWith(".")) {
        continue;
      }
      const childPath = join(dir, child);
      if (isDir(childPath)) {
        stack.push({ dir: childPath, depth: depth + 1 });
      }
    }
  }
  return found.sort();
}

function cmdDiscover(
  hroot: string,
  scan: string,
  doRegister: boolean,
  maxDepth: number,
  stamp: string,
): number {
  const base = resolve(scan.replace(/^~(?=$|\/)/, homedir()));
  if (!isDir(base)) {
    return err(`scan path is not a directory: ${base}`);
  }
  const found = walkForHarnesses(base, maxDepth);
  out(`==> discover: ${found.length} harness(es) under ${base}`);
  let code = 0;
  for (const root of found) {
    out(`    ${projectName(root)}  ${root}`);
    if (doRegister) {
      code = Math.max(code, cmdRegister(hroot, root, stamp));
    }
  }
  return code;
}

// --- live snapshots ----------------------------------------------------------

/** Live session from progress/current.md frontmatter; null when absent. */
function session(workspace: string): Session | null {
  const current = join(workspace, "progress", "current.md");
  if (!isFile(current)) {
    return null;
  }
  const front = parseFrontmatter(current);
  return {
    feature: front.feature ?? null,
    status: front.status ?? null,
    role: front.role ?? null,
    updated: front.updated ?? null,
  };
}

function sessionIsIdle(s: Session | null | undefined): boolean {
  if (!s) {
    return true;
  }
  return s.feature === null || s.feature === "" || s.feature === "none" || s.status === "idle";
}

/** Everything status/health/moc need for one harness, degraded field by field. */
export function harnessSnapshot(rootStr: string, skillVersion: string): Snapshot {
  const snapshot: Snapshot = {
    project_root: rootStr,
    project_name: isDir(rootStr) ? projectName(rootStr) : basename(rootStr),
    error: null,
    status_counts: Object.fromEntries(STATUSES.map((s) => [s, 0])),
  };
  if (!isDir(rootStr)) {
    snapshot.error = "root is not a directory";
    return snapshot;
  }

  const workspace = resolveWorkspace(rootStr);
  const featureList = join(workspace, "feature_list.json");
  if (!isFile(featureList)) {
    snapshot.error = `no feature_list.json under ${workspace}`;
  } else {
    try {
      readJson(featureList);
    } catch (exc) {
      snapshot.error = `feature_list.json does not parse: ${exc}`;
    }
  }

  Object.assign(snapshot, collect(rootStr)); // status_counts/throughput/review_verdicts/coverage
  snapshot.session = session(workspace);

  const installed = readInstalledVersion(rootStr, workspace);
  let behind: boolean | null = null;
  if (skillVersion) {
    const installedTuple = parseVersion(installed);
    const currentTuple = parseVersion(skillVersion);
    if (currentTuple !== null) {
      behind =
        installedTuple === null ||
        installedTuple[0] < currentTuple[0] ||
        (installedTuple[0] === currentTuple[0] &&
          (installedTuple[1] < currentTuple[1] ||
            (installedTuple[1] === currentTuple[1] && installedTuple[2] < currentTuple[2])));
    }
  }
  snapshot.version = {
    installed,
    current: skillVersion || null,
    behind,
  };

  const closures = historyClosures(workspace);
  snapshot.last_closure = closures.reduce<string | null>(
    (max, c) => (max === null || c.date > max ? c.date : max),
    null,
  );
  return snapshot;
}

export function snapshots(hroot: string): [Snapshot[], Registry, string | null] {
  const [registry, loadError] = loadRegistry(hroot);
  const skillVersion = currentSkillVersion();
  const snaps = registry.harnesses.map((e) => harnessSnapshot(e.project_root, skillVersion));
  return [snaps, registry, loadError];
}

function countsLine(counts: Record<string, number>): string {
  const total = STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  const joined = STATUSES.map((status) => `${status}=${counts[status] ?? 0}`).join(" ");
  return `${joined} (total ${total})`;
}

function versionLine(version: VersionInfo): string {
  const installed = version.installed || "unsealed";
  if (version.behind === true) {
    return `${installed} (behind ${version.current})`;
  }
  if (version.behind === false) {
    return `${installed} (up to date)`;
  }
  return `${installed} (skill version unknown)`;
}

function sessionLine(s: Session | null | undefined): string {
  if (sessionIsIdle(s)) {
    return "idle";
  }
  const live = s as Session;
  return `${live.feature} (role ${live.role || "?"}, updated ${live.updated || "?"})`;
}

/**
 * Opt-in live verification: execute the harness's own init.sh.
 * Only the exit code is observed (output discarded); a missing or
 * non-executable verifier is 'skipped'. Never throws.
 */
export function runVerifier(root: string, timeoutS: number): VerifierResult {
  const init = join(root, "init.sh");
  if (!isFile(init)) {
    return { result: "skipped", exit_code: null };
  }
  try {
    accessSync(init, constants.X_OK);
  } catch {
    return { result: "skipped", exit_code: null };
  }
  const proc = spawnSync(init, [], {
    cwd: root,
    stdio: "ignore",
    timeout: timeoutS * 1000,
  });
  if (proc.error) {
    const code = (proc.error as NodeJS.ErrnoException).code;
    if (code === "ETIMEDOUT") {
      return { result: "timeout", exit_code: null };
    }
    return { result: "skipped", exit_code: null };
  }
  // spawnSync reports a timeout kill via the signal, not always via error.
  if (proc.signal === "SIGTERM" && proc.status === null) {
    return { result: "timeout", exit_code: null };
  }
  const status = proc.status ?? 1;
  return { result: status === 0 ? "green" : "red", exit_code: status };
}

function verifierLine(verifier: VerifierResult): string {
  if (verifier.result === "green") {
    return "green (exit 0)";
  }
  if (verifier.result === "red") {
    return `red (exit ${verifier.exit_code})`;
  }
  if (verifier.result === "timeout") {
    return "timeout";
  }
  return "skipped (no executable init.sh)";
}

export function fleetAggregate(snaps: Snapshot[]): {
  harnesses: number;
  unreadable: number;
  status_counts: Record<string, number>;
} {
  const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let unreadable = 0;
  for (const snap of snaps) {
    if (snap.error) {
      unreadable += 1;
      continue;
    }
    for (const status of STATUSES) {
      counts[status] = (counts[status] as number) + (snap.status_counts[status] ?? 0);
    }
  }
  return { harnesses: snaps.length, unreadable, status_counts: counts };
}

function cmdStatus(
  hroot: string,
  asJson: boolean,
  verify: boolean,
  verifierTimeout: number,
): number {
  const [snaps, _registry, loadError] = snapshots(hroot);
  if (verify) {
    for (const snap of snaps) {
      if (!snap.error) {
        snap.verifier = runVerifier(snap.project_root, verifierTimeout);
      }
    }
  }
  const fleet = fleetAggregate(snaps);
  if (asJson) {
    out(
      JSON.stringify(
        {
          registry: registryPath(hroot),
          registry_error: loadError,
          skill_version: currentSkillVersion() || null,
          harnesses: snaps,
          fleet,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (loadError) {
    out(`NOTE: ${loadError}`);
  }
  out(
    `==> toolBox status: ${snaps.length} harness(es) registered (registry: ${registryPath(hroot)})`,
  );
  if (snaps.length === 0) {
    out("    (no harnesses registered; use toolbox.js register/discover)");
  }
  for (const snap of snaps) {
    out(`--> ${snap.project_name}  ${snap.project_root}`);
    if (snap.error) {
      out(`    ERROR: ${snap.error}`);
      continue;
    }
    out(`    version: ${versionLine(snap.version as VersionInfo)}`);
    out(`    status: ${countsLine(snap.status_counts)}`);
    out(`    session: ${sessionLine(snap.session)}`);
    out(`    last closure: ${snap.last_closure || "none"}`);
    if (snap.verifier) {
      out(`    verifier: ${verifierLine(snap.verifier)}`);
    }
  }
  out(
    `--> toolBox: harnesses=${fleet.harnesses} unreadable=${fleet.unreadable} ` +
      countsLine(fleet.status_counts),
  );
  out("==> toolBox status: read-only report complete (exit 0)");
  return 0;
}

// --- health ------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: unknown): Date | null {
  const match = DATE_RE.exec(String(value ?? ""));
  if (!match) {
    return null;
  }
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

/** Derived health signals for one snapshot. Empty list = healthy. */
export function harnessSignals(
  snap: Snapshot,
  today: Date,
  staleDays: number,
  idleDays: number,
): Signal[] {
  if (snap.error) {
    return [{ signal: "UNREADABLE", detail: snap.error }];
  }
  const signals: Signal[] = [];
  const counts = snap.status_counts;

  if ((counts.in_progress ?? 0) > 1) {
    signals.push({
      signal: "INVARIANT",
      detail: `${counts.in_progress} features in_progress (max 1)`,
    });
  }

  if ((counts.in_progress ?? 0) >= 1) {
    const updated = parseDate(snap.session?.updated);
    if (updated === null) {
      signals.push({
        signal: "STALE_WIP",
        detail: "in_progress with no parseable updated stamp in current.md",
      });
    } else if (daysBetween(today, updated) > staleDays) {
      signals.push({
        signal: "STALE_WIP",
        detail: `in_progress updated ${updated.toISOString().slice(0, 10)} (> ${staleDays} days ago)`,
      });
    }
  }

  const version = snap.version ?? { installed: null, current: null, behind: null };
  if (version.behind === true) {
    const installed = version.installed || "unsealed";
    signals.push({
      signal: "BEHIND",
      detail: `installed ${installed} < skill ${version.current}`,
    });
  }

  if ((counts.pending ?? 0) > 0) {
    const last = parseDate(snap.last_closure);
    if (last === null) {
      signals.push({
        signal: "IDLE",
        detail: `${counts.pending} pending and no dated closures in history.md`,
      });
    } else if (daysBetween(today, last) > idleDays) {
      signals.push({
        signal: "IDLE",
        detail:
          `${counts.pending} pending, last closure ${last.toISOString().slice(0, 10)} ` +
          `(> ${idleDays} days ago)`,
      });
    }
  }
  return signals;
}

function cmdHealth(
  hroot: string,
  asJson: boolean,
  strict: boolean,
  staleDays: number,
  idleDays: number,
  todayStr: string | null,
): number {
  const today = todayStr ? parseDate(todayStr) : parseDate(todayStamp());
  if (today === null) {
    process.stderr.write(`--today does not parse as YYYY-MM-DD: ${todayStr}\n`);
    return 2;
  }
  const [snaps, _registry, loadError] = snapshots(hroot);
  const report = snaps.map((snap) => ({
    project_root: snap.project_root,
    project_name: snap.project_name,
    signals: harnessSignals(snap, today, staleDays, idleDays),
  }));
  const total = report.reduce((sum, entry) => sum + entry.signals.length, 0);
  const exitCode = strict && total > 0 ? 1 : 0;
  if (asJson) {
    out(
      JSON.stringify(
        {
          registry: registryPath(hroot),
          registry_error: loadError,
          today: today.toISOString().slice(0, 10),
          stale_days: staleDays,
          idle_days: idleDays,
          harnesses: report,
          total_signals: total,
        },
        null,
        2,
      ),
    );
    return exitCode;
  }
  if (loadError) {
    out(`NOTE: ${loadError}`);
  }
  const flagged = report.filter((entry) => entry.signals.length > 0).length;
  out(
    `==> toolBox health: ${report.length} harness(es), ${flagged} with signals ` +
      `(today: ${today.toISOString().slice(0, 10)})`,
  );
  for (const entry of report) {
    out(`--> ${entry.project_name}  ${entry.project_root}`);
    if (entry.signals.length === 0) {
      out("    OK (no signals)");
    }
    for (const item of entry.signals) {
      out(`    ${item.signal}: ${item.detail}`);
    }
  }
  out(`==> toolBox health: ${total} signal(s) across toolBox (exit ${exitCode})`);
  return exitCode;
}

// --- heartbeat + timeline ----------------------------------------------------

export function eventsPath(hroot: string): string {
  return join(hroot, "events.jsonl");
}

/** Pushed closure events, one JSON object per line; bad lines are skipped. */
export function loadEvents(hroot: string): Array<Record<string, string>> {
  let lines: string[];
  try {
    lines = readFileSync(eventsPath(hroot), "utf-8").split("\n");
  } catch {
    return [];
  }
  const events: Array<Record<string, string>> = [];
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event && typeof event === "object" && !Array.isArray(event)) {
      const record = event as Record<string, unknown>;
      if (record.project_root && record.feature && record.date) {
        events.push({
          project_root: String(record.project_root),
          project_name: String(record.project_name ?? ""),
          feature: String(record.feature),
          date: String(record.date),
        });
      }
    }
  }
  return events;
}

/**
 * Append one closure event to $HANDYMAN_ROOT/events.jsonl.
 * Without --feature, the newest dated heading of progress/history.md is
 * reported — exactly the entry `feature done` just appended, which makes
 * this command a drop-in `post_run` hook.
 */
function cmdHeartbeat(
  hroot: string,
  rootStr: string,
  feature: string | null,
  dateStr: string | null,
): number {
  const root = resolve(rootStr.replace(/^~(?=$|\/)/, homedir()));
  if (!isDir(root)) {
    return err(`root is not a directory: ${root}`);
  }
  const workspace = resolveWorkspace(root);
  let stamp = dateStr;
  let name = feature;
  if (name === null) {
    const closures = historyClosures(workspace);
    if (closures.length === 0) {
      return err(`no dated closures in ${workspace}/progress/history.md and no --feature given`);
    }
    const latest = closures[closures.length - 1] as { name: string; date: string };
    name = latest.name;
    stamp = stamp || latest.date;
  }
  const event = {
    project_root: root,
    project_name: projectName(root),
    feature: name,
    date: stamp || todayStamp(),
  };
  try {
    mkdirSync(hroot, { recursive: true });
    appendFileSync(eventsPath(hroot), `${JSON.stringify(event)}\n`, "utf-8");
  } catch (exc) {
    return err(String(exc));
  }
  out(
    `heartbeat recorded: ${event.project_name} ${event.feature} (${event.date}) ` +
      `-> ${eventsPath(hroot)}`,
  );
  return 0;
}

/**
 * Dated closures from every readable harness plus pushed events, newest
 * first. History wins on (project_root, feature, date) collisions.
 */
export function toolboxTimeline(hroot: string, snaps: Snapshot[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const seen = new Set<string>();
  for (const snap of snaps) {
    if (snap.error) {
      continue;
    }
    const workspace = String(snap.workspace ?? "");
    for (const closure of historyClosures(workspace)) {
      seen.add(`${snap.project_root}\0${closure.name}\0${closure.date}`);
      entries.push({
        date: closure.date,
        project_name: snap.project_name,
        project_root: snap.project_root,
        feature: closure.name,
        feature_id: closure.id,
        source: "history",
      });
    }
  }
  for (const event of loadEvents(hroot)) {
    const key = `${event.project_root}\0${event.feature}\0${event.date}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push({
      date: event.date as string,
      project_name: event.project_name || basename(event.project_root as string),
      project_root: event.project_root as string,
      feature: event.feature as string,
      feature_id: null,
      source: "event",
    });
  }
  entries.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    if (a.project_name !== b.project_name) {
      return b.project_name.localeCompare(a.project_name);
    }
    return (b.feature_id ?? 0) - (a.feature_id ?? 0);
  });
  return entries;
}

function cmdTimeline(hroot: string, asJson: boolean, limit: number): number {
  const [snaps, _registry, loadError] = snapshots(hroot);
  const all = toolboxTimeline(hroot, snaps);
  const total = all.length;
  const entries = limit > 0 ? all.slice(0, limit) : all;
  if (asJson) {
    out(
      JSON.stringify(
        {
          registry: registryPath(hroot),
          registry_error: loadError,
          total,
          entries,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (loadError) {
    out(`NOTE: ${loadError}`);
  }
  const readable = snaps.filter((snap) => !snap.error).length;
  out(`==> toolBox timeline: ${total} closure(s) across ${readable} readable harness(es)`);
  if (entries.length === 0) {
    out("    (no dated closures found)");
  }
  for (const entry of entries) {
    const origin = entry.feature_id !== null ? `feature ${entry.feature_id}` : "heartbeat";
    out(`    ${entry.date}  ${entry.project_name.padEnd(16)} ${entry.feature} (${origin})`);
  }
  out("==> toolBox timeline: read-only report complete (exit 0)");
  return 0;
}

// --- moc ---------------------------------------------------------------------

/** Absolute markdown links, only to files that exist on disk. */
function mocLinks(snap: Snapshot): string {
  const workspace = String(snap.workspace ?? snap.project_root);
  const candidates: Array<[string, string]> = [
    ["feature_list.json", join(workspace, "feature_list.json")],
    ["current.md", join(workspace, "progress", "current.md")],
    ["history.md", join(workspace, "progress", "history.md")],
    ["workspace MOC", join(workspace, "index.md")],
  ];
  return candidates
    .filter(([, path]) => isFile(path))
    .map(([label, path]) => `[${label}](${path})`)
    .join(" · ");
}

export function buildToolboxMoc(hroot: string, snaps: Snapshot[]): string {
  const outLines: string[] = [
    "---",
    "tags: [handyman/toolbox]",
    "---",
    "",
    "# Handyman ToolBox",
    "",
    "_Generated by `toolbox.js moc` from the registry and each harness's " +
      "live state. Re-run to refresh; the `## Notes` section is preserved._",
    "",
    "## Registry",
    "",
    `- \`${registryPath(hroot)}\` — ${snaps.length} harness(es)`,
    "",
    "## Harnesses",
    "",
  ];
  if (snaps.length === 0) {
    outLines.push(
      "- _no harnesses registered; use `toolbox.js register` or " +
        "`toolbox.js discover --scan <dir> --register`_",
    );
  }
  for (const snap of snaps) {
    if (snap.error) {
      outLines.push(
        `### ${snap.project_name}`,
        "",
        `- root: \`${snap.project_root}\``,
        `- ERROR: ${snap.error}`,
        "",
      );
      continue;
    }
    outLines.push(
      `### ${snap.project_name} — ${versionLine(snap.version as VersionInfo)}`,
      "",
      `- root: \`${snap.project_root}\``,
      `- status: ${countsLine(snap.status_counts)}`,
      `- session: ${sessionLine(snap.session)}`,
      `- last closure: ${snap.last_closure || "none"}`,
    );
    const links = mocLinks(snap);
    if (links) {
      outLines.push(`- open: ${links}`);
    }
    outLines.push("");
  }
  const notes = preservedNotes(join(hroot, "index.md"));
  if (notes.length > 0) {
    outLines.push(...notes);
  } else {
    outLines.push(NOTES_HEADING, "", "_Operator notes; preserved across regenerations._");
  }
  return `${outLines.join("\n").replace(/\n+$/, "")}\n`;
}

// Design tokens (--hw-*): the single source for every color, spacing and type
// value on both pages (this static export and the observer panel). Dark mode
// only reassigns variables; rules below consume tokens exclusively, so the
// no-stray-hex test can hold "every hex lives on a --hw- line". Palette v2
// "digital workshop" — the hex values are WCAG-AA audited as a set; do not
// tweak one in isolation. --hw-border stays decorative (row rules); controls
// use --hw-border-strong (>= 3:1 vs bg, WCAG 1.4.11). The dark reassignments
// exist once, as this string: emitted under the manual selector
// (:root[data-theme="dark"]) and under the OS preference, so the two theme
// layers can never drift apart.
const DARK_TOKENS = `    color-scheme: dark;
    --hw-bg: #16181D;
    --hw-surface: #1E222A;
    --hw-fg: #E7E9EC;
    --hw-muted: #9AA3AF;
    --hw-border: #3B424C;
    --hw-border-strong: #727D8C;
    --hw-accent: #E8A33D;
    --hw-ok: #57C46F;
    --hw-warn: #E0B94F;
    --hw-danger: #F2857D;
    --hw-info: #82AEE8;
    --hw-backdrop: rgba(0, 0, 0, 0.55);`;

const HTML_STYLE = `
  :root {
    color-scheme: light dark;
    --hw-bg: #F7F8FA;
    --hw-surface: #ECEEF2;
    --hw-fg: #1B1E24;
    --hw-muted: #50565F;
    --hw-border: #C4CAD3;
    --hw-border-strong: #6F7885;
    --hw-accent: #8A5300;
    --hw-ok: #156C2C;
    --hw-warn: #7A5900;
    --hw-danger: #B3261E;
    --hw-info: #2A5DA8;
    --hw-backdrop: rgba(22, 24, 29, 0.45);
    --hw-space-1: 0.25rem;
    --hw-space-2: 0.5rem;
    --hw-space-3: 1rem;
    --hw-space-4: 2rem;
    --hw-space-5: 3rem;
    --hw-text-xs: 0.75rem;
    --hw-text-s: 0.875rem;
    --hw-text-m: 1rem;
    --hw-text-l: 1.25rem;
    --hw-text-xl: 1.5rem;
    --hw-radius-s: 3px;
    --hw-radius-m: 6px;
  }
  :root[data-theme="light"] {
    color-scheme: light;
  }
  :root[data-theme="dark"] {
${DARK_TOKENS}
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
${DARK_TOKENS}
    }
  }
  body { font-family: system-ui, sans-serif;
         margin: var(--hw-space-4) auto; max-width: 72rem;
         padding: 0 var(--hw-space-3);
         background: var(--hw-bg); color: var(--hw-fg); }
  h1 { font-size: var(--hw-text-xl); }
  a { color: var(--hw-accent); }
  :focus-visible { outline: 2px solid var(--hw-accent); outline-offset: 1px; }
  .meta { color: var(--hw-muted); font-size: var(--hw-text-s); }
  table { border-collapse: collapse; width: 100%;
          margin-top: var(--hw-space-3); }
  th, td { text-align: left; padding: var(--hw-space-1) var(--hw-space-2);
           border-bottom: 1px solid var(--hw-border);
           font-size: var(--hw-text-m); }
  th { font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; border: 1px solid var(--hw-border);
           border-radius: var(--hw-radius-s); padding: 0 var(--hw-space-1);
           background: var(--hw-surface); font-size: var(--hw-text-s);
           font-weight: 600; }
  .badge-ok { color: var(--hw-ok);
              background: color-mix(in srgb, var(--hw-ok) 15%, var(--hw-bg)); }
  .badge-warn { color: var(--hw-warn);
                background: color-mix(in srgb, var(--hw-warn) 15%, var(--hw-bg)); }
  .badge-danger { color: var(--hw-danger);
                  background: color-mix(in srgb, var(--hw-danger) 15%, var(--hw-bg)); }
  .badge-info { color: var(--hw-info);
                background: color-mix(in srgb, var(--hw-info) 15%, var(--hw-bg)); }
  .badge-muted { color: var(--hw-muted);
                 background: color-mix(in srgb, var(--hw-muted) 15%, var(--hw-bg)); }
  .error { font-style: italic; }
  code { font-size: var(--hw-text-s); }
  .visually-hidden { position: absolute; width: 1px; height: 1px;
                     margin: -1px; padding: 0; border: 0;
                     clip-path: inset(50%); overflow: hidden;
                     white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;

// Shared favicon: a tiny self-contained SVG data URI — a solid square in the
// accent amber of the v2 palette (#E8A33D percent-encoded as %23E8A33D, so
// the no-stray-hex invariant keeps holding on the served pages).
export const FAVICON =
  "data:image/svg+xml,%3Csvg%20xmlns='http%3A//www.w3.org/2000/svg'" +
  "%20viewBox='0%200%2016%2016'%3E%3Crect%20width='16'%20height='16'" +
  "%20rx='3'%20fill='%23E8A33D'/%3E%3C/svg%3E";
const FAVICON_LINK = `<link rel="icon" href="${FAVICON}">`;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

/**
 * Self-contained static page: one table row per harness, no external assets,
 * textual BEHIND/OK labels (never color-only semantics). The content sits in
 * a <main> landmark and the table announces itself via a visually-hidden
 * <caption> plus scope="col" headers (WCAG 1.3.1).
 */
export function buildToolboxHtml(hroot: string, snaps: Snapshot[]): string {
  const rows: string[] = [];
  for (const snap of snaps) {
    const name = escapeHtml(snap.project_name);
    const root = escapeHtml(snap.project_root);
    if (snap.error) {
      rows.push(
        `<tr><td>${name}</td>` +
          `<td colspan="8" class="error">ERROR: ` +
          `${escapeHtml(snap.error)} — <code>${root}</code></td></tr>`,
      );
      continue;
    }
    const version = snap.version ?? { installed: null, current: null, behind: null };
    const drift = version.behind === true ? "BEHIND" : version.behind === false ? "OK" : "?";
    const driftClass =
      version.behind === true
        ? "badge-warn"
        : version.behind === false
          ? "badge-ok"
          : "badge-muted";
    const counts = snap.status_counts;
    rows.push(
      "<tr>" +
        `<td title="${root}">${name}</td>` +
        `<td>${escapeHtml(version.installed || "unsealed")}</td>` +
        `<td><span class="badge ${driftClass}">${drift}</span></td>` +
        `<td class="num">${counts.pending ?? 0}</td>` +
        `<td class="num">${counts.in_progress ?? 0}</td>` +
        `<td class="num">${counts.done ?? 0}</td>` +
        `<td class="num">${counts.blocked ?? 0}</td>` +
        `<td>${escapeHtml(sessionLine(snap.session))}</td>` +
        `<td>${escapeHtml(snap.last_closure || "none")}</td>` +
        "</tr>",
    );
  }
  if (rows.length === 0) {
    rows.push('<tr><td colspan="9" class="error">no harnesses registered</td></tr>');
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Handyman ToolBox</title>
${FAVICON_LINK}
<style>${HTML_STYLE}</style>
</head>
<body>
<main>
<h1>Handyman · ToolBox</h1>
<p class="meta">skill ${escapeHtml(currentSkillVersion() || "unknown")} ·
generated by <code>toolbox.js moc --html</code> on
${todayStamp()} · registry: <code>${escapeHtml(registryPath(hroot))}</code></p>
<table>
<caption class="visually-hidden">Registered harnesses: version drift,
workload counts, session and last closure per project</caption>
<thead><tr><th scope="col">Project</th><th scope="col">Version</th>
<th scope="col">Drift</th><th scope="col">Pending</th>
<th scope="col">In progress</th><th scope="col">Done</th>
<th scope="col">Blocked</th><th scope="col">Session</th>
<th scope="col">Last closure</th></tr></thead>
<tbody>
${rows.join("\n")}
</tbody>
</table>
</main>
</body>
</html>
`;
}

function cmdMoc(hroot: string, html: boolean): number {
  const [snaps, _registry, loadError] = snapshots(hroot);
  if (loadError) {
    out(`NOTE: ${loadError}`);
  }
  const indexPath = join(hroot, "index.md");
  try {
    mkdirSync(hroot, { recursive: true });
    writeFileSync(indexPath, buildToolboxMoc(hroot, snaps), "utf-8");
  } catch (exc) {
    return err(String(exc));
  }
  out(`regenerated ${indexPath}`);
  if (html) {
    const htmlPath = join(hroot, "index.html");
    try {
      writeFileSync(htmlPath, buildToolboxHtml(hroot, snaps), "utf-8");
    } catch (exc) {
      return err(String(exc));
    }
    out(`regenerated ${htmlPath}`);
  }
  return 0;
}

// --- cli ---------------------------------------------------------------------

const USAGE =
  "usage: toolbox.js [--handyman-root PATH] " +
  "{register,unregister,list,discover,status,health,heartbeat,timeline,moc,review-notes,serve} ...";

/**
 * Repo-root resolution for `serve` (feature 50, mirrors
 * apps/web/lib/toolboxState.ts): `TOOLBOX_REPO_ROOT` wins when the handyman
 * dist entry exists under it; otherwise walk up from cwd until it does. The
 * standalone Next server boots with its own cwd deep under the repo, so the
 * walk still finds the root; the override covers exotic layouts.
 */
const STANDALONE_SERVER = join("apps", "web", ".next", "standalone", "apps", "web", "server.js");
const STANDALONE_STATIC = join(
  "apps",
  "web",
  ".next",
  "standalone",
  "apps",
  "web",
  ".next",
  "static",
);
const STANDALONE_STATIC_SRC = join("apps", "web", ".next", "static");
const TOOLBOX_DIST_ENTRY = join("handyman", "dist", "toolbox_state.js");
const MAX_WALK_UP = 8;

function findRepoRoot(): string {
  const override = process.env.TOOLBOX_REPO_ROOT;
  if (override && existsSync(join(override, TOOLBOX_DIST_ENTRY))) {
    return resolve(override);
  }
  let dir = process.cwd();
  for (let i = 0; i < MAX_WALK_UP; i++) {
    if (existsSync(join(dir, TOOLBOX_DIST_ENTRY))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    `toolbox serve: repo root not found walking up from ${process.cwd()} ` +
      "(set TOOLBOX_REPO_ROOT or run from inside the repo).",
  );
}

/**
 * Resolve `--port N` (default 8765, the legacy TOOLBOX_UPSTREAM default) and
 * `--port 0` (OS-assigned free port, resolved up front so the URL printed to
 * stdout is the real one). Mirrors the old `parseServeArgs` flag shape so the
 * oracle's `... --port 0` invocation stays identical.
 */
function parseServePort(argv: string[]): number {
  let port = 8765;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--port") {
      port = Number.parseInt(argv[i + 1] ?? "", 10) || 0;
      i++;
    } else if (arg.startsWith("--port=")) {
      port = Number.parseInt(arg.slice("--port=".length), 10) || 0;
    }
  }
  return port;
}

/** Grab an ephemeral free port from the OS, then release it for the child. */
function ephemeralPort(): Promise<number> {
  return new Promise((resolveP, rejectP) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", rejectP);
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      probe.close(() => resolveP(typeof port === "number" ? port : 0));
    });
  });
}

/**
 * Poll the spawned Next standalone server until it accepts an HTTP
 * connection. Any response (2xx/4xx/5xx) counts as "listening"; an
 * ECONNREFUSED/ECONNRESET (the kernel rejecting the connect because nothing
 * is bound yet) means not-ready and is retried. Total budget ~10s
 * (100 attempts x ~100ms). Used by `serveMain` to close the race between
 * `spawn()` and the URL print: the parity oracle reads the URL on first
 * sight and fires assertions immediately, so printing it before Next is
 * listening produces empty bodies / `000` status codes.
 */
function waitForReady(port: number, attempts = 100, delayMs = 100): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const fail = (): void => {
      rejectP(new Error("server did not become ready within 10s"));
    };
    const scheduleNext = (remaining: number): void => {
      if (remaining <= 0) {
        fail();
        return;
      }
      setTimeout(() => probe(remaining - 1), delayMs);
    };
    const probe = (remaining: number): void => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          path: "/api/state",
          method: "GET",
          timeout: 1000,
        },
        (res) => {
          // Drain so the underlying socket frees cleanly.
          res.resume();
          res.on("end", () => resolveP());
          res.on("error", () => scheduleNext(remaining));
        },
      );
      req.on("error", (err: NodeJS.ErrnoException) => {
        // Connection refused/reset = not yet listening; retry on budget.
        if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
          scheduleNext(remaining);
          return;
        }
        rejectP(err);
      });
      req.on("timeout", () => {
        req.destroy();
        scheduleNext(remaining);
      });
      req.end();
    };
    probe(attempts);
  });
}

/**
 * `toolbox serve` (feature 50): one process — the Next.js standalone server
 * (apps/web/.next/standalone/apps/web/server.js) that already hosts the
 * unified UI and the migrated API. The old Node observer (toolbox_serve.ts)
 * is gone; this wrapper is the single entrypoint contract the parity oracle
 * greps for ("toolBox observer: <URL>").
 *
 * Contract:
 *   - `--port N` binds 127.0.0.1:N; `--port 0` picks a free port.
 *   - Prints `toolBox observer: http://127.0.0.1:<PORT>/` to stdout (oracle).
 *   - Verifies the standalone server.js exists (clear error pointing at the
 *     build command otherwise); also warns if the static assets copy step
 *     has not run, since Next standalone does not bundle them.
 *   - Forwards SIGINT/SIGTERM to the child and exits with the child's code.
 */
export function serveMain(argv: string[]): void {
  let repoRoot: string;
  try {
    repoRoot = findRepoRoot();
  } catch (err) {
    process.stderr.write(`toolbox serve: ${String((err as Error).message)}\n`);
    process.exit(1);
    return; // unreachable; keeps the type checker happy
  }
  const serverPath = join(repoRoot, STANDALONE_SERVER);
  if (!existsSync(serverPath)) {
    process.stderr.write(
      `toolbox serve: Next standalone server not found at ${serverPath}\n` +
        `  Build apps/web first:  pnpm --filter @handyman/web build\n` +
        `  then copy statics:     mkdir -p ${STANDALONE_STATIC} && cp -r ${STANDALONE_STATIC_SRC}/* ${STANDALONE_STATIC}/\n`,
    );
    process.exit(1);
    return;
  }
  if (!existsSync(join(repoRoot, STANDALONE_STATIC))) {
    process.stderr.write(
      `toolbox serve: WARNING ${STANDALONE_STATIC} is missing. ` +
        `Run: mkdir -p ${STANDALONE_STATIC} && cp -r ${STANDALONE_STATIC_SRC}/* ${STANDALONE_STATIC}/\n`,
    );
  }
  const requestedPort = parseServePort(argv);
  const useEphemeral = requestedPort === 0;
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    NEXT_TELEMETRY_DISABLED: "1",
    HANDYMAN_ROOT: process.env.HANDYMAN_ROOT ?? "",
    TOOLBOX_REPO_ROOT: repoRoot,
  };
  if (process.env.TOOLBOX_ENV_DIR) {
    childEnv.TOOLBOX_ENV_DIR = process.env.TOOLBOX_ENV_DIR;
  }

  const boot = async (port: number): Promise<void> => {
    childEnv.PORT = String(port);
    const child = spawn(process.execPath, [serverPath], {
      stdio: ["ignore", "inherit", "inherit"],
      env: childEnv,
      cwd: repoRoot,
    });
    // Attach signal + child-exit handlers IMMEDIATELY after spawn so Ctrl+C
    // during the readiness probe below still kills the child cleanly (the
    // URL is not printed until the probe succeeds, but the handlers must be
    // wired the whole time).
    const forward = (signal: NodeJS.Signals): void => {
      child.kill(signal);
    };
    process.on("SIGINT", () => forward("SIGINT"));
    process.on("SIGTERM", () => forward("SIGTERM"));
    child.on("exit", (code, sig) => {
      if (sig) {
        process.exit(0);
      }
      process.exit(code ?? 0);
    });
    // Close the spawn->URL race: the oracle extracts the URL on first sight
    // and fires assertions immediately. Printing the URL before Next.js is
    // accepting connections produced empty bodies / `000` (observed: URL at
    // ~200ms, /api/state 200 at ~300ms). Wait for ANY HTTP response first.
    try {
      await waitForReady(port);
    } catch (err) {
      process.stderr.write(`toolbox serve: ${String((err as Error).message)}\n`);
      try {
        child.kill("SIGTERM");
      } catch {
        // child already gone — nothing to do; the exit handler will fire
      }
      process.exit(1);
    }
    process.stdout.write(`toolBox observer: http://127.0.0.1:${port}/\n`);
  };

  if (!useEphemeral) {
    void boot(requestedPort);
    return;
  }
  ephemeralPort().then(
    (port) => void boot(port),
    (err) => {
      process.stderr.write(
        `toolbox serve: could not resolve a free port: ${String((err as Error).message)}\n`,
      );
      process.exit(1);
    },
  );
}

interface Flags {
  positional: string[];
  options: Map<string, string | boolean>;
}

function parseFlags(argv: string[], booleans: Set<string>): Flags | null {
  const positional: string[] = [];
  const options = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      options.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const name = arg.slice(2);
    if (booleans.has(name)) {
      options.set(name, true);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) {
      process.stderr.write(`option --${name} needs a value\n`);
      return null;
    }
    options.set(name, value);
    i++;
  }
  return { positional, options };
}

function intOption(flags: Flags, name: string, dflt: number): number {
  const raw = flags.options.get(name);
  if (raw === undefined || raw === true) {
    return dflt;
  }
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isNaN(parsed) ? dflt : parsed;
}

export function main(argv: string[]): number {
  const flags = parseFlags(
    argv,
    new Set(["json", "register", "strict", "run-verifier", "html", "no-open"]),
  );
  if (flags === null) {
    return 2;
  }
  const command = flags.positional.shift();
  if (!command) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const hroot = handymanRoot((flags.options.get("handyman-root") as string) ?? null);
  const stamp = (flags.options.get("date") as string) || todayStamp();
  const asJson = flags.options.get("json") === true;

  switch (command) {
    case "register": {
      const target = flags.positional[0];
      if (!target) {
        process.stderr.write("usage: toolbox.js register PATH [--date D]\n");
        return 2;
      }
      return cmdRegister(hroot, target, stamp);
    }
    case "unregister": {
      const target = flags.positional[0];
      if (!target) {
        process.stderr.write("usage: toolbox.js unregister PATH\n");
        return 2;
      }
      return cmdUnregister(hroot, target);
    }
    case "list":
      return cmdList(hroot, asJson);
    case "discover": {
      const scan = flags.options.get("scan");
      if (typeof scan !== "string") {
        process.stderr.write(
          "usage: toolbox.js discover --scan DIR [--register] [--max-depth N]\n",
        );
        return 2;
      }
      return cmdDiscover(
        hroot,
        scan,
        flags.options.get("register") === true,
        intOption(flags, "max-depth", 4),
        stamp,
      );
    }
    case "status":
      return cmdStatus(
        hroot,
        asJson,
        flags.options.get("run-verifier") === true,
        intOption(flags, "verifier-timeout", 300),
      );
    case "health":
      return cmdHealth(
        hroot,
        asJson,
        flags.options.get("strict") === true,
        intOption(flags, "stale-days", 7),
        intOption(flags, "idle-days", 14),
        (flags.options.get("today") as string) ?? null,
      );
    case "heartbeat":
      return cmdHeartbeat(
        hroot,
        (flags.options.get("root") as string) || ".",
        (flags.options.get("feature") as string) ?? null,
        (flags.options.get("date") as string) ?? null,
      );
    case "timeline":
      return cmdTimeline(hroot, asJson, intOption(flags, "limit", 0));
    case "moc":
      return cmdMoc(hroot, flags.options.get("html") === true);
    case "serve": {
      // `serve` is long-running (spawns + blocks on the Next standalone
      // child). main() is normally only called for the short-lived
      // subcommands; the direct-execution guard at the bottom routes
      // `toolbox.js serve` to serveMain BEFORE main() so the sync
      // process.exit path never runs for it. If a programmatic caller
      // invokes main(["serve", ...]) anyway, hand off to serveMain; the
      // child's exit handler will end the process (main's numeric return
      // is unreachable in that path).
      const portRaw = flags.options.get("port");
      const tail: string[] = portRaw !== undefined ? ["--port", String(portRaw)] : [];
      serveMain(tail);
      return 0;
    }
    case "review-notes":
      // Async: the direct-execution guard routes it before main() is ever
      // called. A programmatic caller must await reviewNotesMain itself.
      process.stderr.write(
        `${REVIEW_NOTES_USAGE}\nreview-notes is async; call reviewNotesMain() directly.\n`,
      );
      return 2;
    default:
      process.stderr.write(`${USAGE}\nunknown subcommand: ${command}\n`);
      return 2;
  }
}

// Run when executed directly (mirrors Python `if __name__ == "__main__"`).
// `serve` is long-running: it spawns the Next standalone child and blocks on
// it, so it must dodge the sync process.exit path used by the other
// subcommands.
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv[0] === "serve") {
    serveMain(argv.slice(1));
  } else if (argv[0] === "review-notes") {
    // Async like serve, so it must dodge the sync process.exit path too.
    reviewNotesMain(argv.slice(1)).then(
      (code) => process.exit(code),
      (error) => {
        process.stderr.write(
          `review-notes: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exit(1);
      },
    );
  } else {
    process.exit(main(argv));
  }
}
