import { defineAgent, defineAgentProfile, connectMcpServer } from '../flue';
import { AGENT_TUNING, resolveRoleModels } from '../ports/model-catalog';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Repo root. Both documented runtimes (flue dev via pnpm --filter, and the
// built server via pnpm agents:start) run with cwd = this package's dir, so
// cwd is the stable anchor — deriving from import.meta.url breaks under
// bundling (dist/server.mjs sits shallower than src/agents/), which crashed
// the stable server at boot looking for handyman/assets under the wrong root.
// HANDYMAN_REPO_ROOT overrides when running from anywhere else.
const REPO_ROOT = process.env.HANDYMAN_REPO_ROOT ?? join(process.cwd(), '..', '..');
// Handyman project this agent drives: the monorepo itself by default, any
// other handyman-scaffolded root via HANDYMAN_PROJECT_ROOT (e.g. a scratch
// project for spikes).
const PROJECT = process.env.HANDYMAN_PROJECT_ROOT ?? REPO_ROOT;
// Handyman MCP endpoint (node handyman/dist/mcp.js --http).
const MCP_URL = process.env.HANDYMAN_MCP_URL ?? 'http://127.0.0.1:8177/mcp';

// Per-role model specs resolve through the model catalog (env-overridable,
// default GLM-5.2 on Z.AI for every role).
const MODELS = resolveRoleModels();

/** Role prompt body from handyman/assets/role-<role>.template.md (frontmatter stripped). */
function roleBody(role: string): string {
  const raw = readFileSync(join(REPO_ROOT, 'handyman', 'assets', `role-${role}.template.md`), 'utf-8');
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

const leaderInstructions = `
${roleBody('leader')}

## Concrete protocol (this deployment)

You drive the handyman harness ONLY through its MCP tools (prefixed
mcp__handyman__). The project root for every call is "${PROJECT}" (pass it as
the "project" argument). The user message names the feature to work on.

Execute this sequence, in order, waiting for each result:
1. mcp__handyman__feature_add with the given name, a short title, a one-line
   description and one acceptance criterion. If the feature already exists the
   tool errors — note it and continue.
2. mcp__handyman__feature_start with the same name and no_preflight true.
3. Delegate to the implementer subagent (task tool, agent "implementer"):
   tell it the feature name and that it must log each step with
   mcp__handyman__feature_log and finish by writing its implementation report
   with mcp__handyman__report_write (kind "impl", feature = the name, content
   = summary of what was done).
4. Delegate to the reviewer subagent (task tool, agent "reviewer"):
   tell it the feature name and that it must stamp its verdict with
   mcp__handyman__backlog_review (status "approved" or "changes_requested").
5. Only if the reviewer approved: mcp__handyman__feature_close with the name.
   If the close is refused (red verifier), report the refusal verbatim and stop.
   If the reviewer requested changes, report them and stop.

Finish with one short line per step: tool/delegation and outcome, plus the
final feature status. Do not call tools outside this protocol yourself
(steps 3-4 are delegations, not direct work).`;

export const description =
  'Handyman leader: orchestrates implementer/reviewer subagents over the handyman MCP server.';

export const route = (c: any, next: any) => next();

export default defineAgent(async () => {
  const handyman = await connectMcpServer('handyman', {
    url: MCP_URL,
  });

  const implementer = defineAgentProfile({
    name: 'implementer',
    description:
      'Implements exactly one feature: logs each step via feature_log and writes the impl report via report_write. Delegate the implementation step of a feature to it.',
    instructions: `
${roleBody('implementer')}

## Concrete protocol (this deployment)
You operate ONLY through mcp__handyman__ tools on project "${PROJECT}".
For the feature named in the task: log each step with
mcp__handyman__feature_log, then write the implementation report with
mcp__handyman__report_write (kind "impl", feature = the name, content =
what you did and why it meets the acceptance criteria). Reply with the
report path.`,
    tools: handyman.tools,
    model: MODELS.implementer,
  });

  const reviewer = defineAgentProfile({
    name: 'reviewer',
    description:
      'Reviews one implemented feature against its acceptance criteria and stamps the verdict via backlog_review. Delegate the review step to it after implementation.',
    instructions: `
${roleBody('reviewer')}

## Concrete protocol (this deployment)
You operate ONLY through mcp__handyman__ tools on project "${PROJECT}".
For the feature named in the task: assess the implementation against the
acceptance criteria, then stamp your verdict with
mcp__handyman__backlog_review (status "approved" or "changes_requested").
Reply with the verdict and one line of justification.`,
    tools: handyman.tools,
    model: MODELS.reviewer,
  });

  return {
    model: MODELS.leader,
    tools: handyman.tools,
    subagents: [implementer, reviewer],
    instructions: leaderInstructions,
    ...AGENT_TUNING,
  };
});
