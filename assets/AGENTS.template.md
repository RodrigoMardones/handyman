# AGENTS.md - Agent Navigation Map

A map, not a rulebook: read only what you need.

## Harness Location

- **Install scope:** local · **Project root:** `.` · **Harness workspace:** `.handyman`
- Mutable harness state lives in the harness workspace, never in the repo root (global mode uses `$HOME/HANDYMAN/<project_name>`). Code, tests, and the verifier run from the project root.

## Before Starting

1. Run `./init.sh`; if it fails, stop and fix the environment first.
2. Resolve `HARNESS_WORKSPACE`: `harness.config.json`, then `feature_list.json` config, then `.handyman/`, then the legacy fallback.
3. Read `$HARNESS_WORKSPACE/progress/current.md` and `feature_list.json`; work one `pending` feature at a time (lowest id).
4. Query the context graph first when `graphify-out/graph.json` exists: `graphify query "<question>"`; if missing, install graphify (`uv tool install graphifyy`).

## Repository Map

| Path | Location | Read when |
|------|----------|-----------|
| `feature_list.json` | `$HARNESS_WORKSPACE` | always at start |
| `progress/current.md`, `progress/history.md` | `$HARNESS_WORKSPACE/progress/` | always / for history |
| `backlog/impl_<feature>.md`, `backlog/review_<feature>.md` | `$HARNESS_WORKSPACE/backlog/` | reviewing or resuming |
| `docs/business.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md` | `$HARNESS_WORKSPACE/docs/` | before editing / closing |
| `CHECKPOINTS.md` | `$PROJECT_ROOT` | before review or close |
| `src/`, `tests/` | `$PROJECT_ROOT` | implementation |

## Hard Rules

- One feature at a time; never mark `done` without green verifier output.
- Keep `$HARNESS_WORKSPACE/progress/current.md` updated while working.
- Write reports under `$HARNESS_WORKSPACE/backlog/` (`impl_`, `review_`, `explore_`).
- Keep the graphify graph fresh: `graphify hook install` for commits, `/graphify --update` for docs.
- Leave the repo clean; document blockers instead of improvising.
