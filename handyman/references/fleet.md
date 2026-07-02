# Fleet: Multi-Harness Observation

Read-only observation of every Handyman harness on the machine from a single
place. One registry, one collector, derived health signals, and a global
Obsidian MOC. Design and evidence: `docs/analisis-monitoreo-flota.md` in the
skill repo.

## Philosophy

- **Pull, read-only, observe-don't-gate.** `status` and `health` never mutate a
  harness and exit 0 by default (the `metrics.py`/`preflight.py` pattern);
  gating is opt-in via `health --strict`.
- **Disk is the source of truth.** The registry stores ONLY `project_root` +
  the registration date. Names, versions, counts, and sessions are read live on
  every query, so there is no mirrored state to drift.
- **Drift tolerant.** Harnesses of different `harness_version`s coexist; every
  missing field degrades to `null`/`NOTE`, never an exception. An unreadable
  root becomes an `UNREADABLE` signal, not a crash.
- **No foreign verifier runs by default.** The fleet only executes another
  project's `init.sh` under the explicit `status --run-verifier` opt-in; the
  default report never runs foreign code.

## Registry

`$HANDYMAN_ROOT/registry.json` — default `$HOME/HANDYMAN`, overridable with the
`HANDYMAN_ROOT` environment variable or `--handyman-root` (flag > env > home).
Schema: `assets/schemas/registry.schema.json` (draft-07,
`additionalProperties:false`).

The location is a usability decision: `$HOME/HANDYMAN` is a *visible* folder —
it can be opened as an Obsidian vault and shows up in a file manager — and it
is already the skill's global-mode root, so registry, fleet MOC and any global
workspaces share one navigable place. A hidden `~/.handyman` dotfile would be
invisible to both.

```json
{
  "version": 1,
  "harnesses": [
    { "project_root": "/abs/path/to/project", "registered": "2026-07-01" }
  ]
}
```

## Subcommands

Run from the skill repo: `python scripts/fleet.py <subcommand>`.

| Subcommand | Does | Exit |
|---|---|---|
| `register PATH [--date D]` | add a root after checking it resolves a workspace with `feature_list.json`; idempotent | 0 / 1 |
| `unregister PATH` | remove a registered root | 0 / 1 |
| `list [--json]` | show registered roots with live `project_name` | 0 |
| `discover --scan DIR [--register] [--max-depth N]` | find harnesses under a tree (`harness.config.json` or `.handyman/`); prunes `node_modules`, hidden dirs | 0 / 1 |
| `status [--json] [--run-verifier] [--verifier-timeout S]` | per-harness live report + fleet aggregate; `--run-verifier` opt-in executes each harness's `init.sh` and reports `green` / `red` / `skipped` / `timeout` (output discarded, exit code observed, default timeout 300 s) | 0 always |
| `timeline [--json] [--limit N]` | merged closure chronology: every harness's dated `history.md` headings plus pushed events, newest first | 0 always |
| `heartbeat [--root R] [--feature F] [--date D]` | append one closure event to `$HANDYMAN_ROOT/events.jsonl`; without `--feature` it reports the newest `history.md` closure — a drop-in `post_run` hook | 0 / 1 |
| `health [--strict] [--stale-days N] [--idle-days N] [--today D] [--json]` | derived signals per harness | 0; `--strict` 1 on signals |
| `moc [--html]` | regenerate the global fleet MOC at `$HANDYMAN_ROOT/index.md`; `--html` also writes a self-contained `index.html` (no external assets, textual BEHIND/OK labels, dark-mode aware) for sharing outside Obsidian | 0 / 1 |

`status` composes existing primitives — `metrics.collect()` (counts,
throughput, review verdicts, coverage), the live session from
`progress/current.md` frontmatter, `harness_version` vs the skill's current
version, and the last dated closure from `progress/history.md` — it
reimplements no parsing.

## Health Signals

| Signal | Rule | Default window |
|---|---|---|
| `INVARIANT` | more than one feature `in_progress` in `feature_list.json` | — |
| `STALE_WIP` | a feature is `in_progress` and `current.md`'s `updated` stamp is older than `--stale-days` (or missing) | 7 days |
| `BEHIND` | installed `harness_version` is older than the skill version, or the harness is unsealed | — |
| `IDLE` | the queue has `pending` features and the last dated closure is older than `--idle-days` (or none exists) | 14 days |
| `UNREADABLE` | the registered root no longer resolves a readable workspace | — |

`--today YYYY-MM-DD` makes date-relative signals deterministic (tests, replays).
A signal is information for the operator, not a verdict: `IDLE` on an archived
project is expected; `unregister` retires it.

## Fleet MOC

`fleet.py moc` writes `$HANDYMAN_ROOT/index.md`: frontmatter
`tags: [handyman/fleet]`, one section per harness (version line, status counts,
live session, last closure) and absolute markdown links only to files that
exist. The operator `## Notes` section is preserved across regenerations
(mirror of `scripts/index_md.py`). Open `$HOME/HANDYMAN` as an Obsidian vault
to browse the fleet.

## Typical Loop

```bash
python scripts/fleet.py discover --scan ~/proyectos --register   # once
python scripts/fleet.py status                                   # what's going on?
python scripts/fleet.py health                                   # anything stuck?
python scripts/fleet.py moc                                      # refresh the vault view
```

## Heartbeat as a post_run Hook

Declaring the heartbeat in `harness.config.json` makes every feature closure
push its event without any scan:

```json
"post_run": ["python3 handyman/scripts/fleet.py heartbeat --root ."]
```

That relative path works in the skill repo itself. Skill scripts are NOT
scaffolded into target repos, so a target project must point at wherever the
skill lives, e.g.
`python3 ~/.agents/skills/handyman/scripts/fleet.py heartbeat --root .`
(resolve with `tools_discovery.py list` if unsure). `feature.py done` treats a
failing `post_run` step as a warning, so a missing fleet script never blocks a
verified closure. `timeline` merges events and history, preferring history on
(project, feature, date) collisions; event-only entries render as
`(heartbeat)`.

## Future Work (deliberately out of scope)

- **Fleet upgrades** — orchestrating `upgrade_harness.py` over every harness
  flagged `BEHIND`.
