// Skill-mirror agent (phase 4): the canonical handyman skill loaded as a
// NATIVE Mastra skill — agent-level, path-based, zero duplication: the agent
// reads the repo's handyman/SKILL.md + references/ live at call time (the
// same files hosts like Claude Code / Kimi Code install). NO role
// instructions: the skill itself is the protocol source — that is the gate
// ("the native skill loads SKILL.md + references and fires the protocol").
// It drives the same 25 MCP tools; there are no subagents here, so the one
// agent plays every role.
// Update (operator mandate 2026-07-28): the mirror now ALSO gets the real
// system surface — writable workspace (files + shell/git) scoped to the
// project root and the web_search/web_fetch pair — so it can implement real
// features on real projects, not just exercise the process verbs.
import { join } from 'node:path';
import { Agent } from '../mastra';
import { DEFAULT_ROLE_MODEL, resolveModel, roleDefaultOptions } from '../ports/model-catalog';
import { roleWorkspace } from '../ports/workspace';
import { webTools } from '../ports/web-tools';

// Same anchoring convention as handyman-leader.ts (cwd = package dir).
const REPO_ROOT = process.env.HANDYMAN_REPO_ROOT ?? join(process.cwd(), '..', '..');

/** Canonical skill directory: handyman/SKILL.md + handyman/references/. */
export const HANDYMAN_SKILL_DIR = join(REPO_ROOT, 'handyman');

export function createHandymanSkillAgent(tools: Record<string, unknown>, project: string) {
  const spec = process.env.HANDYMAN_LEADER_MODEL ?? DEFAULT_ROLE_MODEL;
  return new Agent({
    id: 'handyman-skill-mirror',
    name: 'Handyman Skill Mirror',
    description:
      'Mirror agent: runs the handyman cycle guided only by the native handyman skill (SKILL.md) over the handyman MCP tools.',
    instructions: `You operate a Handyman harness through your MCP tools (prefixed handyman_).
The project root for EVERY tool call is "${project}" (pass it as the "project" argument).

You have a native skill called "handyman" — load it FIRST and follow its
run-feature protocol for the feature named by the user: add (tolerate
"already exists"), start (no_preflight true), implement, review, close ONLY
after an approved review; if the close is refused, report the refusal
verbatim and stop.

You also have a workspace on that same project root (file read/write/edit
tools and a shell: git, tests, verifier) and the web_search/web_fetch pair
for research. Harness state mutates ONLY through the handyman_ tools; code
changes happen through the workspace. Your report and review writes
(handyman_report_write, handyman_backlog_review) remain the protocol
deliverables — never claim one unless its tool call succeeded.

HARD STOP rule: every tool call targets EXACTLY the project above. If its
harness is missing or broken, STOP and report the bootstrap need — never
switch to another registered harness (harness_list/fleet_* are read-only
probes, never a fallback target).

Your step budget is LIMITED: no exploratory probes beyond what the protocol
needs (skill loads + the cycle verbs + at most one verify).`,
    model: resolveModel(spec),
    tools: { ...tools, ...webTools() } as never,
    skills: [HANDYMAN_SKILL_DIR],
    workspace: roleWorkspace('skill', project),
    defaultOptions: { ...roleDefaultOptions(spec), maxSteps: 20 },
  });
}
