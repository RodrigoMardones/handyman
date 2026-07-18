---
feature: tools_discovery_script
status: approved
role: reviewer
updated: 2026-06-26
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/tools_discovery_script]
---

# Review: tools_discovery_script

## Criterion Verdicts

### 1. `tools_discovery.py list` scans skill roots and lists name+description
**PASS** — Verified:
- `list` command enumerates all installed skills from $HANDYMAN_SKILL_ROOTS (or ~/.agents/skills, ~/.claude/skills)
- Each skill prints as `name<TAB>description`
- Test T1 passes; exit code 0
- Real execution: 23 skills discovered and printed

### 2. `find <keyword>` deterministically filters skills (case-insensitive)
**PASS** — Verified:
- Case-insensitive substring matching on skill name and description
- Test T3 passes; filters correctly by keyword "FIRST" to return only matching skills
- Real execution: `find mcp` returns only mcp-builder (no unrelated skills); exit code 0

### 3. `check` verifies declared skills and exits non-zero if missing
**PASS** — Verified:
- Declared-missing scenario: declared skill "gamma" not on disk → exit 1, output lists "gamma: MISSING"
- Declared-present scenario: all declared skills on disk → exit 0, output: "skill alpha: ok"
- No discovery block scenario: no discovery key in config → exit 0, output: "nothing to verify"
- Tests T4, T5, T6 all pass
- Declared MCPs validated by shape only (documented as limitation)

### 4. Test suite `tests/test_tools_discovery.sh` covers all operations
**PASS** — Verified:
- 6 tests covering list, find, check (present/missing/no-block): T1–T6
- All 6 tests passing in verifier output
- Suite wired into `tests/run_tests.sh` (line 28)
- Shellcheck: no warnings (clean shell code)

### 5. `bash tests/run_tests.sh` passes
**PASS** — Verified:
- Full verifier run: **ALL SUITES PASSED**
- Tools-discovery suite: 6/6 tests passing
- Verifier gates: all green

## Code Quality

### Reuse of `resolve_workspace`
✓ Script imports `resolve_workspace` from validate_harness (line 42)
✓ Used in `read_discovery()` to follow documented precedence (harness.config.json → feature_list.json → .handyman fallback)
✓ No duplication; proper reuse of common utility

### Security (path-traversal, injection)
✓ `check` reads only JSON (parsed via json.loads) and globs `*/SKILL.md` (no dynamic path expansion)
✓ Frontmatter parser uses strict regex `^([A-Za-z0-9_-]+)` to extract field names (no special chars)
✓ YAML block scalars (`>`, `|`, etc.) explicitly detected and value set to empty string (line 89–90), preventing leakage of `>` character

### Graceful degradation
✓ `skill_roots()` silently skips missing directories (line 66: `if path.is_dir()`)
✓ `_parse_frontmatter()` returns empty dict on OSError or missing fence (lines 77–79)
✓ JSON parsing wrapped in try/except (lines 128, 139)

## Functional Test Results

### Functional Check (a): `find mcp` determinism
**Result:** exit 0, output: only mcp-builder with full description
**Verdict:** ✓ Correct

### Functional Check (b): `check` with missing/present/no-block
**Result (missing):** exit 1, output names "gamma: MISSING"
**Result (present):** exit 0, output: "skill alpha: ok"
**Result (no-block):** exit 0, output: "nothing to verify"
**Verdict:** ✓ All scenarios correct

### Functional Check (c): `list --json` valid JSON
**Result:** Valid JSON, 23 skills, proper structure (name, description, path)
**Verdict:** ✓ Valid JSON emitted

## Verifier & Linting

- Verifier: **ALL SUITES PASSED** (init.sh full run)
  - Tools-discovery suite: Summary: 6 run, 6 passed, 0 failed
- Shellcheck on test_tools_discovery.sh: **no warnings**
- Python syntax: valid (no parse errors observed)

## Summary

Feature 34 `tools_discovery_script` is **APPROVED**.

All 5 acceptance criteria met. All 6 tests green. Code quality verified: no duplication, graceful degradation, no injection risks, YAML block scalars handled correctly. Verifier gates passed. Shellcheck clean.

APPROVED
