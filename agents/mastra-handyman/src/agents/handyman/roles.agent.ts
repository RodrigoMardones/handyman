// Implementer + reviewer subagents, shared by the supervisor (phase 1) and
// the feature-cycle workflow (phase 3): one definition, two orchestration
// topologies. Each role gets its own model and its own MCP tool set from the
// injected config — the tool sets are code (src/domain/role-tools.ts), so a
// reviewer cannot mutate feature state by construction.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Agent, SkillSearchProcessor } from '../../mastra';
import { resolveModel, roleDefaultOptions } from '../../ports/model-catalog';
import { implementerVerbs, reviewerVerbs, toolsForVerbs } from '../../domain/role-tools';
import { roleWorkspace } from '../../ports/workspace';
import type { AppConfig } from '../../ports/config';

/** Role prompt body from <handymanAssetsDir>/assets/role-<role>.template.md
 *  (frontmatter stripped). handymanAssetsDir comes resolved from the config
 *  port (env > handyman-harness package > dev fallback) — no repoRoot anchor. */
export function roleBody(role: string, handymanAssetsDir: string): string {
  const raw = readFileSync(
    join(handymanAssetsDir, 'assets', `role-${role}.template.md`),
    'utf-8',
  );
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

function implementerInstructions(config: AppConfig): string {
  return `
${roleBody('implementer', config.handymanAssetsDir)}

## Concrete protocol (this deployment)
You operate through your handyman_ tools on project "${config.projectRoot}" — PLUS a
workspace scoped to that same project root: file tools (read/write/edit/
list/grep) and a shell (execute_command: git, tests, the verifier). Use the
workspace when the feature involves real code changes; the MCP tools remain
the ONLY way to mutate harness state.
Your step budget is LIMITED — spend it on the work and your two required
writes, not on exploration (the leader already validated the harness; do NOT
run preflight/metrics/verify MCP probes).
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

function reviewerInstructions(config: AppConfig): string {
  return `
${roleBody('reviewer', config.handymanAssetsDir)}

## Concrete protocol (this deployment)
You operate through your handyman_ tools on project "${config.projectRoot}"
(read-only probes plus backlog_review) — you have NO state-mutation verbs,
by design. You ALSO have a READ-ONLY filesystem on that project root: use it
to read the implementation report at .handyman/backlog/impl_<feature>.md and
the code the feature touched — judge artifacts you have READ, never the task
text alone (a verdict on an unread report is a hallucinated verdict; a 2026-07-28
run stamped "feature does not exist" for exactly that reason).
Your step budget is LIMITED: read the report, probe at most once or twice, go
straight to the verdict.
For the feature named in the task: assess the implementation against the
acceptance criteria. Then stamp your verdict with
handyman_backlog_review (status "approved" or "changes_requested") — the
verdict is your deliverable; a review without the stamp is a FAILED review.
Reply with the verdict and one line of justification. Never claim you
stamped unless the tool call succeeded.`;
}

export function createRoleAgents(
  config: AppConfig,
  tools: Record<string, unknown>,
  opts: { skillDirs?: readonly string[] } = {},
) {
  // One workspace instance feeds both the agent and the SkillSearchProcessor:
  // skills live on the WORKSPACE (the deployment/package/project/github/user
  // scopes) and discovery is ON-DEMAND (search_skills/load_skill over a local
  // BM25 index) — no eager injection of every skill into the context.
  const implementerWorkspace = roleWorkspace('implementer', config.projectRoot, {
    skillDirs: opts.skillDirs,
  });
  const implementer = new Agent({
    id: 'implementer',
    name: 'Implementer',
    description:
      'Implements exactly one feature: logs each step via feature_log and writes the impl report via report_write. Delegate the implementation step of a feature to it.',
    instructions: () => implementerInstructions(config),
    model: resolveModel(config.models.implementer, { catalogPath: config.modelCatalogPath }),
    tools: toolsForVerbs(tools, implementerVerbs()) as never,
    workspace: implementerWorkspace,
    ...(opts.skillDirs
      ? {
          inputProcessors: [
            new SkillSearchProcessor({
              workspace: implementerWorkspace,
              search: { topK: 5 },
            }),
          ],
        }
      : {}),
    defaultOptions: roleDefaultOptions(config.models.implementer),
  });

  const reviewer = new Agent({
    id: 'reviewer',
    name: 'Reviewer',
    description:
      'Reviews one implemented feature against its acceptance criteria and stamps the verdict via backlog_review. Delegate the review step to it after implementation.',
    instructions: () => reviewerInstructions(config),
    model: resolveModel(config.models.reviewer, { catalogPath: config.modelCatalogPath }),
    tools: toolsForVerbs(tools, reviewerVerbs()) as never,
    workspace: roleWorkspace('reviewer', config.projectRoot),
    defaultOptions: roleDefaultOptions(config.models.reviewer),
  });

  return { implementer, reviewer };
}
