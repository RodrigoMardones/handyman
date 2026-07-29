// Handyman leader agent (phase 1: SUPERVISOR). The leader owns the cycle
// verbs and delegates implementation/review to subagents whose tool sets are
// code (src/domain/role-tools.ts): a reviewer cannot mutate feature state by
// construction. Subagent context isolation is configured by the DRIVER via
// delegation.messageFilter — each delegation sees only its task prompt,
// never the leader's transcript (equivalent to Flue's built-in `task`).
//
// Deployment values (roots, MCP URL, models) arrive INJECTED as AppConfig
// (src/ports/config.ts) — nothing here reads process.env at module level.
import { Agent, MCPClient } from '../../mastra';
import type { Memory } from '../../mastra';
import { resolveModel, roleDefaultOptions } from '../../ports/model-catalog';
import { businessMemorySnapshot } from '../../ports/memory';
import { webTools } from '../../ports/web-tools';
import { experimentalSkillDirs } from '../../ports/skills';
import { roleWorkspace } from '../../ports/workspace';
import type { AppConfig } from '../../ports/config';
import { createRoleAgents, roleBody } from './roles.agent';

// Instructions are FUNCTIONS (phase 2): Mastra re-resolves them per call, so
// edits to role templates and to .handyman/memory/*.md are picked up without
// restarting. The business-memory snapshot goes to the LEADER only — the
// subagents stay lean and task-grounded (delegation isolation by design).
function leaderInstructions(config: AppConfig): string {
  const project = config.projectRoot;
  return `
${roleBody('leader', config.repoRoot)}

## Concrete protocol (this deployment)

You drive the handyman harness ONLY through your MCP tools (prefixed
handyman_). The project root for every call is "${project}" (pass it as
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
   ALWAYS the SYNC handyman_feature_close — NEVER handyman_feature_close_async
   or handyman_task_result (the async pair is for slow verifiers driven by a
   human operator, not for this loop).

HARD STOP rule: every tool call above targets EXACTLY the project
    "${project}". If that project's harness is missing or broken (feature_add
errors because the workspace does not exist), STOP and report the bootstrap
need — NEVER switch to another registered harness (harness_list/fleet_*
are read-only probes for observation, never a fallback target). A 2026-07-28
run with a broken scratch project drifted into the monorepo's feature list;
that is contamination, not initiative.

Finish with one short line per step: tool/delegation and outcome, plus the
final feature status. Do not call tools outside this protocol yourself
(steps 3-4 are delegations, not direct work). Discipline rules learned from
live runs: each delegation happens EXACTLY ONCE (one implementer, one
reviewer — never re-delegate); you NEVER call feature_log, report_write or
backlog_review yourself (those belong to the subagents); and you NEVER probe
task_result (it serves the human-driven async close, not this loop).

Auxiliary capabilities (NOT part of the cycle protocol): a READ-ONLY
filesystem on the project root for grounding your routing decisions, and the
web_search/web_fetch pair for internet research when the operator asks for
investigation work. If a github_ tool is present (GITHUB_TOKEN configured)
it is yours alone — never delegate it.${businessMemorySnapshot(project)}`;
}

/** Connect to the handyman MCP server and return the full tool map. When
 *  GITHUB_TOKEN/GH_TOKEN is set, GitHub's official hosted MCP server joins
 *  the same client (leader-only by construction: the subagent verb filters
 *  match exact `handyman_` keys, so `github_*` tools never reach them).
 *  Local git stays in the implementer's workspace sandbox (git CLI). */
export async function connectHandymanMcp(config: AppConfig) {
  const mcp = new MCPClient({
    id: 'handyman',
    servers: {
      handyman: { url: new URL(config.mcpUrl) },
      ...(config.githubToken
        ? {
            github: {
              url: new URL('https://api.githubcopilot.com/mcp/'),
              requestInit: {
                headers: { Authorization: `Bearer ${config.githubToken}` },
              },
            },
          }
        : {}),
    },
  });
  const tools = (await mcp.listTools()) as Record<string, unknown>;
  const count = Object.keys(tools).length;
  if (count === 0) throw new Error(`MCP at ${config.mcpUrl} exposed 0 tools`);
  console.log(
    `[mcp] connected to ${config.mcpUrl}: ${count} tools${config.githubToken ? ' (github MCP on)' : ''}`,
  );
  return { tools, mcp };
}

/** Phase-1 supervisor + phase-2 memory: leader + implementer/reviewer
 *  subagents, each role with its own model and its own MCP tool set (both
 *  from the injected config). Conversation memory attaches to the LEADER
 *  only — delegation threads stay ephemeral (fresh thread per delegation,
 *  lastMessages off), which preserves subagent isolation and avoids junk
 *  threads. */
export async function createHandymanLeader(
  config: AppConfig,
  tools: Record<string, unknown>,
  options: {
    memory?: Memory;
    subagents?: ReturnType<typeof createRoleAgents>;
  } = {},
) {
  const { implementer, reviewer } = options.subagents ?? createRoleAgents(config, tools);
  // Experimental skills (agents/mastra-handyman/skills/*/SKILL.md) load on
  // the leader only — the skill mirror keeps the canonical handyman skill
  // alone by design.
  const skills = experimentalSkillDirs(config.repoRoot);
  return new Agent({
    id: 'handyman-leader',
    name: 'Handyman Leader',
    description:
      'Handyman leader: orchestrates implementer/reviewer subagents over the handyman MCP server.',
    instructions: () => leaderInstructions(config),
    model: resolveModel(config.models.leader, { catalogPath: config.modelCatalogPath }),
    tools: { ...tools, ...webTools() } as never,
    agents: { implementer, reviewer },
    workspace: roleWorkspace('leader', config.projectRoot),
    ...(skills.length > 0 ? { skills } : {}),
    defaultOptions: roleDefaultOptions(config.models.leader),
    ...(options.memory ? { memory: options.memory } : {}),
  });
}
