// Handyman leader agent (phase 1: SUPERVISOR). The leader owns the cycle
// verbs and delegates implementation/review to subagents whose tool sets are
// code (src/domain/role-tools.ts): a reviewer cannot mutate feature state by
// construction. Subagent context isolation is configured by the DRIVER via
// delegation.messageFilter — each delegation sees only its task prompt,
// never the leader's transcript (equivalent to Flue's built-in `task`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Agent, MCPClient } from '../mastra';
import type { Memory } from '../mastra';
import { resolveModel, resolveRoleModels } from '../ports/model-catalog';
import { businessMemorySnapshot } from '../ports/memory';
import { implementerVerbs, reviewerVerbs, toolsForVerbs } from '../domain/role-tools';

// Repo root: the documented runtime (tsx run-feature.ts from this package's
// dir) anchors on cwd; HANDYMAN_REPO_ROOT overrides when running from
// anywhere else. Same convention as the Flue package.
const REPO_ROOT = process.env.HANDYMAN_REPO_ROOT ?? join(process.cwd(), '..', '..');
// Handyman project this agent drives: the monorepo itself by default, any
// other handyman-scaffolded root via HANDYMAN_PROJECT_ROOT (e.g. a scratch
// project for spikes).
export const PROJECT = process.env.HANDYMAN_PROJECT_ROOT ?? REPO_ROOT;
// Handyman MCP endpoint (node handyman/dist/mcp.js --http).
const MCP_URL = process.env.HANDYMAN_MCP_URL ?? 'http://127.0.0.1:8177/mcp';

const MODELS = resolveRoleModels();

/** Role prompt body from handyman/assets/role-<role>.template.md (frontmatter stripped). */
export function roleBody(role: string): string {
  const raw = readFileSync(join(REPO_ROOT, 'handyman', 'assets', `role-${role}.template.md`), 'utf-8');
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

// Instructions are FUNCTIONS (phase 2): Mastra re-resolves them per call, so
// edits to role templates and to .handyman/memory/*.md are picked up without
// restarting. The business-memory snapshot goes to the LEADER only — the
// subagents stay lean and task-grounded (delegation isolation by design).
function leaderInstructions(): string {
  return `
${roleBody('leader')}

## Concrete protocol (this deployment)

You drive the handyman harness ONLY through your MCP tools (prefixed
handyman_). The project root for every call is "${PROJECT}" (pass it as
the "project" argument). The user message names the feature to work on.

Execute this sequence, in order, waiting for each result:
1. handyman_feature_add with the given name, a short title, a one-line
   description and one acceptance criterion. If the feature already exists
   the tool errors — note it and continue.
2. handyman_feature_start with the same name and no_preflight true.
3. Delegate to the implementer subagent: tell it the feature name and that
   it must log each step with handyman_feature_log and finish by writing
   its implementation report with handyman_report_write (kind "impl",
   feature = the name, content = summary of what was done).
4. Delegate to the reviewer subagent: tell it the feature name and that it
   must stamp its verdict with handyman_backlog_review (status "approved"
   or "changes_requested").
5. Only if the reviewer approved: handyman_feature_close with the name.
   If the close is refused (red verifier), report the refusal verbatim and
   stop. If the reviewer requested changes, report them and stop.

HARD STOP rule: every tool call above targets EXACTLY the project
"${PROJECT}". If that project's harness is missing or broken (feature_add
errors because the workspace does not exist), STOP and report the bootstrap
need — NEVER switch to another registered harness (harness_list/fleet_*
are read-only probes for observation, never a fallback target). A 2026-07-28
run with a broken scratch project drifted into the monorepo's feature list;
that is contamination, not initiative.

Finish with one short line per step: tool/delegation and outcome, plus the
final feature status. Do not call tools outside this protocol yourself
(steps 3-4 are delegations, not direct work).${businessMemorySnapshot(PROJECT)}`;
}

function implementerInstructions(): string {
  return `
${roleBody('implementer')}

## Concrete protocol (this deployment)
You operate ONLY through your handyman_ tools on project "${PROJECT}".
Your step budget is LIMITED — spend it on your two required writes, not on
exploration (the leader already validated the harness; do NOT run
preflight/metrics/verify probes).
For the feature named in the task, in this order:
1. handyman_feature_log with a one-line note (what you did for the feature).
2. handyman_report_write (kind "impl", feature = the name, content = what
   you did and why it meets the acceptance criteria). This write is your
   deliverable: a task without the report written is a FAILED task.
3. Reply with the report path and nothing else.
Write the report ONLY through handyman_report_write — the MCP tool stamps
the house frontmatter and enforces the never-overwrite policy. Never claim
the report exists unless the tool call succeeded.`;
}

function reviewerInstructions(): string {
  return `
${roleBody('reviewer')}

## Concrete protocol (this deployment)
You operate ONLY through your handyman_ tools on project "${PROJECT}"
(read-only probes plus backlog_review) — you have NO state-mutation verbs,
by design. Your step budget is LIMITED: go straight to the verdict.
For the feature named in the task: assess the implementation against the
acceptance criteria using the task text (what the implementer reported) and,
if needed, one or two probes. Then stamp your verdict with
handyman_backlog_review (status "approved" or "changes_requested") — the
verdict is your deliverable; a review without the stamp is a FAILED review.
Reply with the verdict and one line of justification. Never claim you
stamped unless the tool call succeeded.`;
}

/** Connect to the handyman MCP server and return the full tool map. */
export async function connectHandymanMcp() {
  const mcp = new MCPClient({
    id: 'handyman',
    servers: { handyman: { url: new URL(MCP_URL) } },
  });
  const tools = (await mcp.listTools()) as Record<string, unknown>;
  const count = Object.keys(tools).length;
  if (count === 0) throw new Error(`MCP at ${MCP_URL} exposed 0 tools`);
  console.log(`[mcp] connected to ${MCP_URL}: ${count} tools`);
  return { tools, mcp };
}

// Per-role generation defaults. maxSteps: a delegation does NOT inherit the
// leader's maxSteps — without these the subagent falls back to the Mastra
// default of 5, which cut the implementer off before report_write landed
// (found in the sup_loop_1/sup_mixed_kimi runs: leader narrated "report
// written", disk said otherwise). maxOutputTokens: Mastra's registry does
// not know glm-5.2 and caps output at 4096 with a warning; GLM also burns
// output tokens on thinking, so keep the cap generous (Flue used 16384).
const ROLE_DEFAULT_OPTIONS = {
  maxSteps: 15,
  modelSettings: { maxOutputTokens: 16384 },
} as const;

/** Phase-1 supervisor + phase-2 memory: leader + implementer/reviewer
 *  subagents, each role with its own model (env-overridable) and its own MCP
 *  tool set. Conversation memory attaches to the LEADER only — delegation
 *  threads stay ephemeral (fresh thread per delegation, lastMessages off),
 *  which preserves subagent isolation and avoids junk threads. */
export async function createHandymanLeader(
  tools: Record<string, unknown>,
  options: { memory?: Memory } = {},
) {
  const implementer = new Agent({
    id: 'implementer',
    name: 'Implementer',
    description:
      'Implements exactly one feature: logs each step via feature_log and writes the impl report via report_write. Delegate the implementation step of a feature to it.',
    instructions: implementerInstructions,
    model: resolveModel(MODELS.implementer),
    tools: toolsForVerbs(tools, implementerVerbs()) as never,
    defaultOptions: ROLE_DEFAULT_OPTIONS,
  });

  const reviewer = new Agent({
    id: 'reviewer',
    name: 'Reviewer',
    description:
      'Reviews one implemented feature against its acceptance criteria and stamps the verdict via backlog_review. Delegate the review step to it after implementation.',
    instructions: reviewerInstructions,
    model: resolveModel(MODELS.reviewer),
    tools: toolsForVerbs(tools, reviewerVerbs()) as never,
    defaultOptions: ROLE_DEFAULT_OPTIONS,
  });

  return new Agent({
    id: 'handyman-leader',
    name: 'Handyman Leader',
    description:
      'Handyman leader: orchestrates implementer/reviewer subagents over the handyman MCP server.',
    instructions: leaderInstructions,
    model: resolveModel(MODELS.leader),
    tools: tools as never,
    agents: { implementer, reviewer },
    defaultOptions: ROLE_DEFAULT_OPTIONS,
    ...(options.memory ? { memory: options.memory } : {}),
  });
}
