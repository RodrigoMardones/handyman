---
feature: index_regen
status: approved
role: reviewer
updated: 2026-06-25
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/index_regen]
---

# Review: index_regen

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Checklist

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

## Required Changes

_None._

## Evidence (CHECKPOINTS pass)

- **C1/C4 Verifier:** `./init.sh` exits 0; Index-MOC suite 5/5; `lint: OK`; the
  T2 `all relative markdown links resolve` check passes over the regenerated
  `.handyman/index.md`.
- **Acceptance 1-2:** I1 asserts MOC frontmatter, the `project_name` title, and
  the status grouping; I2 asserts backlog reports render as `[[backlog/...]]`.
- **Acceptance 3 (Notes):** I3 replaces the Notes block and proves it survives a
  second regeneration.
- **Acceptance 4 (links):** I4 proves a missing `feature-request.md` is not
  linked while `feature_list.json` is; confirmed live by the green T2 check.
- **C3 Architecture:** reuses `resolve_workspace`; pure read of live state +
  single file write; no product code touched.
