---
name: handyman
description: 'Install, analyze, bootstrap, run, review, or migrate a Handyman agent harness: leader/implementer/reviewer roles work one feature at a time with disk state and executable verification. Triggers: harness or subagent workflow, feature_list.json, AGENTS.md, CHECKPOINTS.md, progress/, backlog/, HARNESS_WORKSPACE, .handyman, $HOME/HANDYMAN, per-role models/tools, anti-telefono-descompuesto, Obsidian vault harness. DO NOT USE FOR generic coding without the harness workflow.'
argument-hint: 'analyze | bootstrap local|global | run-feature | review | migrate-global'
user-invocable: true
metadata:
  version: 1.5.0
---

# Handyman

Install, analyze, create, migrate, or operate a Handyman harness: an operating layer around a repo where agents work through explicit roles, disk state, one feature at a time, and executable verification. The pattern: `AGENTS.md`, `feature_list.json`, `progress/`, `docs/`, `CHECKPOINTS.md`, `init.sh`, and role files for leader, implementer, and reviewer. Mutable state lives in `HARNESS_WORKSPACE`, which also works as an [Obsidian](https://obsidian.md) vault.

Handyman supersedes `harness-subagents` (Foreman); prefer Handyman when both could match. Do not use it for ordinary feature work unless the user wants the harness workflow.

## Quick Start

1. Pick a mode: `analyze`, `bootstrap`, `run-feature`, `review`, or `migrate-global`. If unclear, start with `analyze`.
2. Resolve `HARNESS_WORKSPACE`: `harness.config.json`, then `feature_list.json` config, then `PROJECT_ROOT/.handyman/`, then the legacy `PROJECT_ROOT` fallback.
3. To create a harness, scaffold deterministically: `scripts/scaffold.sh <local|global> <project_root>`, then fill the copied templates with project-specific content.
4. To work, run one feature: lowest-id `pending`, mark `in_progress`, delegate implement then review, close only after a green verifier.
5. Reports live in `$HARNESS_WORKSPACE/backlog/`; the chat carries only short file references.

Walkthroughs: [references/examples.md](./references/examples.md).

## Operating Modes

| Mode | Goal | Primary output |
|------|------|----------------|
| `analyze` | Inspect an existing harness | Findings, missing files, state risks, next actions |
| `bootstrap` | Create the harness structure in a repo | Files in project root and `HARNESS_WORKSPACE` |
| `run-feature` | Execute one pending feature | Updated progress files, tests, review evidence |
| `review` | Validate a finished feature or harness | Checklist verdict and required changes |
| `migrate-global` | Move local state to `$HOME/HANDYMAN` | Global workspace plus updated bridge files |

## Installation Scope

During `bootstrap`, choose one scope; if the user did not specify it, ask `local` or `global`.

| Scope | Project root | Harness workspace |
|-------|--------------|-------------------|
| `local` | Bridge files: `AGENTS.md`, `CHECKPOINTS.md`, `init.sh`, role files | `PROJECT_ROOT/.handyman` |
| `global` | Bridge files plus `harness.config.json` | `$HOME/HANDYMAN/<project_name>` |

- Mutable state always lives in the harness workspace: `feature_list.json`, `progress/`, `backlog/`, `docs/`, optional `index.md`.
- Local: gitignore `.handyman/*` except `.handyman/docs/`, keeping the repo abstract from operational state. Legacy harnesses without `.handyman/` keep resolving to `PROJECT_ROOT`.
- Global: set `HANDYMAN_ROOT=$HOME/HANDYMAN`; derive `project_name` from the repo basename. `init.sh` runs from the project root but validates state from `HARNESS_WORKSPACE`. Ask before reusing a workspace that belongs to another `project_root`. Harnesses without a config default to `local`.

## Core Rules

- One feature at a time. Never mix unrelated feature work.
- Disk is the source of truth. Resolve `HARNESS_WORKSPACE` before reading or writing `feature_list.json`, `progress/current.md`, `progress/history.md`.
- Subagents write reports to `$HARNESS_WORKSPACE/backlog/` (`impl_<feature>.md`, `review_<feature>.md`, `explore_<topic>.md`) and reply with references only, such as `done -> backlog/impl_cli_edit.md` (anti-telefono-descompuesto).
- No feature is `done` until the verifier, normally `./init.sh`, exits 0.
- Leader coordinates, never edits product code. Implementer writes code and tests. Reviewer validates, never edits code.
- Model per role: strong reasoning for the leader; cheap, fast models for implementer and reviewer (prefer one configured in the editor, fallback `Claude Sonnet 4.6`). See [references/models.md](./references/models.md).
- Least-privilege tools per role: leader widest (including `agent`, `web`, `browser`); implementer and reviewer without delegation or web; explorer read-only with no `edit`. See [references/tools.md](./references/tools.md).
- Role files live in the platform-discoverable path (`.github/agents/<role>.agent.md` for VS Code/Copilot, `.claude/agents/<role>.md` for Claude Code), never inside `HARNESS_WORKSPACE`, in both scopes.
- Treat the graphify knowledge graph as the context layer: build with `/graphify`, query it before exploring code, keep it fresh with the post-commit hook or `/graphify --update`. See [references/graphify.md](./references/graphify.md).
- The workspace doubles as an Obsidian vault: YAML frontmatter in reports, an `index.md` MOC, `#handyman/...` tags. See [references/obsidian.md](./references/obsidian.md).
- If a required file, command, or path is missing, document the gap before inventing a workaround.

## Workflow

Role protocols: [references/workflow.md](./references/workflow.md).

**Analyze.** Read `AGENTS.md`; resolve `HARNESS_WORKSPACE`; inspect `feature_list.json`, `progress/`, `backlog/`, `docs/`, `CHECKPOINTS.md`, verifier, and role files (their `model` and `tools`); run the verifier if safe; report scope, structure, lifecycle, state, gaps, risks. Use [anatomy](./references/anatomy.md) and [checklists](./references/checklists.md).

**Bootstrap.** Confirm target repo, scope, and whether existing files may change. Scaffold with `scripts/scaffold.sh <local|global> <project_root>` (never overwrites), then create or adjust only missing or approved files. Keep docs specific to the repo. Assign per-role models and tools, place role files in the platform path, keep `backlog/` for reports, and add an executable verifier (required files, state from `HARNESS_WORKSPACE`, tests from the project root). Use [templates](./references/templates.md).

**Run one feature.** Verifier green before changes; pick the lowest-id `pending` feature unless told otherwise; mark exactly one `in_progress` and update `progress/current.md`; delegate implementation (or follow the implementer protocol); require tests proving acceptance criteria; verifier green; delegate review (or use `CHECKPOINTS.md`); only after approval mark `done`, append to `progress/history.md`, reset `progress/current.md`.

**Review.** Read the implementation report in `backlog/`; compare changed files against `docs/business.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md`; run the verifier; write `backlog/review_<feature>.md`; return only `APPROVED -> <file>` or `CHANGES_REQUESTED -> <file>`.

**Migrate local to global.** Never migrate an active session without explicit approval. Create `$HOME/HANDYMAN/<project_name>`; move `feature_list.json`, `progress/`, `backlog/`, operational `docs/`; write `harness.config.json`; repoint `AGENTS.md`, `CHECKPOINTS.md`, role files, `init.sh`; run the verifier and document drift.

## Output Style

Analysis returns concise sections: `Structure`, `Lifecycle`, `Current State`, `Risks`, `Recommended Next Steps`. Work modes write evidence to disk and end with file paths plus verification results.

## References

[Anatomy](./references/anatomy.md) · [Workflow](./references/workflow.md) · [Templates](./references/templates.md) · [Examples](./references/examples.md) · [Checklists](./references/checklists.md) · [Models](./references/models.md) · [Tools](./references/tools.md) · [Obsidian](./references/obsidian.md) · [Graphify](./references/graphify.md)

## License & Attribution

Handyman is distributed under the [MIT](./LICENSE) license. You may use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of it, provided the copyright notice and license text are included in copies or substantial portions of the software.
