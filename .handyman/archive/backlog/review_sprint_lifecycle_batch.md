---
type: Review Log
feature: sprint_lifecycle_batch
status: approved
role: reviewer
updated: 2026-07-15
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/sprint_lifecycle_batch]
---

# Review: sprint_lifecycle_batch

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Checklist

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

## Batch Review: Features 93-97 (Sprint Lifecycle)

### Fact-Check Results

**1. Full Test Suite** ✓
- All 12 suites passed: Doc-structure (169), Verifier (16), Updater (12), Feature-CLI (20), Backlog (7), Index-MOC (6), Upgrade (10), Tools-discovery (16), Evals (7), Preflight (8), Metrics (6), Sprint (8)
- Total: 195 test cases, ALL PASSED

**2. Verifier (./init.sh)** ✓
- Exit code: 0
- All gates passed: tools, files, state, validate, lint, build, test
- Harness is up-to-date (v1.15.15)

**3. ShellCheck** ✓
- Exit code: 0
- Zero warnings on all shell scripts in handyman/scripts and tests

**4. Feature 93 (sprint_schema)** ✓
- Schema changes validated: `sprint` key pattern `^\d{4}-SP\d+$` in feature definition
- `current_sprint` nullable in harness.config.schema.json and feature_list config
- Valid label '2026-SP1' passes; malformed 'bad-label' correctly rejected
- Templates carry `"current_sprint": null` sentinel
- test_sprint_config() test passes (part of Doc-structure suite)

**5. Feature 94 (sprint_script)** ✓
- Sprint.py functional spot-check (end-to-end in throwaway temp dir):
  - `open 2026-SP1`: stamps pending features, records current_sprint ✓
  - Feature marked done and `close` executed successfully ✓
  - Sprint doc created at `.handyman/docs/sprints/sprint.2026-SP1.md` with correct frontmatter and derived content ✓
  - Archive created at `.handyman/archive/feature_archive.json` with done feature ✓
  - current_sprint cleared (set to null) ✓
  - Done features removed from feature_list ✓
  - Carry-over sprint labels stripped (key removed, not set to null) ✓
- All 8 Sprint-lifecycle tests (S1-S8) pass: open, rejects malformed, single-sprint invariant, status, close with archive, dry-run, no-sprint error, in_progress rejection
- Test wired into tests/run_tests.sh

**6. Feature 95 (branch_provenance)** ✓
- feature.py records git branch at start in current.md (- **Branch:** line)
- Branch carried into history entry at done
- validate_harness.py check_branch_advisory prints non-blocking NOTE on foreign-branch sessions
- Tests F19/F20 in test_feature.sh cover git and non-git paths
- F18 off-by-one corrected (changed -A4 to -A5)
- T17 in test_init.sh validates advisory NOTE behavior

**7. Feature 96 (docs_sprint_split)** ✓
- scaffold.sh creates docs/current/ and docs/sprints/ directories
- index_md.py lists them as wikilinks (existence-gated)
- T18 test in test_init.sh covers scaffold path creation
- I6 test in test_index.sh covers MOC wikilinks generation

**8. Feature 97 (sprint_workflow_reference)** ✓
- workflow.md: Stage 7 row present (Period close | scripts/sprint.py close)
- workflow.md: Sprint Protocol section present with multi-branch Startup paragraph
- anatomy.md: Support-file rows for sprint.py and sprint.template.md documented
- anatomy.md: sprint label referenced in Feature List Contract context
- checklists.md: Sprint-Close Checklist present
- Doc-only changes validated by existing test suites

**9. Token Budgets** ✓
- SKILL.md: 998 words (limit: 1000) ✓
- AGENTS.template.md: 249 words (limit: 250) ✓

**10. Architecture and Conventions** ✓
- All changes follow harness architecture (deterministic scripts, templates via scaffold.sh, state in disk)
- No debug prints, no TODOs without context
- Per-role tools and minimal privilege maintained
- Data-not-instructions boundary respected in all references
- No agent-as-ingestor construction in any file

## Required Changes

None. All features integrated successfully. Batch approval.
