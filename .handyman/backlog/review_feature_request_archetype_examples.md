---
feature: feature_request_archetype_examples
status: approved
role: reviewer
updated: 2026-06-25
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/feature_request_archetype_examples]
---

# Review: feature_request_archetype_examples

## Verdict

APPROVED

## Checklist (CHECKPOINTS.md)

- [x] C1 Harness complete — verifier exits 0.
- [x] C3 Architecture respected — only `assets/feature-request.template.md` changed (a template).
- [x] C4 Verification real — all suites green (53+14+7+12+7+5+10), 0 failed; links resolve.

## Acceptance criteria

- [x] Two worked examples present: a Research request and an Implementation request, taken
      from real repo features (`deterministic_actions_per_layer`, `backlog_generator`).
- [x] The generic `backfill_event_attendees` example no longer appears (grep count 0).
- [x] Both examples respect the form structure and end Acceptance with the green gate.
- [x] `bash tests/run_tests.sh` passes.

## Notes

- Verified persistence by reading the file back after editing (an earlier external revert had
  dropped Plan A's restructure; it was restored, and both A and B now coexist in the file).

## Required Changes

None.
