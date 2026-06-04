---
name: handyman
description: 'Install, analyze, bootstrap, run, review, or migrate a Handyman agent harness: a disk-backed operating layer around a repo where a leader, implementer, and reviewer work one feature at a time with executable verification. Use this whenever the user mentions a harness, a subagent/multi-agent workflow, leader/implementer/reviewer roles, feature_list.json, progress/current.md, AGENTS.md, CHECKPOINTS.md, a .handyman directory, a global $HOME/HANDYMAN workspace, per-role models or tool restrictions, the anti-telefono-descompuesto pattern, or wants an Obsidian-vault-friendly harness, even if they do not say "handyman" explicitly. Handyman is the superset and successor of the older harness-subagents (Foreman) skill; prefer Handyman when both could match, since it adds local vs. global install scope, per-role model and tool assignment, a backlog reports directory, and Obsidian frontmatter/MOC. DO NOT USE FOR generic coding, single-file edits, or feature work where the user does not want the formal harness workflow.'
argument-hint: 'analyze | bootstrap local|global | run-feature | review | migrate-global'
user-invocable: true
metadata:
  version: 1.3.0
---

# Handyman

Use this skill to install, analyze, create, migrate, or operate a Handyman harness where agents work through explicit roles, disk state, one feature at a time, and executable verification.

The reference project pattern is a small app surrounded by a strong workflow: `AGENTS.md`, `feature_list.json`, `progress/`, `docs/`, `CHECKPOINTS.md`, `init.sh`, and role files for leader, implementer, and reviewer. Handyman can install that harness locally inside a hidden `.handyman/` directory in the project so the repo root stays focused on product code, or use a global operational workspace under `$HOME/HANDYMAN/<project_name>`.

Roles can run under different models. The leader uses a stronger reasoning model, while the implementer and reviewer default to cheaper, faster models. See [references/models.md](./references/models.md). Roles also run with restricted tool sets so each role only gets the capabilities its job requires. See [references/tools.md](./references/tools.md).

Task-detail reports (`impl_<feature>.md`, `review_<feature>.md`, `explore_<topic>.md`) live in `$HARNESS_WORKSPACE/backlog/`, separate from the important harness state in `$HARNESS_WORKSPACE/progress/` (`current.md`, `history.md`).

The `HARNESS_WORKSPACE` is designed to also work as an [Obsidian](https://obsidian.md) vault: reports use YAML frontmatter, an `index.md` MOC links the main files, and tags follow a `#handyman/...` namespace. See [references/obsidian.md](./references/obsidian.md).

## Quick Start

1. Pick a mode from the request: `analyze`, `bootstrap`, `run-feature`, `review`, or `migrate-global`. If unclear, start with `analyze`.
2. Resolve `HARNESS_WORKSPACE`: `harness.config.json`, then `feature_list.json` config, then a `PROJECT_ROOT/.handyman/` directory, then the legacy `PROJECT_ROOT` fallback.
3. To create a harness, scaffold the skeleton deterministically: `scripts/scaffold.sh <local|global> <project_root>`, then fill the copied templates with project-specific content.
4. To do work, run one feature: select the lowest-id `pending` feature, mark it `in_progress`, delegate implement then review, and close only after a green verifier.
5. Keep agent reports in `$HARNESS_WORKSPACE/backlog/`; the chat carries only short file references.

For a concrete bootstrap and run-feature walkthrough, see [references/examples.md](./references/examples.md).

## When To Use

Use this skill when the user asks to:

- Analyze a project as a Handyman or harness-subagents example.
- Generate a reusable subagent working structure.
- Create global or project instructions for leader, implementer, reviewer roles.
- Bootstrap an agent harness in another repo.
- Run one pending feature through a controlled lifecycle.
- Preserve subagent outputs in files instead of passing long diffs through chat.

Do not use it for ordinary feature implementation unless the user explicitly wants the harness workflow.

> Relationship to `harness-subagents`: Handyman is the successor of that skill (previously named Foreman). It keeps the same leader/implementer/reviewer flow and adds local vs. global install scope, per-role model and tool assignment, a `backlog/` reports directory, and Obsidian vault support. When both skills could match a request, prefer Handyman.

## Operating Modes

Choose one mode from the user request. If unclear, start with `analyze`.

| Mode | Goal | Primary output |
|------|------|----------------|
| `analyze` | Inspect an existing harness | Findings, missing files, state risks, next actions |
| `bootstrap` | Create the harness structure in a repo | Files under project root and, for global installs, `$HOME/HANDYMAN/<project_name>` |
| `run-feature` | Execute one pending feature | Updated progress files, tests, review evidence |
| `review` | Validate a finished feature or harness | Checklist verdict and required changes |

## Installation Scope

During `bootstrap`, choose one install scope. If the user did not specify it, ask whether to use `local` or `global`.

| Scope | Project root contents | Harness workspace contents |
|-------|-----------------------|----------------------------|
| `local` | Stable bridge files: `AGENTS.md`, `CHECKPOINTS.md`, `init.sh`, role files | Mutable and operational files under `PROJECT_ROOT/.handyman` |
| `global` | Stable bridge files: `AGENTS.md`, `CHECKPOINTS.md`, `init.sh`, role files, and `harness.config.json` | Mutable and operational files under `$HOME/HANDYMAN/<project_name>` |

Local mode rules:

- Set `HARNESS_WORKSPACE` to `PROJECT_ROOT/.handyman`.
- Keep stable bridge files in the repo root: `AGENTS.md`, `CHECKPOINTS.md`, and `init.sh`.
- Store all mutable harness state and operational docs under `.handyman/`: `feature_list.json`, `progress/`, `docs/`, subagent reports, and the optional `index.md`.
- This keeps the repo root focused on product code so contributors are not distracted by harness files.
- Add `.handyman/.obsidian/` and `.handyman/.trash/` to `.gitignore`; commit the rest of `.handyman/` with the project when you want versioned harness state.
- Legacy local harnesses with harness files in the repo root and no `.handyman/` directory keep resolving `HARNESS_WORKSPACE` to `PROJECT_ROOT` for backward compatibility.

Global mode rules:

- Set `HANDYMAN_ROOT` to `$HOME/HANDYMAN` for the active system user.
- Derive `project_name` from the basename of the target repo directory.
- Set `HARNESS_WORKSPACE` to `$HANDYMAN_ROOT/$project_name`.
- Store mutable harness files in `HARNESS_WORKSPACE`: `feature_list.json`, `progress/`, subagent reports, and operational `docs/`.
- Keep project execution local: `init.sh` runs from the project root, but validates state files from `HARNESS_WORKSPACE`.
- Generate local bridge instructions so `AGENTS.md`, `CHECKPOINTS.md`, and role files point agents to the real editable state location.
- If `HARNESS_WORKSPACE` already exists for another `project_root`, ask before reusing or changing it.
- Existing harnesses without `harness.config.json` or a config section default to `local` for backward compatibility.

## Core Rules

- One feature at a time. Never mix unrelated feature work in the same harness session.
- Disk is the source of truth. Resolve `HARNESS_WORKSPACE` before reading or writing `feature_list.json`, `progress/current.md`, and `progress/history.md`.
- Subagents write reports to files such as `$HARNESS_WORKSPACE/backlog/impl_<feature>.md` and `$HARNESS_WORKSPACE/backlog/review_<feature>.md`.
- Chat responses from subagents should be references only, such as `done -> $HARNESS_WORKSPACE/backlog/impl_cli_edit.md`.
- No feature is `done` until the verifier, normally `./init.sh`, exits 0.
- A leader coordinates and does not edit product code. An implementer writes code and tests. A reviewer validates and does not edit code.
- Assign a model per role. The leader uses a stronger reasoning model; the implementer and reviewer default to cheaper, faster models, preferring a model already configured in the editor and otherwise falling back to `Claude Sonnet 4.6`. See [references/models.md](./references/models.md).
- Assign a restricted tool set per role following least privilege: the leader gets the widest surface (including `agent`, `web`, `browser`); the implementer and reviewer drop delegation and web; the explorer is read-only with no `edit`. See [references/tools.md](./references/tools.md).
- Agent/role files always live in the platform-discoverable path (`.github/agents/<role>.agent.md` for VS Code/Copilot, `.claude/agents/<role>.md` for Claude Code), never inside `HARNESS_WORKSPACE`. The host agent system only loads agents from those known paths; placing them under `.handyman/` makes them undiscoverable and uninvocable. This holds for both `local` and `global` scope: install scope changes where mutable state lives, not where agents live.
- If any required file, command, or path configuration is missing, document the gap before inventing a workaround.

## Workflow

### 1. Analyze Existing Harness

1. Read the repo entrypoint first: `AGENTS.md` or equivalent.
2. Resolve `HARNESS_WORKSPACE` from `harness.config.json`, `feature_list.json` config, a `PROJECT_ROOT/.handyman/` directory, or the legacy `PROJECT_ROOT` fallback.
3. Inspect `feature_list.json`, `progress/current.md`, `progress/history.md`, `backlog/` reports, `docs/`, `CHECKPOINTS.md`, verifier scripts, and role files (including their per-role `model` and `tools`) at their resolved locations.
4. Run the verifier if the repo asks for it and the command is safe.
5. Report: install scope, structure map, lifecycle, current feature state, verification command, missing files, and risks.
6. Use [anatomy](./references/anatomy.md) and [checklists](./references/checklists.md).

### 2. Bootstrap Harness

1. Confirm the target repo, install scope, and whether existing files may be modified.
2. If the scope is unclear, ask the user to choose `local` or `global`.
3. Create the directory skeleton and copy starter templates deterministically with the bundled scaffold, which never overwrites existing files: `scripts/scaffold.sh <local|global> <project_root>`. Then create or adjust only missing or approved files.
4. In `local` mode, keep bridge files in the repo root (`AGENTS.md`, `CHECKPOINTS.md`, `init.sh`, and role definitions if supported) and place mutable state and operational docs under `PROJECT_ROOT/.handyman`: `feature_list.json`, `progress/`, `docs/`, and the optional `index.md`.
5. In `global` mode, add local bridge files in the repo root and add operational state under `$HOME/HANDYMAN/<project_name>`.
6. Keep docs specific to the repo architecture, not generic filler.
7. Assign a model per role when role files are supported: a stronger model for the leader and cheaper, faster models for the implementer and reviewer, following [references/models.md](./references/models.md).
8. Assign a restricted tool set per role when role files are supported, following the least-privilege defaults in [references/tools.md](./references/tools.md).
9. Place role/agent files in the platform-discoverable path (`.github/agents/<role>.agent.md` or `.claude/agents/<role>.md`), never under `HARNESS_WORKSPACE` or `.handyman/`, in both `local` and `global` scope.
10. Create the `$HARNESS_WORKSPACE/backlog/` directory for task-detail reports (`impl_<feature>.md`, `review_<feature>.md`, `explore_<topic>.md`), keeping `progress/` for `current.md` and `history.md`.
11. Add an executable verifier that checks required files, validates feature state from `HARNESS_WORKSPACE`, and runs tests from the project root.
12. Use [templates](./references/templates.md).

### 3. Run One Feature

1. Run the verifier before changes.
2. Pick the lowest-id `pending` feature unless the user selected another one.
3. Resolve `HARNESS_WORKSPACE`.
4. Mark exactly that feature `in_progress` and update `$HARNESS_WORKSPACE/progress/current.md`.
5. Delegate implementation if an implementer subagent exists; otherwise follow the implementer protocol directly.
6. Require tests that prove the acceptance criteria.
7. Run the verifier until green.
8. Delegate review if a reviewer exists; otherwise do a review pass using `CHECKPOINTS.md`.
9. Only after approval, mark the feature `done`, append to `$HARNESS_WORKSPACE/progress/history.md`, and reset `$HARNESS_WORKSPACE/progress/current.md`.
10. Use [workflow](./references/workflow.md).

### 4. Review

1. Resolve `HARNESS_WORKSPACE`.
2. Read the claimed implementation report in `$HARNESS_WORKSPACE/backlog/`.
3. Compare changed files against resolved `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, and `CHECKPOINTS.md`.
4. Run the verifier.
5. Write a verdict file. Prefer `$HARNESS_WORKSPACE/backlog/review_<feature>.md`.
6. Return only `APPROVED -> <file>` or `CHANGES_REQUESTED -> <file>`.

### 5. Migrate Local To Global

1. Do not migrate while local `progress/current.md` contains an active session unless the user explicitly approves.
2. Create `$HOME/HANDYMAN/<project_name>`.
3. Move or copy `feature_list.json`, `progress/`, `backlog/`, and operational `docs/` from `PROJECT_ROOT/.handyman` (or the legacy repo root) into the global harness workspace.
4. Add or update `harness.config.json` in the project root with `install_mode`, `project_name`, `project_root`, `handyman_root`, `harness_workspace`, and the optional `models` and `tools` maps.
5. Update `AGENTS.md`, `CHECKPOINTS.md`, role files, and `init.sh` so all mutable state edits point to `HARNESS_WORKSPACE`.
6. Run the verifier and document any path drift before continuing feature work.

## Output Style

For analysis, return concise sections: `Structure`, `Lifecycle`, `Current State`, `Risks`, `Recommended Next Steps`.

For bootstrap or run-feature work, keep the user updated, write evidence to disk, and summarize file paths plus verification results at the end.

## Obsidian Integration

The `HARNESS_WORKSPACE` doubles as an Obsidian vault without duplicating files. Reports include YAML frontmatter, an `index.md` MOC links the main entrypoints, and tags follow the `#handyman/...` namespace. Open the workspace folder with Obsidian's *Open folder as vault*. The harness keeps editing markdown as before; Obsidian only adds visualization.

See [references/obsidian.md](./references/obsidian.md) for conventions, recommended plugins, and the MOC template.

## Role Models

Each role can run under its own model so reasoning budget is spent where decisions are made:

- The leader uses a higher-capability reasoning model (the editor default or the strongest available).
- The implementer and reviewer default to cheaper, faster models. Prefer a cheap model already configured in the editor; if none is found, fall back to `Claude Sonnet 4.6`.
- The explorer uses the cheapest fast model.

Declare the model in role-file frontmatter (`model:`) or in a `models` map inside `harness.config.json`. Confirm the identifier matches a model the host platform exposes, and record any substitution in `$HARNESS_WORKSPACE/progress/current.md`.

See [references/models.md](./references/models.md) for the full resolution order, defaults, and per-platform syntax.

## Role Tools

Each role runs with a restricted tool set so it only gets the capabilities its job requires (least privilege):

- The leader gets the widest surface: `vscode`, `execute`, `read`, `agent`, `edit`, `search`, `web`, `browser`, `todo`.
- The implementer and reviewer drop delegation and web: `vscode`, `execute`, `read`, `edit`, `search`, `todo`.
- The explorer is read-only with no `edit` and no `agent`: `vscode`, `execute`, `read`, `search`, `todo`.

Declare tools in role-file frontmatter (`tools:`) or in a `tools` map inside `harness.config.json`. Map each logical group to the concrete tools the host platform exposes, and record any dropped group in `$HARNESS_WORKSPACE/progress/current.md`.

See [references/tools.md](./references/tools.md) for capability groups, per-role defaults, resolution order, and per-platform syntax.

## References

- [Anatomy](./references/anatomy.md)
- [Workflow](./references/workflow.md)
- [Templates](./references/templates.md)
- [Examples](./references/examples.md)
- [Checklists](./references/checklists.md)
- [Role Models](./references/models.md)
- [Role Tools](./references/tools.md)
- [Obsidian Integration](./references/obsidian.md)

## License & Attribution

Handyman is distributed under the [MIT](./LICENSE) license. You may use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of it, provided the copyright notice and license text are included in copies or substantial portions of the software.
