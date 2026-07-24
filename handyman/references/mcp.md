# handyman-mcp-server

Thin MCP (stdio) wrapper — 20 tools — over the same `dist/*.js` CLIs the
roles run. The
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
| `feature_acceptance` | `feature.js acceptance` | Replaces the acceptance list wholesale; refused on a `done` feature — the `--force` override stays on the CLI by design |
| `backlog_review` | `backlog.js review` | Stamps the reviewer verdict into `review_<feature>.md` (workflow stage 5); a conflicting second verdict exits non-zero — the `--force` re-stamp stays on the CLI by design |
| `feature_close` | `feature.js done` | **Verifier-gated**; refusal keeps the feature `in_progress`; no force flag by design |
| `report_write` | backlog convention | Writes `impl_/review_/explore_` reports with house frontmatter; body only |
| `verify` | `<root>/init.sh` | Full gate (lint, build, tests); output tail-truncated, failure is at the end |
| `sprint_status` | `sprint.js status` | Read-only snapshot of the open period: branch slug, timestamps when present, features with status |
| `upgrade_check` | `upgrade_harness.js --check` | Read-only drift: installed vs current harness_version, pending migrations; exit non-zero when behind/unsealed |
| `metrics` | `metrics.js --json` | Per-harness derived snapshot parsed into structuredContent: status_counts, throughput, approval_rate, coverage; observes, never gates |
| `fleet_status` | `toolbox.js status --json` | Registry-wide live view: per-harness metrics, session, and version drift plus the fleet rollup; no `project` — fleet, not per-repo |
| `fleet_health` | `toolbox.js health --json` | Derived signals (INVARIANT, STALE_WIP, BEHIND, IDLE, UNREADABLE) across the fleet; `strict` exits non-zero when signals are present |
| `fleet_timeline` | `toolbox.js timeline --json` | Merged closure chronology across the fleet (history + heartbeat events), newest first |

Deliberately absent: the destructive period verbs (`sprint open/close`,
`upgrade_harness apply`, `update_harness`) — those archive features, compact
history, or rewrite `harness.config.json`, so they stay on the CLI where the
operator runs them at branch milestones. `feature_add` and
`feature_start/log/next_step/block/unblock/acceptance` moved into the MCP to
close the full feature cycle (intake → claim → log → set next step →
block/unblock → close); the `acceptance --force` override stays on the CLI,
where rewriting a signed contract is recorded in `history.md` by the
operator. `backlog_review` adds the reviewer's verdict (workflow stage 5);
re-stamping one (`backlog.js review --force`) stays CLI-only for the same
reason. The role protocol and preflight advisories still apply via the
underlying CLIs.

## Resources

- `handyman://{project}/current` — `progress/current.md` (active feature,
  next step, session log).
- `handyman://{project}/docs/{doc}` — files in the workspace knowledge dir
  (`memory/`, legacy `docs/`): business, architecture, conventions,
  verification. The URI keeps the name `docs` on purpose; only the disk
  layout moved.

## Testing

`tests/test_mcp.js` (wired into `tests/run_tests.sh`) speaks real JSON-RPC
over stdio to assert the tool/resource surface, then drives the exported
handlers against throwaway harness fixtures: red verifier → close refused and
state intact; green verifier → done + history appended.
