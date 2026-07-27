# handyman-harness

[![npm version](https://img.shields.io/npm/v/handyman-harness)](https://www.npmjs.com/package/handyman-harness)
[![license](https://img.shields.io/npm/l/handyman-harness)](./LICENSE)
[![node](https://img.shields.io/node/v/handyman-harness)](https://www.npmjs.com/package/handyman-harness)

CLI + MCP toolchain for the [Handyman](https://github.com/RodrigoMardones/handyman)
agent harness. It installs and operates a working layer around a repository
where agents collaborate through explicit roles (leader / implementer /
reviewer), one feature at a time, with disk as the source of truth and an
executable verification gate before any feature is marked done.

> The **methodology** is the [`handyman`](https://github.com/RodrigoMardones/handyman/blob/main/handyman/SKILL.md) skill. This package is the **mechanics**: the
> `dist/*.js` CLIs the roles invoke plus a thin MCP server that wraps them.
> The skill and the package share one version (`metadata.version` ==
> `package.json`), enforced at pack time.

## What it gives you

- **13 verbs** (CLI) and **25 tools** (MCP) over the same `dist/*.js` code —
  zero second source of truth. `feature_close` inherits the verifier gate
  from `feature.js done`, so a close without a green verifier is refused by
  the subprocess, not by convention.
- **Session workflow**: the `handyman://{project}/resume` resource restarts
  work in one read (branch check, active session, queue, handoffs, history
  tail, memory index), `role_*` prompts adopt a role from any client,
  `feature_close_async`/`task_result` offload the slow verifier, and
  destructive verbs (`sprint_close`, `acceptance --force`) run only behind
  human confirmation (MCP elicitation or `confirm:true`).
- **Atomic feature-state machine** (`pending` / `in_progress` / `done` /
  `blocked`) so agents never hand-edit `feature_list.json`.
- **Multi-repo fleet**: reads `$HANDYMAN_ROOT/registry.json` (default
  `~/HANDYMAN`) and every tool accepts `project`, so one connection operates
  every registered harness.
- **Observability**: `preflight` (stability), `metrics` (per-harness),
  `toolbox status` (fleet), `fleet_health` (derived signals),
  `fleet_timeline` (closure chronology).
- **Obsidian-friendly state**: `progress/`, `backlog/`, `memory/`, `index.md`
  with frontmatter and tags; the workspace is a valid vault.

## Requirements

- Node.js **>= 20** (ESM, `engines.node`).
- A harness to operate on. Bootstrap one in a repo by following the
  [skill's `bootstrap` mode](https://github.com/RodrigoMardones/handyman/blob/main/handyman/SKILL.md#quick-start),
  or register an existing one with `toolbox register <path>`.

## Install

```bash
npm install handyman-harness
# or pin the major:
npm install handyman-harness@3
```

Ad-hoc (no install):

```bash
npx handyman-harness@3 <verb> [args...]
```

## CLI usage

```bash
handyman <verb> [args...]      # installed bin
npx handyman-harness@3 <verb>  # ad-hoc
```

Each verb accepts `--help` and prints a `status: ok|warn|error` tail line
(or a JSON payload in `--json` modes).

| Verb | Purpose |
|------|---------|
| `feature` | Atomic feature cycle: `add`, `ready`, `start`, `log`, `next`, `block`, `unblock`, `acceptance`, `done` (verifier-gated). |
| `backlog` | Stamp `impl_` / `review_` / `explore_` reports with house frontmatter. |
| `preflight` | Read-only stability report (validate + upgrade + tools discovery + worklist). |
| `validate_harness` | Structure validator: core files, single `in_progress`, `depends_on` refs. |
| `upgrade_harness` | Version drift: `--check` reports; running it re-seals + migrates. |
| `update_harness` | Managed-file drift check for `harness.config.json`. |
| `tools_discovery` | `list` / `find` / `check` / `declare` skills, MCP servers, role files. |
| `index_md` | Regenerate the `index.md` Obsidian MOC from live state. |
| `sprint` | Work-period lifecycle: `open <id>`, `close` (derives the sprint doc), `status`. |
| `metrics` | Per-harness derived snapshot (status counts, throughput, approval rate). |
| `evals` | Run / list the bundled skill evals. |
| `toolbox` | Fleet: `register` / `unregister` / `list` / `discover` / `status` / `health` / `timeline` / `serve`. |
| `mcp` | Start the MCP server: stdio (default) or Streamable HTTP (`--http`). |

Typical loop inside a harness project:

```bash
npx handyman-harness@3 preflight            # read-only stability report
npx handyman-harness@3 feature ready        # exit 0: claimable work; exit 3: drained
npx handyman-harness@3 feature start <name>
npx handyman-harness@3 feature done <name>  # refused unless verifier exits 0
```

## MCP server

Thin wrapper — 25 tools + 3 resources + 4 role prompts — over the same CLIs,
served over stdio (default) or Streamable HTTP (`--http [--host] [--port]`:
stateful `Mcp-Session-Id` sessions, unknown ids get a 404 so the client
re-initializes, DNS-rebinding protection, loopback-only). Any MCP client gets
the full feature cycle without the skill installed.

Connect from the published package (no checkout):

```bash
claude mcp add handyman -- npx -y handyman-harness@3 mcp
```

or in VS Code `.vscode/mcp.json`:

```json
{
  "servers": {
    "handyman": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "handyman-harness@3", "mcp"]
    }
  }
}
```

Every tool accepts `project` (a registered name, an absolute root, or omitted
for cwd). Highlights: `feature_next` / `feature_add` / `feature_start` /
`feature_log` / `feature_next_step` / `feature_block` / `feature_unblock` /
`feature_acceptance` / `feature_close` (verifier-gated) plus the background
`feature_close_async` / `task_result` pair, `backlog_review`, `report_write`,
`verify`, `preflight`, `metrics`, `sprint_status`, `sprint_close`
(human-confirmed), `handoff_submit` / `handoff_claim`, `upgrade_check`,
`harness_list`, `fleet_status`, `fleet_health`, `fleet_timeline`. Resources:
`handyman://{project}/current`, `handyman://{project}/resume` (one-call
restart briefing), `handyman://{project}/docs/{doc}`. Prompts: `role_leader`
/ `role_implementer` / `role_reviewer` / `role_explorer`. Full table in
[`references/mcp.md`](https://github.com/RodrigoMardones/handyman/blob/main/handyman/references/mcp.md).

## Programmatic API

The package exports ESM entry points (see `package.json` `exports`):

| Subpath | Module | Use |
|---------|--------|-----|
| `handyman-harness` (`.` / `/toolbox`) | `dist/toolbox.js` | Fleet registry, snapshots, signals, timeline, plus the `toolbox` CLI. |
| `handyman-harness/state` | `dist/toolbox_state.js` | The `/api/state` document builder (per-harness snapshot + fleet aggregate) used by the web observer. |
| `handyman-harness/mcp` | `dist/mcp.js` | The MCP server (run via `mcp` verb or `node dist/mcp.js`). |
| `handyman-harness/assets/*` | `assets/*` | Bundled templates and JSON Schemas (see below). |
| `handyman-harness/package.json` | `package.json` | Version handshake for tooling. |

```js
import { snapshots, fleetAggregate, toolboxTimeline } from "handyman-harness";
import { buildState } from "handyman-harness/state";
```

## Bundled assets

`assets/` ships the templates and JSON Schemas the bootstrap and validation
CLIs read at runtime (so the published package is self-contained):

- `*.template.md` / `*.template.json` / `*.template.sh` — `AGENTS.md`,
  `CHECKPOINTS.md`, `feature_list.json`, `harness.config.{local,global}.json`,
  `init.sh`, role files, docs, backlog entries, sprint doc, MOC, etc.
- `schemas/*.schema.json` — JSON Schema (draft-07) contracts for
  `feature_list.json` and `harness.config.json`.

## Versioning

The skill and the npm package share one version. The pinned major `@3`
delivers minor and patch updates without skill edits. Run
`npx handyman-harness@3 upgrade_harness --check` to report drift against an
installed harness; running it (no `--check`) applies idempotent migrations
and re-seals the version. Use `handyman --version` to print the installed
toolchain version.

## Where to go next

- Full workflow, anatomy, templates, checklists:
  [`handyman/references/`](https://github.com/RodrigoMardones/handyman/tree/main/handyman/references)
- Skill entrypoint:
  [`handyman/SKILL.md`](https://github.com/RodrigoMardones/handyman/blob/main/handyman/SKILL.md)
- Repo README (concepts, install modes, Obsidian):
  [`README.md`](https://github.com/RodrigoMardones/handyman#readme)

## License

MIT — see [LICENSE](./LICENSE) and [NOTICE](../NOTICE).
