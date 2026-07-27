# handyman-mcp-server

Thin MCP wrapper — 25 tools, 3 resource templates, 4 role prompts — over the
same `dist/*.js` CLIs the roles run, served over stdio (default) or Streamable
HTTP (`--http`, stateful sessions via `Mcp-Session-Id`). The
harness contract lives in code, not prose: `feature_close` shells out to
`feature.js done`, so a close without a green verifier is refused by the
subprocess — no model obedience involved. Source: `src/mcp.ts`; suite:
`tests/test_mcp.js`.

## Why MCP

1. **Contract in code.** The invariants (verifier-gated close, single
   in_progress, history append) are preconditions of the tools, not markdown
   rules an agent may skip.
2. **Multi-repo hub.** The server reads `$HANDYMAN_ROOT/registry.json`
   (default `~/HANDYMAN`) and every tool accepts `project`, so one connection
   operates every registered harness — the bridge to the toolBox
   "panel as agent" north star.
3. **Portability.** Any MCP client gets the verbs without this skill
   installed. The skill remains the methodology; the server is the mechanics.

## Connecting

VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "handyman": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/handyman/dist/mcp.js"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

Claude Code: `claude mcp add handyman -- node <repo>/handyman/dist/mcp.js`.

From the published package (any machine, no checkout needed):

```bash
claude mcp add handyman -- npx -y handyman-harness@3 mcp
```

or in `.vscode/mcp.json`: `"command": "npx", "args": ["-y", "handyman-harness@3", "mcp"]`.

Streamable HTTP (multi-client, e.g. the toolBox panel as just another MCP
client):

```bash
node handyman/dist/mcp.js --http --host 127.0.0.1 --port 8177   # endpoint: /mcp
```

Stateful: the server assigns an `Mcp-Session-Id` at initialize, one
`McpServer` per session, an unknown id gets a 404 so the client re-initializes
(per spec), and `DELETE` ends the session. Loopback-only with DNS-rebinding
protection — there is no auth layer, so front it with a proxy if you expose
it. The harness state itself lives on disk, so sessions are disposable
coordinators, not state owners.

Declare it in the harness (`harness.config.json → discovery.mcp`) with
`node handyman/dist/tools_discovery.js declare mcp handyman` so preflight
verifies the registration.

## Tools

Every tool accepts `project`: a registered harness name (from
`harness_list`), an absolute project root, or omitted for the server's cwd.
The registry-wide tools (`harness_list`, `fleet_status`, `fleet_health`,
`fleet_timeline`) take no `project` — they read `$HANDYMAN_ROOT`.

| Tool | Wraps | Notes |
|------|-------|-------|
| `harness_list` | `registry.json` | Names to use as `project`; `harness: false` flags a stale entry |
| `preflight` | `preflight.js` | Read-only stability report; `strict` makes findings fail |
| `feature_next` | `feature.js ready --json` | `drained: true` = no claimable work |
| `feature_add` | `feature.js add` | Appends a pending feature (name, title, description, acceptance, depends_on); the leader's intake verb, so feature_list.json is never hand-edited |
| `feature_start` | `feature.js start` | Marks `in_progress`, enforces single-in_progress, runs preflight unless `no_preflight`; rewrites `progress/current.md` |
| `feature_log` | `feature.js log` | Appends a line to `## Log` in `progress/current.md` |
| `feature_next_step` | `feature.js next` | Sets `## Next Step` in `progress/current.md` |
| `feature_block` | `feature.js block` | Marks a feature `blocked` and records `blocked_reason` in feature_list.json, so the next session sees why work stopped |
| `feature_unblock` | `feature.js unblock` | Returns a `blocked` feature to `pending`, dropping the reason; refuses any other source status |
| `feature_acceptance` | `feature.js acceptance` | Replaces the acceptance list wholesale; refused on a `done` feature — the `--force` override IS exposed but gated by human confirmation (elicitation, or `confirm:true`), and the CLI records the override in `history.md` |
| `backlog_review` | `backlog.js review` | Stamps the reviewer verdict into `review_<feature>.md` (workflow stage 5); a conflicting second verdict exits non-zero — the `--force` re-stamp stays on the CLI by design |
| `feature_close` | `feature.js done` | **Verifier-gated**; refusal keeps the feature `in_progress`; no force flag by design |
| `feature_close_async` | `feature.js done` (detached) | Call-now, fetch-later variant for the slow verifier: returns `task_id` at once, state in `<workspace>/run/`; poll with `task_result` |
| `task_result` | `<workspace>/run/<task_id>.json` | Polls a background task; a stale `running` record (server died) is reconciled from the feature state machine — `done` means the gate passed |
| `report_write` | backlog convention | Writes `impl_/review_/explore_` reports with house frontmatter; body only |
| `verify` | `<root>/init.sh` | Full gate (lint, build, tests); output tail-truncated, failure is at the end |
| `sprint_status` | `sprint.js status` | Read-only snapshot of the open period: branch slug, timestamps when present, features with status |
| `sprint_close` | `sprint.js close` | **Human-confirmed**: always runs the `--dry-run` preview first and executes only after elicitation (or `confirm:true`) accepts; archives done features, compacts history, derives the period doc |
| `handoff_submit` | `<workspace>/handoffs/` queue | Records a role-to-role artifact handoff (reference, not content); the structured anti-telephone pass |
| `handoff_claim` | `<workspace>/handoffs/` queue | Claims the oldest pending handoff for a role and marks it claimed; `claimed:false` = nothing queued |
| `upgrade_check` | `upgrade_harness.js --check` | Read-only drift: installed vs current harness_version, pending migrations; exit non-zero when behind/unsealed |
| `metrics` | `metrics.js --json` | Per-harness derived snapshot parsed into structuredContent: status_counts, throughput, approval_rate, coverage; observes, never gates |
| `fleet_status` | `toolbox.js status --json` | Registry-wide live view: per-harness metrics, session, and version drift plus the fleet rollup; no `project` — fleet, not per-repo |
| `fleet_health` | `toolbox.js health --json` | Derived signals (INVARIANT, STALE_WIP, BEHIND, IDLE, UNREADABLE) across the fleet; `strict` exits non-zero when signals are present |
| `fleet_timeline` | `toolbox.js timeline --json` | Merged closure chronology across the fleet (history + heartbeat events), newest first |

Deliberately absent: `sprint open`, `upgrade_harness apply`, and
`update_harness` stay CLI-only — opening a period is a branch milestone and
the apply verbs rewrite `harness.config.json` plus managed files, so the
operator runs them by hand. The destructive verbs that DO have a human gate
moved in: `sprint_close` and `feature_acceptance --force` ask for explicit
confirmation mid-call (MCP elicitation, or `confirm:true` when the client
cannot elicit — never the agent's say-so alone); the CLI still records the
override in `history.md`. `feature_add` and
`feature_start/log/next_step/block/unblock/acceptance` close the full feature
cycle (intake → claim → log → set next step → block/unblock → close);
`feature_close_async` + `task_result` add the background path for the slow
verifier, and `handoff_submit`/`handoff_claim` make the anti-telephone pass a
recorded state transition. `backlog_review` adds the reviewer's verdict
(workflow stage 5); re-stamping one (`backlog.js review --force`) stays
CLI-only. The role protocol and preflight advisories still apply via the
underlying CLIs.

## Session lifecycle

Two surfaces attack the cost of restarting work:

- `handyman://{project}/resume` (resource) composes the restart briefing in
  one read: branch check (checked-out vs session-recorded, with a MISMATCH
  flag), the active `current.md`, queue counts and claimable features,
  pending handoffs, the last 5 history closures, and the memory index.
- `role_leader` / `role_implementer` / `role_reviewer` / `role_explorer`
  (prompts) serve the canonical role protocol from
  `assets/role-*.template.md` with the invocation context (`project`,
  `feature`) resolved and appended — the role files are no longer the only
  way to adopt a role.

Session-branch binding: `feature start` stamps the git branch into
`current.md`, and the session-mutating verbs (`log`, `next`, `done`, `start`)
print a WARN when the checked-out branch differs — the workspace is shared
across branches of a checkout; `git worktree` is the supported answer for
parallel work.

## Resources

- `handyman://{project}/current` — `progress/current.md` (active feature,
  next step, session log).
- `handyman://{project}/resume` — the restart briefing above.
- `handyman://{project}/docs/{doc}` — files in the workspace knowledge dir
  (`memory/`, legacy `docs/`): business, architecture, conventions,
  verification. The URI keeps the name `docs` on purpose; only the disk
  layout moved.

## Testing

`tests/test_mcp.js` (wired into `tests/run_tests.sh`) speaks real JSON-RPC
over stdio — tools/resources/prompts surface, elicitation round-trips with a
scripted user decision — and spawns the `--http` mode to assert the session
lifecycle (`Mcp-Session-Id` assigned, unknown id → 404). It then drives the
exported handlers against throwaway harness fixtures: red verifier → close
refused and state intact; green verifier → done + history appended (blocking
and background-task paths); sprint close gated by confirmation; handoff queue
round-trip.
