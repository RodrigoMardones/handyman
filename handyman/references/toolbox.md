# ToolBox: Multi-Harness Observation

Read-only observation of every Handyman harness on the machine from a single
place. One registry, one collector, derived health signals, a global Obsidian
MOC and a live localhost observer. TypeScript port of the legacy fleet layer
(renamed toolBox); design and evidence: `docs/archive/analisis-observador-fleet-web.md`
in the skill repo.

## Philosophy

- **Pull, read-only, observe-don't-gate.** `status` and `health` never mutate a
  harness and exit 0 by default (the `metrics.js`/`preflight.js` pattern);
  gating is opt-in via `health --strict`.
- **Disk is the source of truth.** The registry stores ONLY `project_root` +
  the registration date. Names, versions, counts, and sessions are read live on
  every query, so there is no mirrored state to drift.
- **Drift tolerant.** Harnesses of different `harness_version`s coexist; every
  missing field degrades to `null`/`NOTE`, never an exception. An unreadable
  root becomes an `UNREADABLE` signal, not a crash.
- **No foreign verifier runs by default.** The toolBox only executes another
  project's `init.sh` under the explicit `status --run-verifier` opt-in.

## Registry

`$HANDYMAN_ROOT/registry.json` — default `$HOME/HANDYMAN`, overridable with the
`HANDYMAN_ROOT` environment variable or `--handyman-root` (flag > env > home).
Schema: `assets/schemas/registry.schema.json` (draft-07,
`additionalProperties:false`).

```json
{
  "version": 1,
  "harnesses": [
    { "project_root": "/abs/path/to/project", "registered": "2026-07-01" }
  ]
}
```

## Subcommands

Run from the skill repo: `node handyman/dist/toolbox.js <subcommand>`.

| Subcommand | Does | Exit |
|---|---|---|
| `register PATH [--date D]` | add a root after checking it resolves a workspace with `feature_list.json`; idempotent | 0 / 1 |
| `unregister PATH` | remove a registered root | 0 / 1 |
| `list [--json]` | show registered roots with live `project_name` | 0 |
| `discover --scan DIR [--register] [--max-depth N]` | find harnesses under a tree; prunes `node_modules`, hidden dirs | 0 / 1 |
| `status [--json] [--run-verifier] [--verifier-timeout S]` | per-harness live report + fleet aggregate; verifier opt-in reports `green` / `red` / `skipped` / `timeout` | 0 always |
| `timeline [--json] [--limit N]` | merged closure chronology: history headings + pushed events, newest first | 0 always |
| `heartbeat [--root R] [--feature F] [--date D]` | append one closure event to `$HANDYMAN_ROOT/events.jsonl` — a drop-in `post_run` hook | 0 / 1 |
| `health [--strict] [--stale-days N] [--idle-days N] [--today D] [--json]` | derived signals per harness | 0; `--strict` 1 on signals |
| `moc [--html]` | regenerate the global toolBox MOC at `$HANDYMAN_ROOT/index.md`; `--html` adds a self-contained `index.html` | 0 / 1 |

> `serve` was retired on 2026-07-28 (panel = Mastra Studio; see the Observer note below).

`status` composes existing primitives — `metrics.collect()`, the live session
from `progress/current.md` frontmatter, `harness_version` vs the skill's
current version, and the last dated closure — it reimplements no parsing.

## Health Signals

| Signal | Rule | Default window |
|---|---|---|
| `INVARIANT` | more than one feature `in_progress` | — |
| `STALE_WIP` | `in_progress` and `current.md`'s `updated` stamp older than `--stale-days` (or missing) | 7 days |
| `BEHIND` | installed `harness_version` older than the skill version, or unsealed | — |
| `IDLE` | `pending` features and the last dated closure older than `--idle-days` (or none) | 14 days |
| `UNREADABLE` | the registered root no longer resolves a readable workspace | — |

`--today YYYY-MM-DD` makes date-relative signals deterministic (tests, replays).

## Observer (`toolbox serve`) — RETIRED (2026-07-28)

The Next panel (`apps/web`) and its `toolbox serve` wrapper were removed:
the live observer panel is **Mastra Studio** now (`agents/mastra-handyman`,
`pnpm studio` there — chat with the leader, traces, workflow runs). The
read-only CLI subcommands above (status/health/timeline/moc/review-notes)
remain the toolBox contract. The `src/toolbox_llm.ts` / `src/toolbox_draft.ts`
modules (the intake LLM layer that only the web panel consumed) are orphaned
and slated for retirement; the intake artifact contract itself
(`feature-request.md` consumed by the leader on the next run) is unchanged.

## Typical Loop

```bash
node handyman/dist/toolbox.js discover --scan ~/proyectos --register   # once
node handyman/dist/toolbox.js status                                   # what's going on?
node handyman/dist/toolbox.js health                                   # anything stuck?
# live panel: Mastra Studio (agents/mastra-handyman, `pnpm studio`)
```

## Heartbeat as a post_run Hook

```json
"post_run": ["node handyman/dist/toolbox.js heartbeat --root ."]
```

That relative path works in the skill repo itself; a target project must point
at wherever the skill lives. `feature done` treats a failing `post_run` step
as a warning, so a missing toolBox script never blocks a verified closure.
`timeline` merges events and history, preferring history on
(project, feature, date) collisions; event-only entries render as
`(heartbeat)`.

## Future Work (deliberately out of scope)

- **Role-CLI writes from the observer** (start/block/unblock a feature directly)
  — beyond the single intake submit that `POST /api/intake` already covers; would
  require the session-token model of the legacy workstation to gate mutating
  role-CLI calls.
- **ToolBox upgrades** — orchestrating `npx handyman-harness@3 upgrade_harness` over every
  harness flagged `BEHIND`.
