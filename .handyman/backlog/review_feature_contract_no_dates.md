---
feature: feature_contract_no_dates
status: approved
role: reviewer
updated: 2026-06-24
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/feature_contract_no_dates]
---

# Review: feature_contract_no_dates (mitigation D)

Review pass performed against `CHECKPOINTS.md` (leader review pass; doc-only change, no product code).

## Acceptance Criteria

- [x] **Valid keys + no dates.** `references/anatomy.md` Feature List Contract now reads "Each feature carries exactly `id`, `name`, `title`, `description`, `acceptance`, `status`, and — only when blocked — `blocked_reason`. A feature carries **no dates**…". Matches the schema (`additionalProperties: false`). PASS.
- [x] **Chronology in `progress/`.** New rule: "A feature record is a state machine, not a timeline. Chronology lives in `progress/`…". PASS.
- [x] **Suite green.** `./init.sh` exits 0; all suites pass. PASS.
- [x] **Budgets/links intact.** SKILL 996/1000, AGENTS 249/250, "all relative markdown links resolve" PASS.

## Checkpoints

- C1/C4 Verifier exits 0 with >0 tests, all green.
- C3 Change is documentation-only and consistent with the schema contract enforced by mitigation C; no architecture impact.
- No code edited by the reviewer.

## Verdict

APPROVED -> .handyman/backlog/review_feature_contract_no_dates.md
