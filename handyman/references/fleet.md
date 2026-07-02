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
- **No foreign verifier runs.** The fleet never executes another project's
  `init.sh`; live verification stays future opt-in work.

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
| `status [--json]` | per-harness live report + fleet aggregate | 0 always |
| `health [--strict] [--stale-days N] [--idle-days N] [--today D] [--json]` | derived signals per harness | 0; `--strict` 1 on signals |
| `moc` | regenerate the global fleet MOC at `$HANDYMAN_ROOT/index.md` | 0 / 1 |

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

## Future Work (deliberately out of scope)

- **`post_run` heartbeat** — each feature closure appends an event to the
  registry for a scan-free fleet timeline; deferred because skill scripts are
  not scaffolded into target repos, so path resolution needs its own design.
- **Opt-in live verification** — `status --run-verifier` executing each
  project's `init.sh` on demand.
- **Static HTML export** of the MOC for sharing outside Obsidian.
- **Cross-project timeline** merging every `history.md`'s dated headings
  (the data is already in `status --json`).
- **Fleet upgrades** — orchestrating `upgrade_harness.py` over every harness
  flagged `BEHIND`.
