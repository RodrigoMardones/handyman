---
type: Implementation Log
feature: backlog_generator
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/backlog_generator]
---

# Implementation Report: backlog_generator

Plan A of `docs/analisis-acciones-deterministas-por-capa.md`. This very report
was scaffolded by the new generator (`scripts/backlog.py impl backlog_generator`)
— dogfooding the feature.

## Files Changed

- `scripts/backlog.py` (new) — generator with `impl`/`review`/`explore`
  subcommands. Reuses `resolve_workspace` from `validate_harness`, finds the
  template under `assets/backlog-<kind>.template.md`, fills `<feature_name>`/
  `<topic>` + `YYYY-MM-DD`, and writes into `$WS/backlog/` only when the file is
  absent (never overwrites project-owned content). `review --status
  changes_requested` flips the three verdict tokens (status, tag, body) so they
  stay coherent. `_safe_slug` rejects path-traversal names (e.g. `../escape`).
- `assets/backlog-explore.template.md` (new) — the missing explorer template
  (`topic`, `role: explorer`, `updated`, `tags`).
- `tests/test_backlog.sh` (new, wired into `tests/run_tests.sh`) — 7 cases:
  impl/review(approved)/review(changes_requested)/explore frontmatter, the
  no-overwrite invariant, path-traversal rejection, and the usage exit code.
- `references/anatomy.md` (Optional Support Files row), `references/templates.md`
  (generator note + `backlog/explore_<topic>.md` section), `references/workflow.md`
  (Implementer/Reviewer/Explorer protocol steps point to the generator).

## Design Notes

- Separate script (not a `feature.py` subcommand) to keep the one-script-per-
  concern shape of `scaffold`/`feature`/`validate`/`update`/`upgrade`.
- `skill-creator` pattern honored: a `scripts/` tool consuming an `assets/`
  template; the generator stamps the deterministic frontmatter, the role still
  writes the interactive body.
- No-overwrite + exit 0 makes re-runs idempotent and safe against clobbering a
  hand-written report (managed-scaffolding vs project-owned state).

## Test Output

```text
bash tests/test_backlog.sh -> 7 run, 7 passed, 0 failed
./init.sh                  -> ALL SUITES PASSED; lint: OK; EXIT=0
```
