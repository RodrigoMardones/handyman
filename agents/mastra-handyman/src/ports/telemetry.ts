// Telemetry port (phase 2), in-process equivalent of the Flue observe() sink.
// Two hard rules carried over verbatim:
//   1. NEVER log message content (model I/O may carry PII): text is recorded
//      as { chars }, tool calls as names + error flags, usage as numbers.
//   2. Console output is OUTCOME-oriented (run settled, step failures),
//      not nested errors the agent can recover from.
// Deep inspection (spans, per-call usage) lives in the Observability store —
// this JSONL is the per-feature EXECUTION trail that correlates with
// history.md (the BUSINESS trail), same split as the Flue package.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ToolCallLike {
  toolName?: string;
  payload?: { toolName?: string; args?: unknown };
}

export interface ToolResultLike {
  toolName?: string;
  isError?: boolean;
  payload?: { toolName?: string; result?: unknown; isError?: boolean };
}

export interface StepFinishLike {
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolCalls?: ToolCallLike[];
  toolResults?: ToolResultLike[];
  text?: string;
}

function fileSafe(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_');
}

export interface FeatureTelemetry {
  onStepFinish: (step: StepFinishLike) => void;
  settle: (outcome: 'completed' | 'failed', usage: unknown, extra?: Record<string, unknown>) => void;
  path: string;
}

/** Build the per-feature telemetry writer (logs/agent-<feature>.jsonl). */
export function createFeatureTelemetry(options: {
  dir: string;
  feature: string;
  modelSpec: string;
  info?: (line: string) => void;
  warn?: (line: string) => void;
}): FeatureTelemetry {
  mkdirSync(options.dir, { recursive: true });
  const path = join(options.dir, `agent-${fileSafe(options.feature)}.jsonl`);
  const info = options.info ?? ((line: string) => console.log(line));
  const warn = options.warn ?? ((line: string) => console.warn(line));

  const write = (record: Record<string, unknown>) =>
    appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n');

  write({ type: 'run_start', feature: options.feature, model: options.modelSpec });

  let stepIndex = 0;
  return {
    path,
    onStepFinish(step) {
      stepIndex += 1;
      // Tolerate both shapes seen in the wild: flat (AI SDK style) and
      // nested payload (result.steps style). Names only, never args/results.
      const toolCalls = (step.toolCalls ?? []).map((c) => ({
        toolName: c.toolName ?? c.payload?.toolName,
      }));
      const toolResults = (step.toolResults ?? []).map((r) => ({
        toolName: r.toolName ?? r.payload?.toolName,
        ...(r.isError || r.payload?.isError ? { isError: true } : {}),
      }));
      write({
        type: 'step_finish',
        step: stepIndex,
        finishReason: step.finishReason,
        usage: step.usage ?? null,
        toolCalls,
        toolResults,
        text: { chars: step.text?.length ?? 0 },
      });
      for (const r of toolResults) {
        if (r.isError) warn(`[telemetry] step ${stepIndex}: tool ${r.toolName ?? '?'} returned error (feature ${options.feature})`);
      }
    },
    settle(outcome, usage, extra) {
      write({ type: 'run_settled', outcome, usage: usage ?? null, ...extra });
      const line = `[telemetry] run ${outcome} (feature ${options.feature})`;
      outcome === 'completed' ? info(line) : warn(line);
    },
  };
}
