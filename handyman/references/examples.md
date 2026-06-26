# Harness Examples

Concrete, end-to-end walkthroughs of the two most common Handyman tasks: bootstrapping a harness and running one feature through its lifecycle. They show what the user says, what the leader does, how state files change on disk, and what references the subagents return.

The examples use a small fictional repo, `notes-cli`, a Python notes app with `pytest`. Paths assume a `local` install, so `HARNESS_WORKSPACE` is `PROJECT_ROOT/.handyman`. For a `global` install, replace `.handyman` with `$HOME/HANDYMAN/notes-cli`; the flow is identical.

Read this alongside [workflow.md](./workflow.md) for the full protocols and [templates.md](./templates.md) for the starter files referenced here.

## Example 1: Bootstrap A Local Harness

**Input** (what the user says):

> Bootstrap a local Handyman harness in this repo. It's a Python notes CLI with pytest.

**Leader steps:**

1. Confirm scope (`local`) and that existing files may not be overwritten without asking.
2. Run the scaffold to create the directory skeleton and copy templates:

   ```bash
   ./scripts/scaffold.sh local .
   ```

3. Fill the copied templates with project-specific content instead of generic placeholders:
   - `.handyman/docs/business.md`: the domain and use cases the notes CLI serves.
   - `.handyman/docs/architecture.md`: the CLI's module boundaries.
   - `.handyman/docs/conventions.md`: Python style, `pytest` layout, error policy.
   - `.handyman/docs/verification.md`: `pytest -q` as the test gate.
4. Replace the `run_lint`, `run_build`, and `run_test` placeholders in `init.sh` with the real commands (`ruff check .`, a no-op build, `pytest -q`).
5. Seed `.handyman/feature_list.json` with at least one concrete feature.
6. Materialize role files in the platform-discoverable path, never under `.handyman/`:
   `.github/agents/leader.agent.md`, `implementer.agent.md`, `reviewer.agent.md`.
7. Run `./init.sh` and confirm it fails only on the not-yet-implemented feature gates, not on missing structure.

**Output** (resulting tree):

```text
notes-cli/
├── AGENTS.md                      # bridge file (repo root)
├── CHECKPOINTS.md                 # bridge file (repo root)
├── init.sh                        # verifier (repo root)
├── harness.config.json            # records install_mode + harness_workspace
├── .github/agents/                # discoverable role files, NOT in .handyman/
│   ├── leader.agent.md
│   ├── implementer.agent.md
│   └── reviewer.agent.md
├── .handyman/                     # mutable harness state
│   ├── feature_list.json
│   ├── progress/
│   │   ├── current.md
│   │   └── history.md
│   ├── backlog/                   # task-detail reports land here
│   ├── docs/
│   │   ├── architecture.md
│   │   ├── business.md
│   │   ├── conventions.md
│   │   └── verification.md
│   └── index.md                   # optional Obsidian MOC
└── src/ tests/                    # product code (unchanged)
```

`.handyman/feature_list.json` after seeding one feature:

```json
{
  "project": "notes-cli",
  "description": "A small notes CLI.",
  "config": {
    "install_mode": "local",
    "project_name": "notes-cli",
    "project_root": ".",
    "handyman_root": null,
    "harness_workspace": ".handyman"
  },
  "rules": {
    "one_feature_at_a_time": true,
    "require_tests_to_close": true,
    "valid_status": ["pending", "in_progress", "done", "blocked"]
  },
  "features": [
    {
      "id": 1,
      "name": "cli_recent",
      "title": "List recent notes",
      "description": "Add a `recent` subcommand that prints the N most recent notes.",
      "acceptance": [
        "`notes recent --limit 5` prints the 5 newest notes, newest first",
        "Tests cover the default limit, a custom limit, and an empty store"
      ],
      "status": "pending"
    }
  ]
}
```

## Example 2: Run One Feature

**Form-first intake (optional).** When the user has not framed the request, offer the
`feature-request.md` form. The user fills the **CORE** (and any **OPTIONAL** sections that
apply); the leader then turns the filled form into a feature entry with `scripts/feature.py add`,
which writes only the contract keys (`name`, `title`, `description`, `acceptance`) — never the
process-guidance sections (`Verification`, `Considerations`, `Tools`, `Post-feature`):

```text
$ python scripts/feature.py add --name cli_recent \
    --title "Recent notes command" \
    --description "Add a recent subcommand listing the latest notes." \
    --acceptance "recent lists the latest N notes (default 10)" \
    --acceptance "tests cover default, custom --limit, and empty store" \
    --acceptance "bash tests/run_tests.sh passes"
added feature 7 'cli_recent' (pending)
```

This seeds the `cli_recent` feature used below. If the feature is already in `feature_list.json`,
skip straight to running it. The `Tools > skills` a request lists should come from the skills the
harness declares under `discovery.skills`; the leader confirms they are installed with
`scripts/tools_discovery.py check` (see `discovery.md`).

**Input** (what the user says):

> Run the next pending feature.

**Leader steps and disk changes:**

1. Run `./init.sh` to confirm a green baseline (or document the blocker).
2. Resolve `HARNESS_WORKSPACE` to `.handyman` and pick the lowest-id `pending` feature: `cli_recent`.
3. Flip exactly that feature to `in_progress` in `feature_list.json` and update `progress/current.md`:

   ```markdown
   ---
   feature: cli_recent
   status: in_progress
   role: implementer
   updated: 2026-06-04
   tags: [handyman/session/current, handyman/feature/cli_recent]
   ---

   # Current Session

   - **Feature in progress:** cli_recent
   - **Start:** 2026-06-04 10:00
   - **Agent:** implementer

   ## Plan
   - Add `recent` subcommand parsing `--limit` (default 10).
   - Sort notes by timestamp descending.
   - Add tests for default, custom limit, and empty store.

   ## Log
   - ...

   ## Next Step
   - Implement the command, then run the verifier.
   ```

4. **Delegate to the implementer.** It writes code and tests, runs `./init.sh` until green, writes `.handyman/backlog/impl_cli_recent.md`, and returns only a reference:

   ```text
   done -> .handyman/backlog/impl_cli_recent.md
   ```

5. **Delegate to the reviewer.** It reads the report, the docs, and `CHECKPOINTS.md`, runs the verifier, writes `.handyman/backlog/review_cli_recent.md`, and returns only a verdict reference:

   ```text
   APPROVED -> .handyman/backlog/review_cli_recent.md
   ```

6. **Close the feature** only after approval and a green verifier:
   - Mark `cli_recent` as `done` in `feature_list.json`.
   - Append a closing entry to `progress/history.md` (files changed, verifier result, review result).
   - Reset `progress/current.md` to the idle template.
   - Run `./init.sh` one last time.

**Output** (the implementer report `.handyman/backlog/impl_cli_recent.md`):

```markdown
---
feature: cli_recent
status: implemented
role: implementer
updated: 2026-06-04
tags: [handyman/role/implementer, handyman/feature/cli_recent]
---

# Implementation Report: cli_recent

## Files Changed
- `src/notes/cli.py`: added the `recent` subcommand.
- `tests/test_recent.py`: default limit, custom limit, empty store.

## Design Notes
- Reused the existing store loader; sorting by `created_at` descending.

## Test Output

```text
VERIFIER: all gates passed
```
```

## Anti-Telephone Reminder

In both examples the subagents never paste diffs, full reports, or long research into chat. They write artifacts to `.handyman/backlog/` and return one short reference line. The leader reads those files only when it needs to audit or continue. See the Anti Telephone Protocol in [anatomy.md](./anatomy.md).
