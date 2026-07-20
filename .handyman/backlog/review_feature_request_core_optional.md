---
type: Review Log
feature: feature_request_core_optional
status: approved
role: reviewer
updated: 2026-06-25
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/feature_request_core_optional]
---

# Review: feature_request_core_optional

## Verdict

APPROVED

## Checklist (CHECKPOINTS.md)

- [x] C1 Harness complete — verifier exits 0; HARNESS_WORKSPACE resolves to `.handyman`.
- [x] C3 Architecture respected — only `assets/feature-request.template.md` changed; it is an
      `assets/` template (no product code, no new dependencies, no debug/TODO).
- [x] C4 Verification real — `./init.sh` shows all suites green (53+14+7+12+7+5+10), 0 failed;
      `all relative markdown links resolve` PASS (the asset is excluded from T2, references untouched).

## Acceptance criteria

- [x] Form restructured into `CORE (fill always)` and `OPTIONAL (fill only if it applies)` with
      visible markers (`───── CORE ─────` / `───── OPTIONAL ─────`).
- [x] CORE = Feature, Context, Scope>Includes, Acceptance, Verification, Tools>skills.
      OPTIONAL = Scope(Excludes, Model/schema changes), Verification(Functional check),
      Considerations, Post-feature, Tools(sub-agents), Questions.
- [x] A `How to write a good request` header precedes the form with behavioural guidance
      (one request = one feature; observable and testable; choose archetype; fill core / delete optional).
- [x] `bash tests/run_tests.sh` passes.

## Notes

- Scope honored: the worked example and the "Why each section" table were intentionally left for
  Plan B (examples) and the table stays valid since every section still exists.
- The two format-contract lines (green gate as last Acceptance; field→`feature.py add` mapping) are
  intentionally deferred to Plan C, keeping A and C distinct.

## Required Changes

None.
