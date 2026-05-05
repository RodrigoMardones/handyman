# Harness Templates

Use these as starting points. Adjust them to the project language, test runner, architecture, and agent platform.

Path placeholders used below:

- `PROJECT_ROOT`: the repo where product code and verifier commands run.
- `HANDYMAN_ROOT`: `$HOME/HANDYMAN` in global mode.
- `HARNESS_WORKSPACE`: the directory that owns mutable harness state. It is `PROJECT_ROOT` in local mode and `$HANDYMAN_ROOT/<project_name>` in global mode.

## AGENTS.md

```markdown
# AGENTS.md - Agent Navigation Map

This file is the entrypoint for any agent working in this repo. It is a map, not a full rulebook. Read only what you need when you need it.

## Harness Location

- **Install scope:** local
- **Project root:** `.`
- **Handyman root:** _not used_
- **Harness workspace:** `.`

If install scope is `global`, the harness workspace must be `$HOME/HANDYMAN/<project_name>`. Read and write mutable harness state there, not in the project root. Product code, tests, and verifier commands still run from the project root.

## Before Starting

1. Run `./init.sh` and verify it exits 0. If it fails, stop and fix the environment before code changes.
2. Resolve `HARNESS_WORKSPACE` from `harness.config.json`, `feature_list.json` config, or local fallback.
3. Read `$HARNESS_WORKSPACE/progress/current.md`.
4. Read `$HARNESS_WORKSPACE/feature_list.json` and choose one `pending` feature, normally the lowest id.
5. Work on only one feature at a time.

## Repository Map

| Logical path | Actual location | Purpose | When to read |
|--------------|-----------------|---------|--------------|
| `feature_list.json` | `$HARNESS_WORKSPACE/feature_list.json` | Feature backlog and status | Always at start |
| `progress/current.md` | `$HARNESS_WORKSPACE/progress/current.md` | Active session state | Always at start |
| `progress/history.md` | `$HARNESS_WORKSPACE/progress/history.md` | Append-only session history | For historical context |
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
- Write subagent reports under `$HARNESS_WORKSPACE/progress/`.
- Leave the repo clean before closing.
- If blocked, document the blocker instead of improvising around it.
```

## feature_list.json

```json
{
  "project": "project-name",
  "description": "Short project description.",
  "config": {
    "install_mode": "local",
    "project_name": "project-name",
    "project_root": ".",
    "handyman_root": null,
    "harness_workspace": "."
  },
  "rules": {
    "one_feature_at_a_time": true,
    "require_tests_to_close": true,
    "valid_status": ["pending", "in_progress", "done", "blocked"]
  },
  "features": [
    {
      "id": 1,
      "name": "first_feature",
      "title": "First feature",
      "description": "What this feature adds.",
      "acceptance": [
        "Concrete observable requirement",
        "Automated tests cover success and failure paths"
      ],
      "status": "pending"
    }
  ]
}
```

## harness.config.json

Create this bridge file in the project root for global installs. Existing local installs may omit it.

```json
{
  "install_mode": "global",
  "project_name": "project-name",
  "project_root": "/absolute/path/to/project-name",
  "handyman_root": "/Users/any_user/HANDYMAN",
  "harness_workspace": "/Users/any_user/HANDYMAN/project-name"
}
```

## progress/current.md

```markdown
---
feature: none
status: idle
role: leader
updated: YYYY-MM-DD
tags: [handyman/session/current]
---

# Current Session

This file is reset when a session closes and its summary moves to `[[history]]`. Keep it updated while working, not only at the end.

- **Feature in progress:** _none_
- **Start:** _-_ 
- **Agent:** _-_

## Plan

_Write 3 to 5 bullets before editing code._

## Log

_Record significant steps, files changed, decisions, and blockers._

- ...

## Next Step

_If interrupted, the next session starts here._
```

## progress/history.md

```markdown
---
tags: [handyman/history]
---

# Session History

Append-only. Do not edit earlier entries during normal work.

---

## YYYY-MM-DD - Feature N: feature_name
- **Agent:** leader -> implementer -> reviewer
- **Plan:** short plan
- **Changes:** files changed
- **Verification:** command and result
- **Review:** APPROVED or CHANGES_REQUESTED with report path
- **Closure:** final feature status
```

## progress/impl_<feature>.md

```markdown
---
feature: <feature_name>
status: implemented
role: implementer
updated: YYYY-MM-DD
tags: [handyman/role/implementer, handyman/feature/<feature_name>]
---

# Implementation Report: <feature_name>

## Files Changed

- ...

## Design Notes

- ...

## Test Output

```text
<verifier output>
```
```

## progress/review_<feature>.md

```markdown
---
feature: <feature_name>
status: approved   # or changes_requested
role: reviewer
updated: YYYY-MM-DD
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/<feature_name>]
---

# Review: <feature_name>

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Checklist

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

## Required Changes

_None, or a concrete list of file-specific changes._
```

## index.md (Obsidian MOC)

Optional but recommended at the root of the `HARNESS_WORKSPACE` to make the vault navigable from Obsidian.

```markdown
---
tags: [handyman/moc]
---

# <project_name> - Handyman Workspace

## Entrypoints

- [[AGENTS]]
- [[CHECKPOINTS]]
- [[feature_list]] <!-- mirror of feature_list.json, if maintained -->

## Docs

- [[docs/architecture]]
- [[docs/conventions]]
- [[docs/verification]]

## Progress

- [[progress/current]]
- [[progress/history]]

## Tags

- `#handyman/feature/in_progress`
- `#handyman/feature/blocked`
- `#handyman/review/changes_requested`
```

## .gitignore (Obsidian)

Append to the project or workspace `.gitignore` so Obsidian's local cache stays out of version control:

```text
.obsidian/
.trash/
```

## docs/architecture.md

```markdown
# Architecture

This document defines what good work means in this repo. Reviewers evaluate code against it.

## Principles

1. Clear layers: describe allowed modules and dependencies.
2. Dependency policy: list allowed dependencies and approval rules for new ones.
3. Explicit errors: describe how failures are represented.
4. Data policy: describe mutability, persistence, schema, and migration rules.
5. IO policy: describe where IO belongs and what must be atomic or transactional.

## Data Flow

Describe user input -> application layer -> domain layer -> storage or external systems.

## What Not To Do

- List architecture violations that reviewers must reject.
```

## docs/conventions.md

```markdown
# Code Conventions

## Language And Runtime

- Version:
- Formatter:
- Line length:
- Imports:
- Naming:

## Tests

- Test path pattern:
- Test naming:
- Required fixtures:
- Real integrations vs mocks:

## Error Handling

Describe domain errors, user-facing errors, logging, and exit codes.

## Comments

Prefer clear names. Add comments only for non-obvious reasoning.
```

## docs/verification.md

```markdown
# Verification

The agent does not claim it works; it demonstrates it.

## Required Commands

```bash
./init.sh
```

## Test Levels

1. Unit tests for public behavior.
2. Integration tests for user-facing flows.
3. Optional smoke test for end-to-end confidence.

## Anti-patterns

- Marking `done` with red tests.
- Tests that only assert no exception.
- Mocking the core behavior that should be proven.
```

## CHECKPOINTS.md

```markdown
# CHECKPOINTS

Resolve `HARNESS_WORKSPACE` before checking state. In local mode it is the project root. In global mode it is `$HOME/HANDYMAN/<project_name>`.

## C1 - Harness Complete

- [ ] Required harness files exist.
- [ ] Verifier exits 0.
- [ ] `HARNESS_WORKSPACE` resolves to the expected directory.

## C2 - State Coherent

- [ ] At most one feature is `in_progress`.
- [ ] `$HARNESS_WORKSPACE/progress/current.md` is empty or describes the active session.
- [ ] Done features have passing tests.

## C3 - Architecture Respected

- [ ] Changed files match `$HARNESS_WORKSPACE/docs/architecture.md`.
- [ ] No unapproved dependencies.
- [ ] No debug prints or TODOs without context.

## C4 - Verification Real

- [ ] Tests cover changed modules.
- [ ] Verifier output shows > 0 tests and all green.

## C5 - Session Closed

- [ ] `$HARNESS_WORKSPACE/progress/history.md` updated.
- [ ] `$HARNESS_WORKSPACE/progress/current.md` reset.
- [ ] Feature status is correct.
```

## Role: leader

```markdown
---
name: leader
description: Orchestrates work, delegates to subagents, and never edits product code directly.
---

# Leader

1. Read `AGENTS.md` and resolve `HARNESS_WORKSPACE`.
2. Read `$HARNESS_WORKSPACE/feature_list.json` and `$HARNESS_WORKSPACE/progress/current.md`.
3. Run `./init.sh` from `PROJECT_ROOT`.
4. Select one task or launch read-only exploration.
5. Delegate implementation.
6. Delegate review.
7. Close only after approval and green verifier.

Never pass long diffs through chat. Require subagents to write files under `$HARNESS_WORKSPACE/progress/`.
```

## Role: implementer

```markdown
---
name: implementer
description: Implements exactly one feature with tests and self-verification.
---

# Implementer

1. Resolve `HARNESS_WORKSPACE`.
2. Read project docs from `$HARNESS_WORKSPACE/docs/`.
3. Mark one feature `in_progress` in `$HARNESS_WORKSPACE/feature_list.json`.
4. Update `$HARNESS_WORKSPACE/progress/current.md`.
5. Implement only the selected acceptance criteria.
6. Add tests.
7. Run `./init.sh` from `PROJECT_ROOT`.
8. Write `$HARNESS_WORKSPACE/progress/impl_<feature>.md`.
9. Return only a file reference.
```

## Role: reviewer

```markdown
---
name: reviewer
description: Reviews implementation against architecture, conventions, verification, and checkpoints. Does not edit code.
---

# Reviewer

1. Resolve `HARNESS_WORKSPACE`.
2. Read docs from `$HARNESS_WORKSPACE/docs/` and checkpoints from `PROJECT_ROOT`.
3. Inspect changed files and implementation report.
4. Run `./init.sh` from `PROJECT_ROOT`.
5. Write `$HARNESS_WORKSPACE/progress/review_<feature>.md` with APPROVED or CHANGES_REQUESTED.
6. Return only a file reference.
```

## init.sh Shape

```bash
#!/usr/bin/env bash
set -u
EXIT_CODE=0

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_WORKSPACE="$PROJECT_ROOT"

if [ -f "$PROJECT_ROOT/harness.config.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    HARNESS_WORKSPACE="$(jq -r '.harness_workspace // empty' "$PROJECT_ROOT/harness.config.json")"
  else
    echo "jq is required to parse harness.config.json" >&2
    EXIT_CODE=1
  fi
fi

if [ -z "${HARNESS_WORKSPACE:-}" ]; then
  echo "HARNESS_WORKSPACE could not be resolved" >&2
  EXIT_CODE=1
fi

# 1. Check required runtime tools.
# 2. Check required harness files in $HARNESS_WORKSPACE.
# 3. Parse $HARNESS_WORKSPACE/feature_list.json and enforce at most one in_progress.
# 4. Run the test command from $PROJECT_ROOT.
# 5. Exit 0 only when all checks pass.

exit $EXIT_CODE
```
