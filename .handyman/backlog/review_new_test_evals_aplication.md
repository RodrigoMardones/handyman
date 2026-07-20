---
type: Review Log
feature: new_test_evals_aplication
status: approved
role: reviewer
updated: 2026-06-27
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/new_test_evals_aplication]
---

# Review: new_test_evals_aplication

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Checklist

### Acceptance Criteria (Plan A-E)

- [x] **C1 — Schema & structural test:** `handyman/assets/schemas/trigger_eval.schema.json` exists, is valid draft-07 (`"$schema": "http://json-schema.org/draft-07/schema#"`), with minItems=2 and uniqueItems=true. Tests in `tests/test_docs.py::test_eval_set()` validate shipped `handyman/evals/trigger-eval.json` against it (20 items, 10 positive/10 negative, both classes >=5, no duplicates).
- [x] **C2 — validate/measure:** `handyman/scripts/evals.py validate` exits 0 on shipped set and non-zero on unbalanced/duplicate fixtures. `measure` prints NOTE on stderr and exits 0 with no runner.
- [x] **C3 — check_evals advisory:** `handyman/assets/init.template.sh::check_evals()` function defined and called in execution phase (line 191). Body contains no `EXIT_CODE=` assignment (advisory-only, never blocks).
- [x] **C4 — test_evals.sh wired:** `tests/run_tests.sh` runs `test_evals.sh` as 9th suite (line 28). All 7 cases pass: shipped set, balanced fixture, unbalanced class, duplicate query, malformed items, no-runner NOTE, runner confusion matrix.
- [x] **C5 — references/evals.md:** Exists and documented deterministic (contract) vs stochastic (measurement) boundary, variance, held-out split, graceful degradation, and the advisory. Covers `trigger-eval.json`, `evals.py`, two eval classes, `skill-creator`/`mcp-builder` literature.
- [x] **C6 — README catalog:** `handyman/references/README.md` lists `evals.md` with summary: "trigger evaluation: the deterministic eval-set contract vs the stochastic measurement, evals.py, variance and held-out splits."
- [x] **C7 — Description Trigger Gate:** `handyman/references/workflow.md` § "Description Trigger Gate" (line 92) documents re-measure step with `scripts/evals.py measure` and links `evals.md`. `handyman/references/examples.md` models both `validate` and `measure` (lines 125, 127). `handyman/assets/feature-request.template.md` Verification ties re-measurement to description edits (line 67).

### Fact-Checks (Independently Verified)

- [x] **validate contract:** Shipped eval exits 0. Unbalanced set (3 true, 0 false) exits 1 with "too few negative items: 0 < 1". Duplicate query set exits 1 with "item 1 duplicates an earlier query". ✓
- [x] **measure graceful degradation:** No runner prints NOTE "no --runner configured" on stderr and exits 0. ✓
- [x] **check_evals non-blocking:** Function body inspected (init.template.sh lines 171-191); no `EXIT_CODE=` in check_evals; only prints NOTEs and returns silently. ✓
- [x] **shellcheck clean:** `shellcheck -S warning tests/test_evals.sh` produces zero warnings. ✓
- [x] **Scope respected:** `git diff --stat` shows 7 modified files (init.template.sh, feature-request.template.md, references/*.md, run_tests.sh, test_docs.py) and 4 new files (schemas/trigger_eval.schema.json, scripts/evals.py, references/evals.md, tests/test_evals.sh). Zero changes to SKILL.md, AGENTS.template.md, or .github/. ✓

### Tests & Verifier

- [x] **All suites green:** `./init.sh` exits 0 with all 9 suites passing:
  - test_docs.py: 142 run, 142 passed (includes test_eval_set, test_evals_advisory, test_evals_reference, test_description_gate)
  - test_evals.sh: 7 run, 7 passed (shipped, balanced, unbalanced, duplicate, malformed, no-runner, runner matrix)
  - All others (init, update, feature, backlog, index, upgrade, tools_discovery): green
- [x] **CHECKPOINTS.md C1-C5 satisfied:**
  - C1: Harness complete, verifier exits 0 ✓
  - C2: Only 1 feature in_progress, current.md up-to-date ✓
  - C3: Changes match architecture (determinism boundary: contract ∈ gate, measurement ∉ gate) ✓
  - C4: New tests added and all green with > 0 suites ✓
  - C5: (Ready for closer to mark history & reset current.md) ✓

## Required Changes

_None — all acceptance criteria satisfied, all tests green, verifier exits 0._
