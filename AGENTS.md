# AGENTS.md - Foreman CLI Agent Map

This file is the entrypoint for agents working on the Foreman CLI project.

## Harness Location

- **Install scope:** global
- **Project root:** `/Users/rodrigomardones/.agents/skills/foreman`
- **Foreman root:** `/Users/rodrigomardones/FOREMAN`
- **Harness workspace:** `/Users/rodrigomardones/FOREMAN/foreman-cli`

Mutable harness state lives in `HARNESS_WORKSPACE`, not in the project root. Product code, tests, package files, and verifier commands run from `PROJECT_ROOT`.

## Before Starting

1. Run `./init.sh` from `PROJECT_ROOT` and require exit code 0 before code changes.
2. Resolve `HARNESS_WORKSPACE` from `harness.config.json`.
3. Read `$HARNESS_WORKSPACE/progress/current.md`.
4. Read `$HARNESS_WORKSPACE/feature_list.json`.
5. Work on exactly one feature at a time.

## Repository Map

| Logical path | Actual location | Purpose | When to read |
|--------------|-----------------|---------|--------------|
| `feature_list.json` | `$HARNESS_WORKSPACE/feature_list.json` | Feature backlog and status | Always at start |
| `progress/current.md` | `$HARNESS_WORKSPACE/progress/current.md` | Active session state | Always at start |
| `progress/history.md` | `$HARNESS_WORKSPACE/progress/history.md` | Append-only session history | For historical context |
| `docs/architecture.md` | `$HARNESS_WORKSPACE/docs/architecture.md` | Architecture contract | Before implementation |
| `docs/conventions.md` | `$HARNESS_WORKSPACE/docs/conventions.md` | Code and workflow conventions | Before editing code |
| `docs/verification.md` | `$HARNESS_WORKSPACE/docs/verification.md` | Required verification commands | Before close |
| `CHECKPOINTS.md` | `$PROJECT_ROOT/CHECKPOINTS.md` | Review checklist | Before review or close |
| `src/` | `$PROJECT_ROOT/src/` | CLI implementation | During implementation |
| `tests/` | `$PROJECT_ROOT/tests/` | Bun tests | During verification |

## Hard Rules

- One feature at a time.
- Do not mark a feature `done` without green verifier output.
- Update `$HARNESS_WORKSPACE/progress/current.md` while working.
- Write implementation and review reports under `$HARNESS_WORKSPACE/progress/`.
- Subagents return only file references, not full diffs or long reports.
- If blocked, document the blocker in `$HARNESS_WORKSPACE/progress/current.md`.
