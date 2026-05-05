# Harness Anatomy

A harness-subagents repo is a normal software project plus an explicit operating system for agents. The app can be small; the harness makes work auditable, repeatable, and reviewable.

The harness has two possible roots:

- `PROJECT_ROOT`: the repo where product code, tests, verifier scripts, and stable agent entrypoints live.
- `HARNESS_WORKSPACE`: the directory that owns mutable harness state. In local mode this is `PROJECT_ROOT`; in global mode this is `$HOME/HANDYMAN/<project_name>`.

Global mode keeps the repo as a stable bridge and moves operational state into HANDYMAN. This separates code from work history while preserving a single source of truth for active sessions.

## Obsidian Frontmatter And Tags

The `HARNESS_WORKSPACE` is also a valid Obsidian vault. Mutable markdown files carry YAML frontmatter so Obsidian can index them by feature, status, role, and tags.

Minimal frontmatter per file:

| File | Required keys |
|------|---------------|
| `progress/current.md` | `feature`, `status`, `role`, `updated`, `tags` |
| `progress/history.md` | `tags` (typically `[handyman/history]`) |
| `progress/impl_<feature>.md` | `feature`, `status`, `role: implementer`, `updated`, `tags` |
| `progress/review_<feature>.md` | `feature`, `status` (`approved` or `changes_requested`), `role: reviewer`, `updated`, `tags` |
| `progress/explore_<topic>.md` | `topic`, `role: explorer`, `updated`, `tags` |
| `index.md` (MOC) | `tags: [handyman/moc]` |

Tag namespace:

- `#handyman/feature/pending|in_progress|done|blocked`
- `#handyman/role/leader|implementer|reviewer|explorer`
- `#handyman/review/approved|changes_requested`
- `#handyman/session/current` for the active session file.
- `#handyman/history` for the append-only session history.
- `#handyman/docs` for optional documentation frontmatter.
- `#handyman/blocked` for any blocker note.
- `#handyman/moc` for the index.

Wikilinks (`[[docs/architecture]]`, `[[progress/current]]`) are optional and coexist with regular markdown links. Only wikilink files that exist inside the opened vault; in global mode, repo-root bridge files such as `AGENTS.md` and `CHECKPOINTS.md` live outside `HARNESS_WORKSPACE` unless mirrored intentionally. The `.obsidian/` directory must stay out of version control.

## Required Core Files

| Logical path | Local mode location | Global mode location | Purpose |
|--------------|---------------------|----------------------|---------|
| `AGENTS.md` | `PROJECT_ROOT/AGENTS.md` | `PROJECT_ROOT/AGENTS.md` | Entrypoint map for agents. It explains what to read first and where rules live. |
| `harness.config.json` | Optional | `PROJECT_ROOT/harness.config.json` | Bridge file that records `install_mode`, `project_root`, `handyman_root`, and `harness_workspace`. |
| `feature_list.json` | `PROJECT_ROOT/feature_list.json` | `HARNESS_WORKSPACE/feature_list.json` | Backlog and state machine. It lists features and valid statuses. |
| `progress/current.md` | `PROJECT_ROOT/progress/current.md` | `HARNESS_WORKSPACE/progress/current.md` | Live session state. It records the active feature, plan, log, and next step. |
| `progress/history.md` | `PROJECT_ROOT/progress/history.md` | `HARNESS_WORKSPACE/progress/history.md` | Append-only history of closed sessions. |
| `docs/architecture.md` | `PROJECT_ROOT/docs/architecture.md` | `HARNESS_WORKSPACE/docs/architecture.md` | Project-specific definition of good architecture. |
| `docs/conventions.md` | `PROJECT_ROOT/docs/conventions.md` | `HARNESS_WORKSPACE/docs/conventions.md` | Style, naming, layout, and error-handling rules. |
| `docs/verification.md` | `PROJECT_ROOT/docs/verification.md` | `HARNESS_WORKSPACE/docs/verification.md` | Commands and evidence required before a feature can close. |
| `CHECKPOINTS.md` | `PROJECT_ROOT/CHECKPOINTS.md` | `PROJECT_ROOT/CHECKPOINTS.md` | Objective final-state checklist for reviewers, with checks pointing to `HARNESS_WORKSPACE`. |
| `init.sh` or equivalent | `PROJECT_ROOT/init.sh` | `PROJECT_ROOT/init.sh` | Executable verifier that checks environment, resolved harness state, and tests. |

## Recommended Role Files

Use role files when the host agent system supports subagents. Adapt the path to the platform.

| Role | Typical path | Responsibility |
|------|--------------|----------------|
| `leader` | `.claude/agents/leader.md` or `.github/agents/leader.agent.md` | Orchestrates, reads state, delegates, never implements product code. |
| `implementer` | `.claude/agents/implementer.md` or `.github/agents/implementer.agent.md` | Implements exactly one feature, writes tests, self-verifies. |
| `reviewer` | `.claude/agents/reviewer.md` or `.github/agents/reviewer.agent.md` | Reviews against docs and checkpoints, runs verifier, never edits product code. |

## Optional Support Files

| Path | Purpose |
|------|---------|
| `.claude/settings.json` | Hooks and command allowlists for Claude Code workflows. |
| `.github/instructions/*.instructions.md` | VS Code/Copilot instruction files for project-specific behavior. |
| `.github/prompts/*.prompt.md` | Reusable prompts for recurring tasks. |
| `scripts/validate_harness.*` | Optional automated structure validator. |
| `$HARNESS_WORKSPACE/progress/impl_<feature>.md` | Implementer report with files changed and test output. |
| `$HARNESS_WORKSPACE/progress/review_<feature>.md` | Reviewer verdict with checklist and required changes. |

## Feature List Contract

A minimal `feature_list.json` lives in `HARNESS_WORKSPACE` and contains:

- Project metadata.
- Optional config for `install_mode`, `project_name`, `project_root`, `handyman_root`, and `harness_workspace`.
- Global rules such as `one_feature_at_a_time` and `require_tests_to_close`.
- `valid_status`: usually `pending`, `in_progress`, `done`, `blocked`.
- A `features` array with `id`, `name`, `title`, `description`, `acceptance`, and `status`.

Rules:

- At most one feature may be `in_progress`.
- Pick the lowest-id `pending` feature by default.
- A feature can move to `done` only after implementation, tests, verifier, and review.
- If blocked, record the blocker in `$HARNESS_WORKSPACE/progress/current.md` and set status to `blocked` only when the repo policy allows it.

## Progress Contract

`$HARNESS_WORKSPACE/progress/current.md` should include:

- Active feature or `_none_`.
- Start time.
- Agent role.
- 3 to 5 bullet plan.
- Live log of significant steps.
- Next step for a resumed session.

`$HARNESS_WORKSPACE/progress/history.md` should be append-only. Never rewrite old sessions during normal work. Add a closing entry with changed files, verification result, review result, and final feature state.

## Verification Contract

The verifier should be executable and should fail loudly. Typical checks:

1. Required tools are installed.
2. Required project bridge files exist.
3. Required harness files exist in `HARNESS_WORKSPACE`.
4. `$HARNESS_WORKSPACE/feature_list.json` parses and has no more than one `in_progress` feature.
5. Tests run and pass from `PROJECT_ROOT`.
6. Optional checks detect suspicious temporary files, broken docs, or missing reports.

## Anti Telephone Protocol

Subagents must not return full code, diffs, long research notes, or review reports in chat. They write those artifacts to disk and return one short reference.

Good:

```text
done -> $HARNESS_WORKSPACE/progress/impl_cli_recent.md
APPROVED -> $HARNESS_WORKSPACE/progress/review_cli_recent.md
blocked -> $HARNESS_WORKSPACE/progress/current.md
```

Bad:

```text
Here is the full diff...
I reviewed everything and it looks fine...
```

The leader can read the referenced files if it needs to audit or continue.
