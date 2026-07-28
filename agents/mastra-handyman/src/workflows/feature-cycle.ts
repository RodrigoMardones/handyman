// Feature-cycle workflow (phase 3, strategy 2 of the spike): the WORKFLOW is
// the orchestrator — no leader LLM routing the cycle. The deterministic verbs
// (add/start/close) call the handyman MCP tools directly from the steps; only
// implement/review are agent calls (same role instructions, same per-role MCP
// tool sets, same isolation: each agent generate is a fresh context).
//
// Error policy (the handyman taxonomy mapped to workflow mechanics):
//   - business outcomes (already-exists tolerated, red verifier, human reject)
//     → typed values or bail() with the WORKFLOW output — never retried;
//   - transient infra (MCP transport, model stream) → throw + retryConfig
//     (workflow-level) / retries (agent steps).
//
// Durability: step snapshots persist in LibSQL (the workflow registers in the
// Mastra instance against the composite store). A suspended run survives
// processes — the human resumes it from the CLI later; a killed process is
// retaken with createRun({ runId }) + run.restart() from the last completed
// step (verified in the wf_crash run, see the phase-3 impl report).
//
// DOUBLE-TRUTH RULE (decision documented in README + impl report): the
// snapshot in mastra.db is OPERATIONAL state only (current step, suspend
// payloads) — disposable and re-derivable. The BUSINESS truth stays in
// <PROJECT>/.handyman/feature_list.json, written exclusively via MCP tools.
// If they ever disagree, the disk wins: abandon the run and re-derive where
// the cycle is from the feature status.
import { z } from 'zod';
import type { createRoleAgents } from '../agents/handyman-leader';
import { createStep, createWorkflow } from '../mastra';

// ---------------------------------------------------------------------------
// MCP invocation from steps (no agent in the loop for the deterministic verbs)
// ---------------------------------------------------------------------------

interface ExecutableTool {
  execute?: (input: unknown, context?: unknown) => Promise<unknown>;
}

export interface McpCallResult {
  ok: boolean;
  data: Record<string, unknown>;
  error?: string;
}

/** Call one handyman MCP tool from a workflow step and normalize the envelope:
 *  - execute throws        → { ok:false, error }  (transport/validation failure)
 *  - isError envelope      → { ok:false, error }  (server-side exception)
 *  - otherwise             → { ok:true, data }    (structuredContent preferred)
 *  NOTE: CLI verbs report business failures as DATA ({ exit != 0, output }) —
 *  never via isError — so callers must inspect data.exit / data.closed. */
export async function callHandymanTool(
  tools: Record<string, unknown>,
  verb: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const tool = tools[`handyman_${verb}`] as ExecutableTool | undefined;
  if (!tool || typeof tool.execute !== 'function') {
    return { ok: false, data: {}, error: `MCP tool handyman_${verb} is not available` };
  }
  let raw: unknown;
  try {
    raw = await tool.execute(args);
  } catch (error) {
    return { ok: false, data: {}, error: error instanceof Error ? error.message : String(error) };
  }
  const envelope = (raw ?? {}) as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (envelope.content ?? [])
    .filter((c) => c?.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');
  if (envelope.isError) return { ok: false, data: {}, error: text || 'MCP tool returned isError' };
  if (envelope.structuredContent && typeof envelope.structuredContent === 'object') {
    return { ok: true, data: envelope.structuredContent };
  }
  if (!envelope.content && typeof raw === 'object' && raw !== null && Object.keys(raw).length > 0) {
    // The wrapper already unwrapped the payload.
    return { ok: true, data: raw as Record<string, unknown> };
  }
  try {
    return { ok: true, data: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { ok: true, data: text ? { output: text } : {} };
  }
}

/** Most informative line of a CLI verb payload (for typed outcomes). The CLIs
 *  print a terse `status: error` line AND an explanatory error line (on
 *  different streams, order not guaranteed) — prefer the explanatory one. */
export function failureDetail(data: Record<string, unknown>): string {
  const out = data.output ?? data.error ?? data.hint;
  const text = typeof out === 'string' ? out : JSON.stringify(data);
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const explanatory = lines.find((l) => /error|fail|refus|denied/i.test(l) && !/^status\s*:/i.test(l));
  return (explanatory ?? lines[0] ?? '').slice(0, 300);
}

/** True when a CLI verb payload reports a business failure (exit != 0). */
export function cliFailed(data: Record<string, unknown>): boolean {
  return typeof data.exit === 'number' && data.exit !== 0;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** What flows between steps (and the workflow input). */
const carriedSchema = z.object({
  feature: z.string(),
  detail: z.string().optional(),
});

/** Typed business outcome of the whole cycle — the workflow output. */
const cycleOutputSchema = z.object({
  feature: z.string(),
  outcome: z.enum(['done', 'changes_requested', 'close_rejected', 'add_failed', 'start_failed']),
  detail: z.string().optional(),
});
type CycleOutput = z.infer<typeof cycleOutputSchema>;

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export function createFeatureCycleWorkflow(opts: {
  tools: Record<string, unknown>;
  agents: ReturnType<typeof createRoleAgents>;
  project: string;
}) {
  const { tools, agents, project } = opts;

  const addFeature = createStep({
    id: 'add-feature',
    description: 'feature_add via MCP; an already-existing feature is noted, not fatal',
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    execute: async ({ inputData, bail }) => {
      const res = await callHandymanTool(tools, 'feature_add', {
        project,
        name: inputData.feature,
        title: inputData.feature,
        description: `Workflow-driven cycle for ${inputData.feature}`,
        acceptance: ['The add→start→implement→review→close cycle completes via the Mastra workflow'],
      });
      if (res.ok && !cliFailed(res.data)) {
        return { feature: inputData.feature, detail: 'feature_add: added' };
      }
      const detail = res.error ?? failureDetail(res.data);
      // Same tolerance as the leader protocol: re-adding an existing feature is noted.
      if (/already exists/i.test(detail)) {
        return { feature: inputData.feature, detail: `feature_add: noted (${detail})` };
      }
      // HARD STOP equivalent (never drift to another project): typed outcome, run ends.
      return bail<CycleOutput>({ feature: inputData.feature, outcome: 'add_failed', detail });
    },
  });

  const startFeature = createStep({
    id: 'start-feature',
    description: 'feature_start via MCP (no_preflight, same as the leader protocol)',
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    execute: async ({ inputData, bail }) => {
      const res = await callHandymanTool(tools, 'feature_start', {
        project,
        name: inputData.feature,
        no_preflight: true,
      });
      if (res.ok && !cliFailed(res.data)) {
        return { feature: inputData.feature, detail: 'feature_start: in_progress' };
      }
      return bail<CycleOutput>({
        feature: inputData.feature,
        outcome: 'start_failed',
        detail: res.error ?? failureDetail(res.data),
      });
    },
  });

  // Agent steps are REGULAR steps that call agent.generate() in execute —
  // NOT createStep(agent) + .map() adapters. Two reasons: (1) the carried
  // schema flows end-to-end with no mapping glue; (2) Mastra 1.53.0 has a
  // restart bug: after a kill, a step whose predecessor is a .map() mapping
  // receives `undefined` input (reproduced deterministically in the wf_crash
  // run and with a toy workflow — see the phase-3 impl report). No mappings
  // anywhere in this graph keeps crash recovery honest.
  const implement = createStep({
    id: 'implement',
    description: 'implementer agent: feature_log + report_write through its MCP tool set',
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    retries: 1,
    execute: async ({ inputData }) => {
      const result = await agents.implementer.generate(
        `Implement the feature "${inputData.feature}" now: your two required writes (handyman_feature_log, then handyman_report_write with kind "impl" for feature "${inputData.feature}"). If the report already exists (a previous attempt completed it), reply with its path — never claim a write that did not succeed. Reply with the report path.`,
      );
      return { feature: inputData.feature, detail: `implementer: ${result.text}` };
    },
  });

  const review = createStep({
    id: 'review',
    description: 'reviewer agent: stamps backlog_review (approved | changes_requested)',
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    retries: 1,
    execute: async ({ inputData }) => {
      // Parity with the leader topology: the reviewer's task carries what the
      // implementer reported as a fallback; the reviewer also reads the impl
      // report from disk via its read-only workspace filesystem (the backlog
      // lives at .handyman/backlog/ in the project root).
      const result = await agents.reviewer.generate(
        `Review the feature "${inputData.feature}" now and stamp your verdict with handyman_backlog_review ("approved" or "changes_requested"). The implementer reported: ${inputData.detail ?? '(no implementer output)'}. Reply with the verdict and one line of justification.`,
      );
      return { feature: inputData.feature, detail: `reviewer: ${result.text}` };
    },
  });

  const humanReview = createStep({
    id: 'human-review',
    description:
      'HITL gate: suspends with the reviewer verdict until a human approves/rejects from the CLI',
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    suspendSchema: z.object({
      feature: z.string(),
      review: z.string(),
    }),
    resumeSchema: z.object({
      approved: z.boolean(),
      feedback: z.string().optional(),
    }),
    execute: async ({ inputData, resumeData, suspend, bail }) => {
      if (!resumeData) {
        return await suspend({ feature: inputData.feature, review: inputData.detail ?? '(no review text)' });
      }
      if (!resumeData.approved) {
        return bail<CycleOutput>({
          feature: inputData.feature,
          outcome: 'changes_requested',
          detail: resumeData.feedback ?? 'rejected by human reviewer',
        });
      }
      return { feature: inputData.feature, detail: resumeData.feedback ?? 'approved by human' };
    },
  });

  const closeFeature = createStep({
    id: 'close-feature',
    description: 'feature_close via MCP (verifier-gated); a refusal is a typed outcome, not a retry',
    inputSchema: carriedSchema,
    outputSchema: cycleOutputSchema,
    execute: async ({ inputData, bail }) => {
      const res = await callHandymanTool(tools, 'feature_close', { project, name: inputData.feature });
      if (res.ok && res.data.closed === true) {
        return { feature: inputData.feature, outcome: 'done' as const, detail: inputData.detail };
      }
      // Red verifier / state check: business refusal, never retried by design.
      return bail<CycleOutput>({
        feature: inputData.feature,
        outcome: 'close_rejected',
        detail: res.ok ? failureDetail(res.data) : res.error,
      });
    },
  });

  return (
    createWorkflow({
      id: 'feature-cycle',
      description:
        'Handyman feature cycle over MCP: add → start → implement (agent) → review (agent) → human gate (suspend/resume) → close (verifier-gated)',
      inputSchema: carriedSchema,
      outputSchema: cycleOutputSchema,
      // Transient infra only: business outcomes are values/bail and never reach the retrier.
      retryConfig: { attempts: 2, delay: 1000 },
    })
      .then(addFeature)
      .then(startFeature)
      .then(implement)
      .then(review)
      .then(humanReview)
      .then(closeFeature)
      .commit()
  );
}
