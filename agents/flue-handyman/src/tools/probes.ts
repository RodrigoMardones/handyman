// Read-only probe tools (feature 98): observations that never mutate harness
// state. Descriptions are adapted from the MCP registrations in
// handyman/src/mcp.ts; the `project` argument is gone — the agent instance is
// scoped to one project root, closed over by createProbeTools.
// Every run returns through json(): the harness handlers declare `unknown`
// payloads, but the values are JSON in practice (see the port).
import * as v from 'valibot';
import { defineTool, type ToolDefinition } from '../flue';
import {
  buildResume,
  cliOutput,
  fleetHealth,
  fleetStatus,
  fleetTimeline,
  harnessList,
  json,
  metrics,
  resolveProject,
  runHandymanCli,
  taskResult,
  type HandymanProject,
} from '../ports/handyman-runtime';

/** Read-only native probes. `projectRoot` is the closed-over harness root. */
export function createProbeTools(projectRoot: string): ToolDefinition[] {
  const project = (): HandymanProject => resolveProject(projectRoot);

  const featureNext = defineTool({
    name: 'feature_next',
    description:
      'List pending features whose depends_on are all satisfied (feature.js ready --json). ' +
      '`drained: true` means the backlog has no claimable work. Claim the lowest id with ' +
      'feature_start before implementing.',
    input: v.object({}),
    async run({ signal }) {
      const result = await runHandymanCli({ verb: 'feature', args: ['ready', '--json'], projectRoot, signal });
      // feature.js ready: exit 0 = claimable work, exit 3 = backlog drained.
      const { exit, output } = cliOutput(result);
      let ready: unknown[] = [];
      try {
        ready = JSON.parse(output) as unknown[];
      } catch {
        /* non-JSON output falls through as empty */
      }
      const drained = exit === 3;
      return json({ ok: exit === 0 || drained, drained, ready });
    },
  });

  const metricsTool = defineTool({
    name: 'metrics',
    description:
      'Per-harness derived snapshot (metrics.js --json): status_counts from feature_list.json, ' +
      'throughput (closures per date from history.md), review_verdicts with approval_rate (from ' +
      'backlog review frontmatter), and coverage (done features with their impl+review reports). ' +
      'Observes, never gates: exits 0 always.',
    input: v.object({}),
    run() {
      const payload = metrics(project());
      return json({ ok: payload.exit === 0, ...payload });
    },
  });

  const sprintStatus = defineTool({
    name: 'sprint_status',
    description:
      'Read-only snapshot of the open work period (sprint.js status): the branch slug, open/close ' +
      'timestamps when present, and every feature attached to it with its status. Safe to call ' +
      'anytime; does not touch disk. `sprint open` stays CLI-only (branch milestone); closing the ' +
      'period is the sprint_close tool, gated by human confirmation.',
    input: v.object({}),
    async run({ signal }) {
      const result = await runHandymanCli({ verb: 'sprint', args: ['status'], projectRoot, signal });
      const { exit, output } = cliOutput(result);
      return json({ ok: exit === 0, exit, output });
    },
  });

  const fleetStatusTool = defineTool({
    name: 'fleet_status',
    description:
      'Registry-wide live report (toolbox.js status --json) over every harness in ' +
      '$HANDYMAN_ROOT/registry.json: per-harness metrics, session, and version drift, plus the ' +
      'fleet rollup. Registry-wide, not per-project.',
    input: v.object({}),
    run() {
      const payload = fleetStatus();
      return json({ ok: payload.exit === 0, ...payload });
    },
  });

  const fleetHealthTool = defineTool({
    name: 'fleet_health',
    description:
      'Derived health signals (toolbox.js health --json) for every registered harness: ' +
      'INVARIANT, STALE_WIP, BEHIND, IDLE, UNREADABLE, with total_signals across the fleet. ' +
      "Registry-wide, not per-project. `strict` plumbs the CLI's --strict: exit is 1 exactly " +
      'when at least one signal is present (the JSON is still returned).',
    input: v.object({
      strict: v.optional(
        v.pipe(v.boolean(), v.description('Exit non-zero when at least one health signal is present.')),
        false,
      ),
    }),
    run({ input }) {
      // A probe: ok stays true even under --strict, where exit 1 IS the data.
      return json({ ok: true, ...fleetHealth(input.strict) });
    },
  });

  const fleetTimelineTool = defineTool({
    name: 'fleet_timeline',
    description:
      'Merged closure chronology (toolbox.js timeline --json) across every registered harness: ' +
      'dated history closures plus pushed heartbeat events, newest first. Registry-wide, not ' +
      'per-project.',
    input: v.object({}),
    run() {
      const payload = fleetTimeline();
      return json({ ok: payload.exit === 0, ...payload });
    },
  });

  const taskResultTool = defineTool({
    name: 'task_result',
    description:
      'Read the state of a task started by feature_close_async (or any future async verb) from ' +
      "<workspace>/run/<task_id>.json plus the tail of its log. A stale 'running' record whose " +
      'process is gone (server died mid-run) is reconciled from the feature state machine: done ' +
      'means the verifier gate passed.',
    input: v.object({
      task_id: v.pipe(
        v.string(),
        v.regex(/^[a-z0-9-]+$/, 'task_id must be [a-z0-9-]+'),
        v.description('The task_id returned by feature_close_async.'),
      ),
    }),
    run({ input }) {
      try {
        return json({ ok: true, ...taskResult(project(), input.task_id) });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  });

  const harnessListTool = defineTool({
    name: 'harness_list',
    description:
      'List every Handyman harness registered in $HANDYMAN_ROOT/registry.json (the multi-repo ' +
      'hub). Returns name, project root, registration date, and whether a harness workspace ' +
      'actually exists on disk.',
    input: v.object({}),
    run() {
      return json({ ok: true, ...harnessList() });
    },
  });

  const upgradeCheck = defineTool({
    name: 'upgrade_check',
    description:
      'Read-only drift report (upgrade_harness.js --check): resolves the workspace, reads the ' +
      "installed harness_version, compares it to the current skill's metadata.version, and " +
      'reports pending migrations. exit is non-zero when behind or unsealed — that is drift ' +
      'data, not a tool failure. Deliberately does NOT expose the apply/default mode (rewrites ' +
      'harness.config.json and managed files); use the CLI directly for that with a backup.',
    input: v.object({}),
    async run({ signal }) {
      const result = await runHandymanCli({ verb: 'upgrade_harness', args: ['--check'], projectRoot, signal });
      const { exit, output } = cliOutput(result);
      return json({ ok: true, exit, output });
    },
  });

  const handymanResume = defineTool({
    name: 'handyman_resume',
    description:
      'One-call session restart briefing (the handyman://{project}/resume MCP resource as a ' +
      'tool): branch check, active session (progress/current.md), feature queue counts, ' +
      'pending handoffs, recent history, and the memory index. Read it at session start ' +
      'before doing any feature work.',
    input: v.object({}),
    run() {
      return json({ ok: true, resume: buildResume(project()) });
    },
  });

  return [
    featureNext,
    metricsTool,
    sprintStatus,
    fleetStatusTool,
    fleetHealthTool,
    fleetTimelineTool,
    taskResultTool,
    harnessListTool,
    upgradeCheck,
    handymanResume,
  ];
}
