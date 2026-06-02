# Harness Checklists

Use these checklists while analyzing, bootstrapping, running, or reviewing a harness-subagents workflow.

## Analysis Checklist

- [ ] `AGENTS.md` exists and gives a progressive navigation map.
- [ ] Install scope is identified as `local` or `global`.
- [ ] `HARNESS_WORKSPACE` is resolved from `harness.config.json`, `feature_list.json` config, a `PROJECT_ROOT/.handyman/` directory, or the legacy `PROJECT_ROOT` fallback.
- [ ] In local mode, `HARNESS_WORKSPACE` is `PROJECT_ROOT/.handyman` (or the legacy `PROJECT_ROOT` for older installs).
- [ ] In global mode, `HARNESS_WORKSPACE` is `$HOME/HANDYMAN/<project_name>`.
- [ ] `$HARNESS_WORKSPACE/feature_list.json` exists and has valid JSON.
- [ ] Valid statuses are explicit.
- [ ] At most one feature is `in_progress`.
- [ ] Pending features are identifiable.
- [ ] `$HARNESS_WORKSPACE/progress/current.md` exists and is either a clean template or an active session.
- [ ] `$HARNESS_WORKSPACE/progress/history.md` exists and is append-only in practice.
- [ ] `$HARNESS_WORKSPACE/docs/architecture.md` defines project-specific boundaries.
- [ ] `$HARNESS_WORKSPACE/docs/conventions.md` defines style and error handling.
- [ ] `$HARNESS_WORKSPACE/docs/verification.md` defines required commands.
- [ ] `CHECKPOINTS.md` gives objective pass/fail criteria and points to `HARNESS_WORKSPACE` for mutable state.
- [ ] A verifier such as `./init.sh` exists and can be run.
- [ ] Role files exist if the project claims multi-agent orchestration.
- [ ] Role files declare a `model` (or rely on a documented default) appropriate to the role: stronger for leader, cheaper for implementer and reviewer.
- [ ] Subagent reports live in `$HARNESS_WORKSPACE/progress/` instead of chat.
- [ ] README or docs explain the workflow for humans.

## Bootstrap Checklist

- [ ] Ask before overwriting existing repo instructions or verifier files.
- [ ] Ask for `local` or `global` install scope when the user did not specify it.
- [ ] In local mode, create `PROJECT_ROOT/.handyman/` and keep bridge files (`AGENTS.md`, `CHECKPOINTS.md`, `init.sh`) in the repo root.
- [ ] In global mode, derive `project_name` from the target repo directory name.
- [ ] In global mode, create `$HOME/HANDYMAN/<project_name>` before any agent work starts.
- [ ] In global mode, create `harness.config.json` in the project root.
- [ ] Create `$HARNESS_WORKSPACE/progress/` before any agent work starts.
- [ ] Add a starter `$HARNESS_WORKSPACE/feature_list.json` with at least one concrete feature.
- [ ] Add `.obsidian/` and `.trash/` to the relevant project or workspace `.gitignore` when the workspace will be opened in Obsidian.
- [ ] Write docs that match the actual repo, not generic placeholders.
- [ ] Make the verifier executable.
- [ ] Ensure the verifier fails on invalid feature state.
- [ ] Ensure the verifier reads state from `HARNESS_WORKSPACE` and runs tests from `PROJECT_ROOT`.
- [ ] Add leader, implementer, and reviewer role definitions when the platform supports them.
- [ ] Assign a model per role: stronger for leader, cheaper for implementer and reviewer, preferring an editor-configured model and otherwise `Claude Sonnet 4.6`.
- [ ] Add anti-telephone instructions to all role files.
- [ ] Add closure instructions to `AGENTS.md`.
- [ ] Run the verifier before declaring the harness ready.

## Run-Feature Checklist

- [ ] Verifier is green before starting, or blocker is documented.
- [ ] `HARNESS_WORKSPACE` is resolved before feature state changes.
- [ ] Exactly one feature is selected.
- [ ] Selected feature is `in_progress`.
- [ ] `$HARNESS_WORKSPACE/progress/current.md` includes feature, plan, log, and next step.
- [ ] Changes stay within acceptance criteria.
- [ ] Tests prove success and relevant failure paths.
- [ ] Verifier is green after implementation.
- [ ] Implementation report exists under `$HARNESS_WORKSPACE/progress/`.
- [ ] Review report exists under `$HARNESS_WORKSPACE/progress/`.
- [ ] Approved features are marked `done`.
- [ ] `$HARNESS_WORKSPACE/progress/history.md` has the closing entry.
- [ ] `$HARNESS_WORKSPACE/progress/current.md` is reset.

## Review Checklist

- [ ] Implementation report names changed files and test output.
- [ ] Implementation report is read from `$HARNESS_WORKSPACE/progress/`.
- [ ] Changed files respect architecture boundaries.
- [ ] New dependencies are approved or absent.
- [ ] Error handling follows project policy.
- [ ] Tests are meaningful and not only smoke assertions.
- [ ] Verifier exits 0.
- [ ] `CHECKPOINTS.md` items are marked with evidence from the resolved workspace.
- [ ] Verdict is either `APPROVED` or `CHANGES_REQUESTED`.
- [ ] Required changes are concrete and file-specific.
- [ ] Reviewer did not edit code.

## Obsidian Checklist

- [ ] `progress/current.md` includes YAML frontmatter with `feature`, `status`, `role`, `updated`, `tags`.
- [ ] `progress/history.md` includes YAML frontmatter with `tags`.
- [ ] `progress/impl_<feature>.md` and `progress/review_<feature>.md` carry frontmatter with `feature`, `status`, `role`, `updated`, `tags`.
- [ ] `progress/explore_<topic>.md` reports carry frontmatter with `topic`, `role`, `updated`, `tags`.
- [ ] Tags use the documented `#handyman/...` namespace, including `feature`, `role`, `review`, `session/current`, `history`, `docs`, `blocked`, and `moc` as applicable.
- [ ] An `index.md` MOC at the workspace root links `feature_list.json`, `docs/`, `progress/current`, and `progress/history`; it links `AGENTS` or `CHECKPOINTS` only when those files exist inside the same vault.
- [ ] `.obsidian/` and `.trash/` are in the relevant `.gitignore` and not committed (in local installs also ignore `.handyman/.obsidian/` and `.handyman/.trash/`).
- [ ] Wikilinks (`[[...]]`) used in markdown still resolve to existing files.

## Common Risks

| Risk | Symptom | Response |
|------|---------|----------|
| Stale session | `$HARNESS_WORKSPACE/progress/current.md` contains old work | Resume or close the session before starting new work. |
| Split scope | More than one feature changed | Stop, document, and split into separate sessions. |
| Chat carries artifacts | Subagent returns long report in chat | Reject and ask for a `$HARNESS_WORKSPACE/progress/` file reference. |
| False green | Feature marked `done` but verifier was not run | Reopen or block until verifier output exists. |
| Missing architecture contract | `$HARNESS_WORKSPACE/docs/architecture.md` is generic | Write project-specific boundaries before coding. |
| Reviewer edits code | Review pass includes fixes | Separate roles again; reviewer files findings only. |
| History drift | `$HARNESS_WORKSPACE/feature_list.json` and `$HARNESS_WORKSPACE/progress/history.md` disagree | Report the inconsistency before closing new work. |
| Verifier too weak | It checks files but not tests | Add test execution before trusting closure. |
| Platform mismatch | Role files are for another agent system | Keep protocol, adapt paths and frontmatter. |
| Path drift | `AGENTS.md`, `CHECKPOINTS.md`, and role files disagree about `HARNESS_WORKSPACE` | Stop and repair the bridge config before editing state. |
| Project name collision | Two repos share the same basename under `$HOME/HANDYMAN` | Ask before reusing; consider a disambiguated name. |
| Split state | Some reports are in the repo and some are under HANDYMAN | Move the reports to the resolved workspace or document a migration before continuing. |

## Dry Run Expected Findings For The Example Repo

When run against the `ejemplo-harness-subagentes` reference repo, a correct analysis should notice:

- Core files exist in the resolved mode: `AGENTS.md`, `feature_list.json`, `progress/`, `docs/`, `CHECKPOINTS.md`, `init.sh`.
- Role files exist under `.claude/agents/`.
- `./init.sh` runs Python unittest from `PROJECT_ROOT` and validates feature state from `HARNESS_WORKSPACE`.
- `$HARNESS_WORKSPACE/feature_list.json` has a pending `cli_recent` feature.
- `$HARNESS_WORKSPACE/progress/current.md` is a clean template.
- `$HARNESS_WORKSPACE/progress/history.md` records earlier sessions up to `cli_edit`.
- The app itself is a small notes CLI; the important part is the harness around it.
- `AGENTS.md` may reference `scripts/demo_orchestration.py`; report it if the file is absent.
