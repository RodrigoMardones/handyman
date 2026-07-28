/**
 * Shared loader for /agent and /api/agent (feature 95 web_live_agent_view).
 *
 * The view deliberately does NOT read the Flue wire protocol (unstable in
 * beta): it reads the flue-handyman package's own telemetry, one sanitized
 * JSONL file per agent instance at
 * agents/flue-handyman/logs/agent-<feature>.jsonl (see that package's
 * src/ports/telemetry-sink.ts for the stable, PII-free projection: contents
 * arrive as { chars: N } and only whitelisted scalars are kept), plus an
 * HTTP liveness probe against the runtime.
 *
 * Never throws: every failure degrades to runtime:"offline" and/or
 * telemetry:null; the callers (route handler and Server Component) decide
 * the outer shape. Both import this module so the SSR render and the
 * polling client always speak the same state.
 */
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentTelemetrySummary, AgentViewState } from "../../agent/agentHtml";

/** Feature names double as a file-name fragment: this whitelist is the whole
 *  path-traversal defense, so the JSONL path below needs no further
 *  sanitizing. */
export const FEATURE_NAME_RE = /^[A-Za-z0-9_-]+$/;

export function isValidFeatureName(feature: string): boolean {
  return FEATURE_NAME_RE.test(feature);
}

/** Read at most the tail of the JSONL: active agents append forever and the
 *  view only needs recent activity. A mid-line cut is fine: the tolerant
 *  parser skips the unparseable first line like any other invalid line. */
const MAX_TAIL_BYTES = 256 * 1024;

/** Keep only the last N submission settlements for the outcomes list. */
const MAX_OUTCOMES = 5;

/** Mirror of SLOW_OPERATION_MS in
 *  agents/flue-handyman/src/ports/telemetry-sink.ts. Duplicated on purpose:
 *  apps/web never imports across packages. */
const SLOW_OPERATION_MS = 300_000;

/** Liveness probe budget: the runtime is local, so anything longer is down. */
const PROBE_TIMEOUT_MS = 1500;

function logsDir(): string {
  return (
    process.env.FLUE_AGENT_LOGS_DIR ??
    join(process.cwd(), "..", "..", "agents", "flue-handyman", "logs")
  );
}

/** Any HTTP response (even a 404) proves something answers on the port; only
 *  a thrown fetch (ECONNREFUSED, timeout, DNS) means offline. */
async function probeRuntime(): Promise<"online" | "offline"> {
  try {
    await fetch(process.env.FLUE_BASE_URL ?? "http://127.0.0.1:3583", {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    return "online";
  } catch {
    return "offline";
  }
}

/** The tail of the file as text, or null when it is missing/unreadable. */
function readTail(file: string): string | null {
  try {
    const size = statSync(file).size;
    const length = Math.min(size, MAX_TAIL_BYTES);
    const fd = openSync(file, "r");
    try {
      const buffer = Buffer.alloc(length);
      const bytesRead = readSync(fd, buffer, 0, length, size - length);
      return buffer.toString("utf8", 0, bytesRead);
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** Event timestamps arrive as ISO strings (or epoch millis); anything else
 *  is dropped. Never the wall clock: the header must show event time. */
function normTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value !== "") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/** Tolerant aggregation: invalid lines are skipped, never fatal. */
function summarizeTail(text: string): AgentTelemetrySummary {
  const summary: AgentTelemetrySummary = {
    total: 0,
    byType: {},
    lastType: null,
    lastTimestamp: null,
    outcomes: [],
    toolErrors: 0,
    slowOps: 0,
  };
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event === null || typeof event !== "object") {
      continue;
    }
    summary.total += 1;
    const type = typeof event.type === "string" ? event.type : "unknown";
    summary.byType[type] = (summary.byType[type] ?? 0) + 1;
    summary.lastType = type;
    // The last KNOWN event time wins: an event without a timestamp does not
    // erase the previous one (the header shows "last activity").
    const timestamp = normTimestamp(event.timestamp);
    if (timestamp !== null) {
      summary.lastTimestamp = timestamp;
    }
    if (type === "tool" && event.isError === true) {
      summary.toolErrors += 1;
    }
    if (
      type === "operation" &&
      typeof event.durationMs === "number" &&
      event.durationMs > SLOW_OPERATION_MS
    ) {
      summary.slowOps += 1;
    }
    if (type === "submission_settled") {
      summary.outcomes.push({
        submissionId: typeof event.submissionId === "string" ? event.submissionId : null,
        outcome: typeof event.outcome === "string" ? event.outcome : null,
      });
    }
  }
  summary.outcomes = summary.outcomes.slice(-MAX_OUTCOMES);
  return summary;
}

/** Load the live view state for one already-validated feature. Never throws. */
export async function loadAgentState(feature: string): Promise<AgentViewState> {
  let telemetry: AgentTelemetrySummary | null = null;
  try {
    const tail = readTail(join(logsDir(), `agent-${feature}.jsonl`));
    if (tail !== null) {
      telemetry = summarizeTail(tail);
    }
  } catch {
    telemetry = null;
  }
  const runtime = await probeRuntime();
  return { runtime, feature, telemetry };
}
