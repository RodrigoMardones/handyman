---
feature: validate_harness
status: done
role: implementer
updated: 2026-06-17
tags: [handyman/feature/done, handyman/role/implementer]
---

# Implementation Report — validate_harness

Deterministic structure validator that turns the manual *Analysis Checklist*
into reproducible, testable checks, fulfilling the contract already promised in
`references/anatomy.md` (Optional Support Files → `scripts/validate_harness.*`).

## Changes

- **`scripts/validate_harness.py`** (new): resolves `HARNESS_WORKSPACE`
  (config.json → feature_list config → `.handyman/` → legacy root), checks the
  required core files, parses `feature_list.json`, enforces the ≤1 `in_progress`
  invariant, validates feature statuses, and flags any `*.agent.md` role file
  living inside the workspace (must be in `.github/agents/` or `.claude/agents/`).
  CLI `--root <path>`; exit 0 when well-formed, exit 1 with a gap report otherwise.
- **`init.sh`**: added `check_structure()` and wired it as a blocking
  `run_phase "validate"` gate (after `state`, before `lint`); requires `python3`.
- **`tests/test_init.sh`**: added T8–T11 invoking the validator directly against
  fixture workspaces (well-formed pass, missing core file, >1 in_progress, stray
  role file).

## Acceptance evidence

| Criterion | Result |
|-----------|--------|
| exits 0 on a well-formed local harness | PASS (T8 + `./init.sh` validate gate) |
| exits non-zero + gap report on missing required file | PASS (T9) |
| exits non-zero when >1 in_progress | PASS (T10) |
| `init.sh` calls validate_harness as blocking `run_phase` | PASS (`==> validate` → `validate: OK`) |
| `tests/test_init.sh` gains validate_harness case(s) | PASS (T8–T11) |
| `bash tests/run_tests.sh` passes | PASS (26 + 9 + 7 = all suites green) |

## Notes

- Pre-existing shellcheck warnings in `init.sh` (SC2043 line 53, SC2038 line 97)
  are untouched and out of the lint/CI scope (`run_lint` covers only
  `scripts/` + `tests/` `.sh` files).
- `init.template.sh` and `tests/fixtures/init.reference.sh` were intentionally
  left unchanged: the validator is an *optional* support script and scaffolded
  harnesses do not receive `scripts/validate_harness.py`.

done -> backlog/impl_validate_harness.md
