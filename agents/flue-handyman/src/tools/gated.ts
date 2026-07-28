// Gated tools (feature 98): verbs behind a subprocess gate (verifier,
// preflight) or a human confirmation. Flue has no mid-call elicitation, so the
// MCP confirm gates become a two-call protocol: the first call returns
// `requiresConfirmation: true` (plus the dry-run preview where one exists) and
// the agent must ask the user, then re-call with `confirm: true`.
// Descriptions are adapted from the MCP registrations in handyman/src/mcp.ts.
import * as v from 'valibot';
import { defineTool, type ToolDefinition } from '../flue';
import {
  cliOutput,
  featureCloseAsync,
  json,
  resolveProject,
  runHandymanCli,
  runVerifier,
  type HandymanProject,
} from '../ports/handyman-runtime';
import { featureNameField } from './state';

/** Verifier runs lint+build+tests: the MCP server budgets 15 minutes. */
const VERIFIER_TIMEOUT_MS = 15 * 60 * 1000;

/** Subprocess-gated and human-gated tools. `projectRoot` is the closed-over root. */
export function createGatedTools(projectRoot: string): ToolDefinition[] {
  const project = (): HandymanProject => resolveProject(projectRoot);

  const featureStart = defineTool({
    name: 'feature_start',
    description:
      'Mark a feature in_progress and reset progress/current.md for it (feature.js start). ' +
      'Enforces the single-in_progress rule (refuses if another feature is active) and runs ' +
      'preflight unless `no_preflight` is set. The natural pair of feature_next: claimable-list ' +
      'and claim-take are two faces of the same step.',
    input: v.object({
      name: featureNameField(),
      no_preflight: v.optional(
        v.pipe(v.boolean(), v.description('Skip the preflight stability check before claiming (default: runs it).')),
        false,
      ),
    }),
    async run({ input, signal }) {
      const args = ['start', input.name];
      if (input.no_preflight) {
        args.push('--no-preflight');
      }
      const result = await runHandymanCli({ verb: 'feature', args, projectRoot, signal });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, exit, output });
    },
  });

  const featureClose = defineTool({
    name: 'feature_close',
    description:
      'Run the project verifier and, only on exit 0, mark the feature done, append the history ' +
      'entry, and reset progress/current.md (feature.js done). A red verifier REFUSES the close ' +
      'and keeps the feature in_progress — fix the failure and call again. There is no force ' +
      'flag by design. May take several minutes; prefer feature_close_async on the slow path.',
    input: v.object({
      name: featureNameField(),
      verifier: v.optional(
        v.pipe(v.string(), v.description('Absolute path to an alternative verifier script (default: <root>/init.sh).')),
      ),
    }),
    async run({ input, signal }) {
      const args = ['done', input.name];
      if (input.verifier) {
        args.push('--verifier', input.verifier);
      }
      const result = await runHandymanCli({ verb: 'feature', args, projectRoot, timeoutMs: VERIFIER_TIMEOUT_MS, signal });
      const { exit, output } = cliOutput(result);
      // A refused close (red verifier / state check) is DATA, not a thrown
      // error: the agent reads closed:false + the tail and fixes the failure.
      return json({
        ok: exit === 0,
        closed: exit === 0,
        exit,
        output,
        ...(exit !== 0
          ? { hint: 'verifier or state check failed; the feature stays in_progress until it passes' }
          : {}),
      });
    },
  });

  const featureCloseAsyncTool = defineTool({
    name: 'feature_close_async',
    description:
      'The call-now, fetch-later variant of feature_close for the slow path: detaches ' +
      'feature.js done (which runs the full verifier, up to 15 min) and returns a task_id ' +
      'immediately. State lives in <workspace>/run/<task_id>.{json,log}, so it survives this ' +
      'agent; poll with task_result. The verifier gate is unchanged — a red verifier still ' +
      'refuses the close, you just learn it later.',
    input: v.object({
      name: featureNameField(),
      verifier: v.optional(
        v.pipe(v.string(), v.description('Absolute path to an alternative verifier script (default: <root>/init.sh).')),
      ),
    }),
    run({ input }) {
      return json({ ok: true, ...featureCloseAsync(project(), input.name, input.verifier) });
    },
  });

  const verify = defineTool({
    name: 'verify',
    description:
      'Run the executable verifier (<root>/init.sh: state checks, lint, build, tests). Exit 0 ' +
      'is the only green. Output is tail-truncated; the failing gate is always at the end. ' +
      'May take several minutes.',
    input: v.object({
      verifier: v.optional(v.pipe(v.string(), v.description('Absolute path to an alternative verifier script.'))),
    }),
    async run({ input, signal }) {
      const result = await runVerifier({
        projectRoot,
        verifier: input.verifier,
        timeoutMs: VERIFIER_TIMEOUT_MS,
        signal,
      });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, green: exit === 0, exit, output });
    },
  });

  const preflight = defineTool({
    name: 'preflight',
    description:
      'Read-only stability report for a harness (validate + upgrade check + tools discovery + ' +
      'context freshness). Exits 0 unless strict mode finds a problem. Run it before starting ' +
      'feature work.',
    input: v.object({
      strict: v.optional(
        v.pipe(v.boolean(), v.description('Fail (non-zero exit) on findings instead of reporting only.')),
        false,
      ),
    }),
    async run({ input, signal }) {
      const result = await runHandymanCli({
        verb: 'preflight',
        args: input.strict ? ['--strict'] : [],
        projectRoot,
        signal,
      });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, exit, output });
    },
  });

  const sprintClose = defineTool({
    name: 'sprint_close',
    description:
      'Close the open work period (sprint.js close): archives done features, compacts their ' +
      'history.md entries, and derives memory/sprints/sprint.<id>.md. Because that is ' +
      'destructive, the call always runs the --dry-run preview first and executes only after ' +
      'explicit human confirmation: review the preview with the user, then re-call with ' +
      'confirm: true. `sprint open` stays on the CLI by design.',
    input: v.object({
      confirm: v.optional(
        v.pipe(v.boolean(), v.description('Execute the close after the user reviewed the dry-run preview.')),
        false,
      ),
    }),
    async run({ input, signal }) {
      const preview = await runHandymanCli({ verb: 'sprint', args: ['close', '--dry-run'], projectRoot, signal });
      const dry = cliOutput(preview);
      if (dry.exit !== 0) {
        return json({ ok: false, closed: false, ...dry, hint: 'dry-run refused; nothing was written' });
      }
      if (input.confirm !== true) {
        return json({
          ok: true,
          closed: false,
          requiresConfirmation: true,
          preview: dry.output,
          message:
            'Dry-run preview only — nothing was written. Show the preview to the user and ' +
            're-call sprint_close with confirm: true to execute the close.',
        });
      }
      const applied = await runHandymanCli({ verb: 'sprint', args: ['close'], projectRoot, signal });
      const { exit, output } = cliOutput(applied);
      return json({ ok: exit === 0, closed: exit === 0, confirmed_via: 'param', exit, output });
    },
  });

  const featureAcceptance = defineTool({
    name: 'feature_acceptance',
    description:
      "Replace a feature's acceptance criteria wholesale (feature.js acceptance). Refused on a " +
      'done feature — the reviewed contract stays immutable. The --force override for that case ' +
      'IS exposed here but gated by human confirmation: call with force: true and confirm: true ' +
      'only after the user approved. The override appends its own history.md entry, so the ' +
      'rewrite is a recorded fact.',
    input: v.object({
      name: featureNameField(),
      acceptance: v.pipe(
        v.array(v.pipe(v.string(), v.minLength(1))),
        v.minLength(1),
        v.description('The full new acceptance list; replaces the previous one.'),
      ),
      force: v.optional(
        v.pipe(
          v.boolean(),
          v.description('Rewrite the contract of a DONE feature (feature.js acceptance --force). Requires human confirmation.'),
        ),
        false,
      ),
      confirm: v.optional(
        v.pipe(v.boolean(), v.description('Explicit user confirmation for the force rewrite.')),
        false,
      ),
    }),
    async run({ input, signal }) {
      if (input.force === true && input.confirm !== true) {
        // Human gate BEFORE any subprocess: the --force rewrite of an accepted
        // contract never runs on the agent's say-so alone.
        return json({
          ok: true,
          forced: false,
          requiresConfirmation: true,
          message:
            `Rewriting the ACCEPTED contract of done feature '${input.name}' via --force requires ` +
            'human confirmation. Ask the user, then re-call with force: true and confirm: true. ' +
            `The rewrite lands in history.md and the signed review (backlog/review_${input.name}.md) ` +
            'attests to the previous contract.',
        });
      }
      const args = ['acceptance', input.name];
      for (const line of input.acceptance) {
        args.push('--acceptance', line);
      }
      if (input.force === true) {
        args.push('--force');
      }
      const result = await runHandymanCli({ verb: 'feature', args, projectRoot, signal });
      const { exit, output } = cliOutput(result);
      return json({
        ok: exit === 0,
        forced: input.force === true,
        ...(input.force === true ? { confirmed_via: 'param' } : {}),
        exit,
        output,
      });
    },
  });

  return [
    featureStart,
    featureClose,
    featureCloseAsyncTool,
    verify,
    preflight,
    sprintClose,
    featureAcceptance,
  ];
}
