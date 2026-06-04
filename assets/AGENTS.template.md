# AGENTS.md - Agent Navigation Map

This file is the entrypoint for any agent working in this repo. It is a map, not a full rulebook. Read only what you need when you need it.

## Harness Location

- **Install scope:** local
- **Project root:** `.`
- **Handyman root:** _not used_
- **Harness workspace:** `.handyman`

In local mode the harness workspace is `PROJECT_ROOT/.handyman`. Read and write mutable harness state there, not in the repo root, so the root stays focused on product code. If install scope is `global`, the harness workspace must be `$HOME/HANDYMAN/<project_name>` instead. Product code, tests, and verifier commands still run from the project root in both modes.

## Before Starting

1. Run `./init.sh` and verify it exits 0. If it fails, stop and fix the environment before code changes.
2. Resolve `HARNESS_WORKSPACE` from `harness.config.json`, `feature_list.json` config, a `.handyman/` directory, or the legacy project-root fallback.
3. Read `$HARNESS_WORKSPACE/progress/current.md`.
4. Read `$HARNESS_WORKSPACE/feature_list.json` and choose one `pending` feature, normally the lowest id.
5. Work on only one feature at a time.

## Repository Map

| Logical path | Actual location | Purpose | When to read |
|--------------|-----------------|---------|--------------|
| `feature_list.json` | `$HARNESS_WORKSPACE/feature_list.json` | Feature backlog and status | Always at start |
| `progress/current.md` | `$HARNESS_WORKSPACE/progress/current.md` | Active session state | Always at start |
| `progress/history.md` | `$HARNESS_WORKSPACE/progress/history.md` | Append-only session history | For historical context |
| `backlog/impl_<feature>.md` | `$HARNESS_WORKSPACE/backlog/impl_<feature>.md` | Implementer report | When reviewing or resuming |
| `backlog/review_<feature>.md` | `$HARNESS_WORKSPACE/backlog/review_<feature>.md` | Reviewer verdict | When closing a feature |
| `docs/architecture.md` | `$HARNESS_WORKSPACE/docs/architecture.md` | Definition of good architecture | Before implementation |
| `docs/conventions.md` | `$HARNESS_WORKSPACE/docs/conventions.md` | Naming, style, structure | Before editing code |
| `docs/verification.md` | `$HARNESS_WORKSPACE/docs/verification.md` | Required verification | Before closing work |
| `CHECKPOINTS.md` | `$PROJECT_ROOT/CHECKPOINTS.md` | Final-state checklist | Before review or close |
| `src/` | `$PROJECT_ROOT/src/` | Product code | During implementation |
| `tests/` | `$PROJECT_ROOT/tests/` | Automated tests | During verification |

## Hard Rules

- One feature at a time.
- Do not mark a feature `done` without green verifier output.
- Update `$HARNESS_WORKSPACE/progress/current.md` while working.
- Write subagent reports under `$HARNESS_WORKSPACE/backlog/` (`impl_<feature>.md`, `review_<feature>.md`, `explore_<topic>.md`).
- Leave the repo clean before closing.
- If blocked, document the blocker instead of improvising around it.
