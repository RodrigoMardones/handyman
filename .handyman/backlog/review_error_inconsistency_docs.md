---
feature: error_inconsistency_docs
status: approved
role: reviewer
updated: 2026-06-24
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/error_inconsistency_docs]
---

# Review: error_inconsistency_docs

## Acceptance Criteria

- [x] **AC1 — Research doc explains root causes of bootstrap inconsistency.**
  `docs/analisis-inconsistencia-bootstrap.md` covers all required angles: §3.1
  (SKILL.md table vs. scaffold.sh contradiction for local scope), §3.2 (duplicated
  config block in feature_list.json), §3.3 (schema not wired to live
  validate_harness.py), §3.4 (invented date fields — start_date/close_date), and
  §3.5 (bootstrap prose enabling improvisation). PASS.

- [x] **AC2 — Concrete action plan targeting `references/` and `assets/`.**
  Section 4 contains a prioritized table (A–E) with explicit file targets:
  `references/workflow.md`, `references/templates.md`, `references/anatomy.md`,
  `references/checklists.md`, `assets/feature_list.template.json`,
  `assets/init.template.sh`. Out-of-scope changes (SKILL.md, scripts/) deferred
  to future features. PASS.

- [x] **AC3 — skill-creator best practices consulted/applied.**
  Section 5 explicitly cites skill-creator principles: `scripts/` for
  deterministic tasks, principle of least surprise / single source of truth,
  executable gates over prose for format contracts, progressive disclosure.
  Applied throughout recommendations. PASS.

- [x] **AC4 — `bash tests/run_tests.sh` passes; markdown-link check green.**
  `./init.sh` exits 0. Output confirms: `PASS repo has markdown files`,
  `PASS all relative markdown links resolve`, `ALL SUITES PASSED`,
  `VERIFIER: all gates passed`. PASS.

## Factual Spot-Check

1. **Claim: `copy_and_stamp "$CONFIG_TEMPLATE" "$PROJECT_ROOT/harness.config.json"`
   is outside the local/global branch and runs for both scopes.**
   Verified in `scripts/scaffold.sh`: lines 48–54 select the template (`CONFIG_TEMPLATE`
   variable only), and line 156 runs `copy_and_stamp` unconditionally outside that
   block. Claim is ACCURATE.

2. **Claim: `scripts/validate_harness.py` does not load the JSON schema.**
   Grep for `schema`, `jsonschema` in that file returns no matches. The file only
   checks file existence, JSON parseability, ≤1 in_progress, and status enum.
   Claim is ACCURATE.

## Verifier Output

```
./init.sh exit code: 0
  PASS repo has markdown files
  PASS all relative markdown links resolve
ALL SUITES PASSED
VERIFIER: all gates passed
```

## Markdown-link Safety

The deliverable uses inline-code for all path references (no bare markdown links),
consistent with `docs/analisis-actualizacion-harness.md` and the `strip_code()`
pre-processing in `tests/test_docs.py`. No broken links introduced.

---

APPROVED
