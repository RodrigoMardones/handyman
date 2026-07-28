import { defineAgent, defineAgentProfile, connectMcpServer, local } from '../flue';
import { AGENT_TUNING, resolveRoleModels } from '../ports/model-catalog';
import { implementerVerbs, reviewerVerbs, toolsForVerbs } from '../domain/role-tools';
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

// Per-role MCP tool sets live in src/domain/role-tools.ts (feature 97):
// leader = all 25; implementer = probes + feature_log + report_write;
// reviewer = probes + backlog_review. Roles are prompts, but the tool set is
// code — a reviewer cannot mutate feature state by construction.

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
report path. Write the report ONLY through mcp__handyman__report_write —
never create impl_<feature>.md with the sandbox write/edit/bash tools:
the MCP tool stamps the house frontmatter and enforces the
never-overwrite policy.`,
    tools: toolsForVerbs(handyman.tools, implementerVerbs()),
    model: MODELS.implementer,
  });

  const reviewer = defineAgentProfile({
    name: 'reviewer',
    description:
      'Reviews one implemented feature against its acceptance criteria and stamps the verdict via backlog_review. Delegate the review step to it after implementation.',
    instructions: `
${roleBody('reviewer')}

## Concrete protocol (this deployment)
You operate ONLY through your mcp__handyman__ tools on project "${PROJECT}"
(read-only probes plus backlog_review) — you have NO state-mutation verbs,
by design.
For the feature named in the task: assess the implementation against the
acceptance criteria, then stamp your verdict with
mcp__handyman__backlog_review (status "approved" or "changes_requested").
Ground the verdict in the real artifacts: your read/bash tools operate on
the REAL project filesystem (the sandbox is local, cwd = the project root),
so read the impl report at ${PROJECT}/.handyman/backlog/impl_<feature>.md
before deciding. Stamp the verdict ONLY through
mcp__handyman__backlog_review; afterwards you may enrich the review body
with edit, but never create review_<feature>.md from scratch with sandbox
tools — the MCP stamp carries verdict-conflict protection. Reply with the
verdict and one line of justification.`,
    tools: toolsForVerbs(handyman.tools, reviewerVerbs()),
    model: MODELS.reviewer,
  });

  return {
    model: MODELS.leader,
    tools: handyman.tools,
    subagents: [implementer, reviewer],
    instructions: leaderInstructions,
    // Ground the whole instance in the real project filesystem (feature 97):
    // with the default virtual sandbox, subagents' read/bash saw an empty
    // in-memory FS that does not match what the MCP writes on the host —
    // a reviewer once concluded an on-disk impl report "did not exist".
    sandbox: local({ cwd: PROJECT }),
    ...AGENT_TUNING,
  };
});
