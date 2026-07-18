---
feature: config_source_of_truth
status: approved
role: reviewer
updated: 2026-06-24
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/config_source_of_truth]
---

# Review: config_source_of_truth (mitigation B)

Review pass against `CHECKPOINTS.md` (leader review pass; doc-only change).

## Acceptance Criteria

- [x] **Canonical + mirror.** `references/anatomy.md` Required Core Files row now reads "Canonical bridge file … The `config` block in `feature_list.json` mirrors it"; Feature List Contract bullet calls the block "an optional **mirror** of `harness.config.json` (the canonical bridge file)". PASS.
- [x] **Precedence documented.** Bullet states resolution prefers `harness.config.json`, then `config`, then `.handyman/`, then legacy `PROJECT_ROOT`, matching `validate_harness.py`'s `resolve_workspace`. PASS.
- [x] **Suite green.** `./init.sh` exits 0; all suites pass. PASS.
- [x] **Budgets/links intact.** "all relative markdown links resolve" PASS. PASS.

## Checkpoints

- C1/C4 verifier exits 0, all green. C3 doc-only; the mirror is retained deliberately so `scaffold.sh` stamping and test T12 keep working. Reviewer edited no code.

## Verdict

APPROVED -> .handyman/backlog/review_config_source_of_truth.md
