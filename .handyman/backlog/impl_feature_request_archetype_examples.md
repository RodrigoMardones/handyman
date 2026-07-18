---
feature: feature_request_archetype_examples
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/feature_request_archetype_examples]
---

# Implementation Report: feature_request_archetype_examples

Plan B of `docs/analisis-feature-request-md.md`.

## Files Changed

- `assets/feature-request.template.md`: replaced the single generic `## Worked example`
  (`backfill_event_attendees`, a DB-app backfill foreign to this skill repo) with a
  `## Worked examples` section holding two requests grounded in this repo's history:
  a **Research** request (mirror of feature `deterministic_actions_per_layer`) and an
  **Implementation** request (mirror of feature `backlog_generator`).

## Design Notes

- Both examples follow the CORE/OPTIONAL shape from Plan A and end Acceptance with the
  green gate. The research example uses only CORE; the implementation example adds the
  OPTIONAL `Functional check` and `Considerations` to show when extensions apply.
- The examples are real (features 20 and 21–24), so the user sees their own request style
  reflected — the point of "recommendation from experience" vs. a generic mould.
- NOTE: an external editor revert had dropped Plan A's CORE/OPTIONAL restructure from the
  file before this edit; it was re-applied and re-confirmed by reading the file back, so the
  template now carries both Plan A's structure and Plan B's examples.

## Test Output

```text
$ ./init.sh
  PASS all relative markdown links resolve
  53 run, 53 passed, 0 failed
... (14 init / 7 update / 12 feature / 7 backlog / 5 index / 10 upgrade) ...
VERIFIER: all gates passed   # EXIT 0
```
