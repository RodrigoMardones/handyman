---
name: handyman
description: 'Use when: install, analyze, create, migrate, or operate a Handyman harness/subagent workflow. Triggers: handyman, HANDYMAN, bootstrap local, bootstrap global, migrate-global, local global harness, /Users/<user>/HANDYMAN, harness_workspace, feature_list.json, progress/current.md, AGENTS.md, CHECKPOINTS.md, leader implementer reviewer, anti telefono descompuesto, multi-agent harness, subagent workflow, obsidian vault. Handles: local project harness installs, global HANDYMAN workspace installs, repo bridge files, one-feature lifecycle, disk-based progress, executable verification, Obsidian-friendly frontmatter and MOC. DO NOT USE FOR: generic coding tasks without a harness workflow.'
argument-hint: 'analyze | bootstrap local|global | run-feature | review | migrate-global'
user-invocable: true
---

# Handyman

Use this skill to install, analyze, create, migrate, or operate a Handyman harness where agents work through explicit roles, disk state, one feature at a time, and executable verification.

The reference project pattern is a small app surrounded by a strong workflow: `AGENTS.md`, `feature_list.json`, `progress/`, `docs/`, `CHECKPOINTS.md`, `init.sh`, and role files for leader, implementer, and reviewer. Handyman can install that harness locally in the project or use a global operational workspace under `$HOME/HANDYMAN/<project_name>`.

The `HARNESS_WORKSPACE` is designed to also work as an [Obsidian](https://obsidian.md) vault: reports use YAML frontmatter, an `index.md` MOC links the main files, and tags follow a `#handyman/...` namespace. See [references/obsidian.md](./references/obsidian.md).

## When To Use

Use this skill when the user asks to:

- Analyze a project as a Handyman or harness-subagents example.
- Generate a reusable subagent working structure.
- Create global or project instructions for leader, implementer, reviewer roles.
- Bootstrap an agent harness in another repo.
- Run one pending feature through a controlled lifecycle.
- Preserve subagent outputs in files instead of passing long diffs through chat.

Do not use it for ordinary feature implementation unless the user explicitly wants the harness workflow.

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
| `local` | All harness files live in the repo root | Same as project root |
| `global` | Stable bridge files: `AGENTS.md`, `CHECKPOINTS.md`, `init.sh`, role files, and `harness.config.json` | Mutable and operational files under `$HOME/HANDYMAN/<project_name>` |

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
- Subagents write reports to files such as `$HARNESS_WORKSPACE/progress/impl_<feature>.md` and `$HARNESS_WORKSPACE/progress/review_<feature>.md`.
- Chat responses from subagents should be references only, such as `done -> $HARNESS_WORKSPACE/progress/impl_cli_edit.md`.
- No feature is `done` until the verifier, normally `./init.sh`, exits 0.
- A leader coordinates and does not edit product code. An implementer writes code and tests. A reviewer validates and does not edit code.
- If any required file, command, or path configuration is missing, document the gap before inventing a workaround.

## Workflow

### 1. Analyze Existing Harness

1. Read the repo entrypoint first: `AGENTS.md` or equivalent.
2. Resolve `HARNESS_WORKSPACE` from `harness.config.json`, `feature_list.json` config, or local fallback.
3. Inspect `feature_list.json`, `progress/current.md`, `progress/history.md`, `docs/`, `CHECKPOINTS.md`, verifier scripts, and role files at their resolved locations.
4. Run the verifier if the repo asks for it and the command is safe.
5. Report: install scope, structure map, lifecycle, current feature state, verification command, missing files, and risks.
6. Use [anatomy](./references/anatomy.md) and [checklists](./references/checklists.md).

### 2. Bootstrap Harness

1. Confirm the target repo, install scope, and whether existing files may be modified.
2. If the scope is unclear, ask the user to choose `local` or `global`.
3. Create only missing or approved files.
4. In `local` mode, add the base structure in the repo root: `AGENTS.md`, `feature_list.json`, `progress/`, `docs/`, `CHECKPOINTS.md`, `init.sh`, and role definitions if supported.
5. In `global` mode, add local bridge files in the repo root and add operational state under `$HOME/HANDYMAN/<project_name>`.
6. Keep docs specific to the repo architecture, not generic filler.
7. Add an executable verifier that checks required files, validates feature state from `HARNESS_WORKSPACE`, and runs tests from the project root.
8. Use [templates](./references/templates.md).

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
2. Read the claimed implementation report in `$HARNESS_WORKSPACE/progress/`.
3. Compare changed files against resolved `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, and `CHECKPOINTS.md`.
4. Run the verifier.
5. Write a verdict file. Prefer `$HARNESS_WORKSPACE/progress/review_<feature>.md`.
6. Return only `APPROVED -> <file>` or `CHANGES_REQUESTED -> <file>`.

### 5. Migrate Local To Global

1. Do not migrate while local `progress/current.md` contains an active session unless the user explicitly approves.
2. Create `$HOME/HANDYMAN/<project_name>`.
3. Move or copy `feature_list.json`, `progress/`, and operational `docs/` into the global harness workspace.
4. Add `harness.config.json` in the project root with `install_mode`, `project_name`, `project_root`, `handyman_root`, and `harness_workspace`.
5. Update `AGENTS.md`, `CHECKPOINTS.md`, role files, and `init.sh` so all mutable state edits point to `HARNESS_WORKSPACE`.
6. Run the verifier and document any path drift before continuing feature work.

## Output Style

For analysis, return concise sections: `Structure`, `Lifecycle`, `Current State`, `Risks`, `Recommended Next Steps`.

For bootstrap or run-feature work, keep the user updated, write evidence to disk, and summarize file paths plus verification results at the end.

## Obsidian Integration

The `HARNESS_WORKSPACE` doubles as an Obsidian vault without duplicating files. Reports include YAML frontmatter, an `index.md` MOC links the main entrypoints, and tags follow the `#handyman/...` namespace. Open the workspace folder with Obsidian's *Open folder as vault*. The harness keeps editing markdown as before; Obsidian only adds visualization.

See [references/obsidian.md](./references/obsidian.md) for conventions, recommended plugins, and the MOC template.

## References

- [Anatomy](./references/anatomy.md)
- [Workflow](./references/workflow.md)
- [Templates](./references/templates.md)
- [Checklists](./references/checklists.md)
- [Obsidian Integration](./references/obsidian.md)

## License & Attribution

Handyman is distributed under the [Creative Commons Attribution 4.0 International (CC BY 4.0)](./LICENSE) license. You may use, adapt, and redistribute it (including commercially) provided you keep the attribution to **Rodrigo Mardones** as described in [NOTICE](./NOTICE).
