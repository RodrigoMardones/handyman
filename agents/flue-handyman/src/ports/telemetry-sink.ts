// Telemetry sink (feature 92): subscribes to the Flue runtime's observe()
// stream and writes one JSONL file per agent instance, plus outcome-oriented
// console lines. Two hard rules:
//   1. NEVER log message content (model I/O may carry PII): text/thinking
//      deltas, message/request/response payloads and tool args/results are
//      recorded as sizes ({ chars }), never verbatim.
//   2. Console output is OUTCOME-oriented (submission settlements, failed
//      runs/operations, slow operations) — not nested errors the agent can
//      recover from (a failed tool call is data for the model, not an alert).
//
// createTelemetrySink() builds the pure subscriber (unit-testable, dir and
// console injected); installTelemetrySink() wires it to observe() once per
// process from app.ts.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { observe } from '../flue';
import type { FlueEvent } from '../flue';

/** Operations longer than this are surfaced as slow outcomes. */
export const SLOW_OPERATION_MS = 300_000;

/** Event fields copied verbatim: correlation ids + safe scalars only. */
const SAFE_FIELDS = new Set([
  'v', 'eventIndex', 'timestamp',
  'runId', 'instanceId', 'dispatchId', 'submissionId', 'agentName',
  'conversationId', 'session', 'parentSession', 'taskId', 'harness',
  'operationId', 'turnId', 'type',
  'durationMs', 'isError', 'toolName', 'toolCallId', 'level', 'outcome',
  'operationKind', 'purpose', 'reason', 'estimatedTokens', 'messagesBefore',
  'messagesAfter', 'workflowName', 'startedAt', 'agent', 'cwd',
]);

/** Object fields copied verbatim (all-numeric, high signal). */
const SAFE_OBJECTS = new Set(['usage']);

function sizeOf(value: unknown): number {
  if (typeof value === 'string') return value.length;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Error payloads are caller-safe by Flue convention (type + message are
 *  designed for the wire): keep those two, drop everything else. */
function projectError(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    const err = value as Record<string, unknown>;
    return { type: err.type ?? err.name ?? 'unknown', message: String(err.message ?? '') };
  }
  return { message: String(value) };
}

/** Project a raw FlueEvent into the sanitized shape written to disk. */
export function projectEvent(event: FlueEvent): Record<string, unknown> {
  const raw = event as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SAFE_FIELDS.has(key)) {
      if (value !== undefined && value !== null && typeof value !== 'object') out[key] = value;
    } else if (SAFE_OBJECTS.has(key)) {
      out[key] = value;
    } else if (key === 'error') {
      out[key] = projectError(value);
    } else {
      out[key] = { chars: sizeOf(value) };
    }
  }
  return out;
}

function fileSafe(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_');
}

export interface TelemetrySinkOptions {
  dir: string;
  /** Outcome lines (defaults to console.log / console.warn; injected in tests). */
  info?: (line: string) => void;
  warn?: (line: string) => void;
}

/** Build the observe() subscriber: appends sanitized JSONL per instance and
 *  emits outcome-oriented console lines. */
export function createTelemetrySink(options: TelemetrySinkOptions) {
  mkdirSync(options.dir, { recursive: true });
  const info = options.info ?? ((line: string) => console.log(line));
  const warn = options.warn ?? ((line: string) => console.warn(line));

  return (event: FlueEvent): void => {
    const raw = event as unknown as Record<string, unknown>;
    const instance = typeof raw.instanceId === 'string' ? raw.instanceId : 'process';
    appendFileSync(
      join(options.dir, `agent-${fileSafe(instance)}.jsonl`),
      JSON.stringify(projectEvent(event)) + '\n',
    );

    if (event.type === 'submission_settled') {
      const line = `[telemetry] submission ${raw.submissionId ?? '?'} ${raw.outcome ?? '?'} (instance ${instance})`;
      raw.outcome === 'completed' ? info(line) : warn(line);
    } else if (event.type === 'run_end' && raw.isError === true) {
      warn(`[telemetry] run ${raw.runId ?? '?'} ended with error (instance ${instance})`);
    } else if (event.type === 'operation' && raw.isError === true) {
      warn(`[telemetry] operation ${raw.operationKind ?? '?'} failed (instance ${instance})`);
    } else if (
      event.type === 'operation' &&
      typeof raw.durationMs === 'number' &&
      raw.durationMs > SLOW_OPERATION_MS
    ) {
      warn(`[telemetry] slow operation ${raw.operationKind ?? '?'}: ${raw.durationMs}ms (instance ${instance})`);
    }
  };
}

/** Wire the sink to the runtime's observe() stream. Returns the unsubscribe. */
export function installTelemetrySink(options: { dir?: string } = {}): () => void {
  const dir =
    options.dir ?? process.env.HANDYMAN_TELEMETRY_DIR ?? join(process.cwd(), 'logs');
  return observe(createTelemetrySink({ dir }));
}
