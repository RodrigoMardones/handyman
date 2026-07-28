// State-mutation tools (feature 98): feature queue edits, the review stamp,
// backlog reports, and the role handoff queue. Descriptions are adapted from
// the MCP registrations in handyman/src/mcp.ts; the `project` argument is
// gone — the agent instance is scoped to one project root.
import * as v from 'valibot';
import { defineTool, type ToolDefinition } from '../flue';
import {
  cliOutput,
  handoffClaim,
  handoffSubmit,
  json,
  reportWrite,
  resolveProject,
  runHandymanCli,
  type HandymanProject,
} from '../ports/handyman-runtime';

/** Feature name as listed in feature_list.json (shared with the gated tools). */
export const featureNameField = () =>
  v.pipe(
    v.string(),
    v.regex(/^[A-Za-z0-9_-]+$/, 'feature name must be [A-Za-z0-9_-]+'),
    v.description("Feature name as listed in feature_list.json (e.g. 'handyman_mcp_server')."),
  );

const HANDOFF_ROLES = ['leader', 'implementer', 'reviewer', 'explorer'] as const;

/** State-mutating native tools. `projectRoot` is the closed-over harness root. */
export function createStateTools(projectRoot: string): ToolDefinition[] {
  const project = (): HandymanProject => resolveProject(projectRoot);

  const featureAdd = defineTool({
    name: 'feature_add',
    description:
      'Append a new pending feature to feature_list.json (feature.js add). Writes only the ' +
      'contract keys (id, name, title, description, acceptance, status) validated against the ' +
      "schema — the leader's intake verb, so feature_list.json is never hand-edited.",
    input: v.object({
      name: featureNameField(),
      title: v.optional(v.pipe(v.string(), v.description('Short human title.'))),
      description: v.optional(v.pipe(v.string(), v.description('What the feature is and why.'))),
      acceptance: v.optional(
        v.pipe(
          v.array(v.pipe(v.string(), v.minLength(1))),
          v.description('Acceptance criteria; each entry is one criterion.'),
        ),
      ),
      depends_on: v.optional(
        v.pipe(
          v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
          v.description('Feature ids that must be done before this one is claimable.'),
        ),
      ),
    }),
    async run({ input, signal }) {
      const args = ['add', '--name', input.name];
      if (input.title) {
        args.push('--title', input.title);
      }
      if (input.description) {
        args.push('--description', input.description);
      }
      for (const line of input.acceptance ?? []) {
        args.push('--acceptance', line);
      }
      for (const id of input.depends_on ?? []) {
        args.push('--depends-on', String(id));
      }
      const result = await runHandymanCli({ verb: 'feature', args, projectRoot, signal });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, exit, output });
    },
  });

  const featureLog = defineTool({
    name: 'feature_log',
    description:
      'Append a line to the `## Log` section of progress/current.md (feature.js log). The ' +
      "implementer's per-step operation; without this the agent would edit the file by hand — " +
      'the exact pattern feature.ts exists to prevent.',
    input: v.object({
      line: v.pipe(v.string(), v.minLength(1), v.description('Line to append to the `## Log` section.')),
    }),
    async run({ input, signal }) {
      const result = await runHandymanCli({ verb: 'feature', args: ['log', input.line], projectRoot, signal });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, exit, output });
    },
  });

  const featureNextStep = defineTool({
    name: 'feature_next_step',
    description:
      'Set the `## Next Step` section of progress/current.md (feature.js next). Marks where the ' +
      'next session picks up.',
    input: v.object({
      step: v.pipe(v.string(), v.minLength(1), v.description('Next step description.')),
    }),
    async run({ input, signal }) {
      const result = await runHandymanCli({ verb: 'feature', args: ['next', input.step], projectRoot, signal });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, exit, output });
    },
  });

  const featureBlock = defineTool({
    name: 'feature_block',
    description:
      'Mark a feature blocked with a reason (feature.js block). Use it when a required tool, ' +
      'file, test, or decision is missing: the reason lands in feature_list.json so the next ' +
      'session (or the preflight worklist report) surfaces why the work stopped.',
    input: v.object({
      name: featureNameField(),
      reason: v.pipe(v.string(), v.minLength(1), v.description('Why the feature is blocked and what unblocks it.')),
    }),
    async run({ input, signal }) {
      const result = await runHandymanCli({
        verb: 'feature',
        args: ['block', input.name, '--reason', input.reason],
        projectRoot,
        signal,
      });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, exit, output });
    },
  });

  const featureUnblock = defineTool({
    name: 'feature_unblock',
    description:
      'Return a blocked feature to pending (feature.js unblock) once its blocker clears, so it ' +
      'becomes claimable by feature_next again.',
    input: v.object({
      name: featureNameField(),
    }),
    async run({ input, signal }) {
      const result = await runHandymanCli({ verb: 'feature', args: ['unblock', input.name], projectRoot, signal });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, exit, output });
    },
  });

  const backlogReview = defineTool({
    name: 'backlog_review',
    description:
      "Write backlog/review_<feature>.md with the reviewer's verdict (backlog.js review " +
      '--status), the workflow stage-5 artifact. A second, different verdict on the same ' +
      "feature is refused: the non-zero exit and the CLI's conflict message land in the " +
      'payload — nothing is silently flipped. The --force re-stamp is deliberately NOT exposed ' +
      'here and stays on the CLI, like feature_acceptance --force.',
    input: v.object({
      name: featureNameField(),
      status: v.pipe(
        v.picklist(['approved', 'changes_requested']),
        v.description('Reviewer verdict stamped into the report frontmatter.'),
      ),
    }),
    async run({ input, signal }) {
      const result = await runHandymanCli({
        verb: 'backlog',
        args: ['review', input.name, '--status', input.status],
        projectRoot,
        signal,
      });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, exit, output });
    },
  });

  const reportWriteTool = defineTool({
    name: 'report_write',
    description:
      'Write an implementation, review, or exploration report to <workspace>/backlog/' +
      '<kind>_<name>.md with the house frontmatter (type/feature/status/role/updated/tags). ' +
      'Overwrites an existing report for the same feature — reports are living documents. ' +
      'Pass only the markdown body; frontmatter is added.',
    input: v.object({
      kind: v.pipe(
        v.picklist(['impl', 'review', 'explore']),
        v.description('Report kind: impl_, review_ or explore_ prefix.'),
      ),
      feature: featureNameField(),
      content: v.pipe(v.string(), v.minLength(1), v.description('Markdown body of the report (without frontmatter).')),
      status: v.optional(
        v.pipe(
          v.string(),
          v.description("Frontmatter status (default: 'implemented' for impl, 'approved' for review)."),
        ),
      ),
    }),
    run({ input }) {
      const { path, action } = reportWrite(project(), input.kind, input.feature, input.content, input.status);
      return json({ ok: true, path, action });
    },
  });

  const handoffSubmitTool = defineTool({
    name: 'handoff_submit',
    description:
      'Record a role-to-role handoff in <workspace>/handoffs/ — the structured form of the ' +
      'anti-telephone rule: the artifact travels by reference (e.g. backlog/impl_<feature>.md), ' +
      'never as a chat diff. The target role picks it up with handoff_claim; pending handoffs ' +
      'also surface in the handyman_resume briefing.',
    input: v.object({
      from: v.pipe(v.picklist(HANDOFF_ROLES), v.description('Role handing the work off.')),
      to: v.pipe(v.picklist(HANDOFF_ROLES), v.description('Role the work is addressed to.')),
      artifact: v.pipe(
        v.string(),
        v.minLength(1),
        v.description('Reference to the artifact (path or URI), not its content.'),
      ),
      summary: v.optional(v.pipe(v.string(), v.description('One-line context for the receiver.'))),
    }),
    run({ input }) {
      return json({ ok: true, ...handoffSubmit(project(), input.from, input.to, input.artifact, input.summary) });
    },
  });

  const handoffClaimTool = defineTool({
    name: 'handoff_claim',
    description:
      'Claim the oldest pending handoff addressed to `role`, marking it claimed on disk so a ' +
      'second claim never hands the same work twice (the handoff event becomes a fact in the ' +
      'workspace, like a feature state transition). claimed:false means the queue has nothing ' +
      'for that role.',
    input: v.object({
      role: v.pipe(v.picklist(HANDOFF_ROLES), v.description('Role claiming its next handoff.')),
    }),
    run({ input }) {
      return json({ ok: true, ...handoffClaim(project(), input.role) });
    },
  });

  return [
    featureAdd,
    featureLog,
    featureNextStep,
    featureBlock,
    featureUnblock,
    backlogReview,
    reportWriteTool,
    handoffSubmitTool,
    handoffClaimTool,
  ];
}
