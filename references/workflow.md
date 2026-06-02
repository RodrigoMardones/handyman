# Harness Workflow

This workflow keeps agent work resumable and auditable.

## Startup

1. Read `AGENTS.md`.
2. Resolve `PROJECT_ROOT` and `HARNESS_WORKSPACE`.
3. Resolve `HARNESS_WORKSPACE` in this order: `harness.config.json`, then `feature_list.json` config, then a `PROJECT_ROOT/.handyman/` directory (local install), then the legacy `PROJECT_ROOT` fallback. Resolve any relative `harness_workspace` such as `.handyman` against `PROJECT_ROOT`.
4. Read `$HARNESS_WORKSPACE/feature_list.json`.
5. Read `$HARNESS_WORKSPACE/progress/current.md`.
6. Run `./init.sh` or the project verifier from `PROJECT_ROOT`.
7. If the verifier fails, stop implementation work and document the blocker in `$HARNESS_WORKSPACE/progress/current.md`.
8. If `$HARNESS_WORKSPACE/progress/current.md` describes an active session, resume or ask before replacing it.

## Leader Protocol

The leader coordinates. It does not implement product code and does not mark a feature `done` alone. It runs under a stronger reasoning model and delegates cheaper roles (see [models.md](./models.md)).

1. Decide whether the request is analysis, bootstrap, one feature, or review.
2. For analysis, inspect and report. Do not modify product code.
3. Resolve `HARNESS_WORKSPACE` before selecting or editing feature state.
4. For one feature, select exactly one `pending` feature from `$HARNESS_WORKSPACE/feature_list.json`.
5. Delegate to an implementer when available.
6. Require the implementer to write a report in `$HARNESS_WORKSPACE/progress/impl_<feature>.md`.
7. Delegate to a reviewer after implementation.
8. Require the reviewer to write a verdict in `$HARNESS_WORKSPACE/progress/review_<feature>.md`.
9. Close only after approval and green verifier.

## Implementer Protocol

The implementer owns exactly one feature. It runs under its assigned model, which defaults to a cheaper, faster model (see [models.md](./models.md)).

1. Read `AGENTS.md`, resolve `HARNESS_WORKSPACE`, and read `$HARNESS_WORKSPACE/docs/architecture.md`, `$HARNESS_WORKSPACE/docs/conventions.md`, and the selected feature acceptance criteria.
2. Change that feature from `pending` to `in_progress` in `$HARNESS_WORKSPACE/feature_list.json`.
3. Update `$HARNESS_WORKSPACE/progress/current.md` with feature, start time, plan, and live log.
4. Implement the smallest code change that satisfies the acceptance criteria.
5. Add or update tests at the same risk level as the change.
6. Run the verifier from `PROJECT_ROOT`.
7. Write `$HARNESS_WORKSPACE/progress/impl_<feature>.md` with YAML frontmatter (`feature`, `status: implemented`, `role: implementer`, `updated`, `tags`), files changed, design notes, and test output.
8. Return only `done -> $HARNESS_WORKSPACE/progress/impl_<feature>.md` or `blocked -> $HARNESS_WORKSPACE/progress/current.md`.

The implementer does not self-approve. It can mark `done` only if the local protocol explicitly says the implementer performs closure after reviewer approval.

## Reviewer Protocol

The reviewer validates and does not edit code. It runs under its assigned model, which defaults to a cheaper, faster model (see [models.md](./models.md)).

1. Resolve `HARNESS_WORKSPACE`.
2. Read `$HARNESS_WORKSPACE/docs/architecture.md`, `$HARNESS_WORKSPACE/docs/conventions.md`, `$HARNESS_WORKSPACE/docs/verification.md`, and `$PROJECT_ROOT/CHECKPOINTS.md`.
3. Read `$HARNESS_WORKSPACE/progress/current.md` and the implementation report.
4. Inspect changed files.
5. Run the verifier from `PROJECT_ROOT`.
6. Mark checklist items as pass or fail.
7. Write `$HARNESS_WORKSPACE/progress/review_<feature>.md` with YAML frontmatter (`feature`, `status: approved` or `status: changes_requested`, `role: reviewer`, `updated`, `tags`) and `APPROVED` or `CHANGES_REQUESTED` in the body.
8. Return only `APPROVED -> $HARNESS_WORKSPACE/progress/review_<feature>.md` or `CHANGES_REQUESTED -> $HARNESS_WORKSPACE/progress/review_<feature>.md`.

## Closure Protocol

Only close a feature when:

- The selected feature acceptance criteria are satisfied.
- Tests are present and green.
- The verifier exits 0.
- The reviewer approved or an equivalent review pass was completed.
- The implementation and review reports exist.

Closure steps:

1. Resolve `HARNESS_WORKSPACE`.
2. Mark the feature `done` in `$HARNESS_WORKSPACE/feature_list.json`.
3. Append a session entry to `$HARNESS_WORKSPACE/progress/history.md`.
4. Reset `$HARNESS_WORKSPACE/progress/current.md` to the repo template.
5. Run the verifier one last time from `PROJECT_ROOT`.
6. Report concise final status to the user.

## Blocked Protocol

If a required tool, file, test, or decision is missing:

1. Stop the unsafe part of the work.
2. Resolve `HARNESS_WORKSPACE` if possible.
3. Update `$HARNESS_WORKSPACE/progress/current.md` with the blocker and exact next step.
4. If appropriate, mark the feature `blocked`.
5. Do not mark `done`.
6. Tell the user what is needed to unblock.

## Parallel Exploration

For complex work, the leader may launch read-only exploration subagents before implementation.

Rules:

- Each explorer gets one narrow question.
- Each explorer runs under the cheapest fast model (see [models.md](./models.md)).
- Each explorer writes to `$HARNESS_WORKSPACE/progress/explore_<topic>.md` with frontmatter (`topic`, `role: explorer`, `updated`, `tags`).
- Each explorer returns only a file reference.
- The leader synthesizes the reports before selecting implementation scope.

## State Transitions

Recommended feature status transitions:

```text
pending -> in_progress -> done
pending -> in_progress -> blocked
blocked -> pending
blocked -> in_progress
```

Avoid moving `done` backward unless the user explicitly reopens the feature and the history records why.
