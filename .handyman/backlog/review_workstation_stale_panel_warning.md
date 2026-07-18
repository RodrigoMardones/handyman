---
feature: workstation_stale_panel_warning
status: approved
role: reviewer
updated: 2026-07-02
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/workstation_stale_panel_warning]
---

# Review: workstation_stale_panel_warning

## Verdict

APPROVED

## Checklist

- [x] PASS — BAKED_VERSION baked and compared: `handyman/scripts/workstation.py` bakes `const BAKED_VERSION = {json.dumps(version)}` into the panel JS and `render()` compares it via `state.skill_version !== BAKED_VERSION`.
- [x] PASS — Mismatch badge / clean when equal: `render()` clears the appbar `#stale` slot with `replaceChildren()` on every pass and appends the textual `badge-warn` "panel outdated — restart serve to update" only when `state.skill_version` is set and differs; when versions match nothing is appended.
- [x] PASS — Deterministic test: `tests/test_workstation.sh` W21 ("panel bakes its version and warns when the live skill differs") asserts `const BAKED_VERSION`, `!== BAKED_VERSION`, `panel outdated` and `id="stale"` in the served page — suite result: 21 run, 21 passed, 0 failed.
- [x] PASS — Green gate: `bash tests/run_tests.sh` -> ALL SUITES PASSED; verifier `./init.sh` -> "VERIFIER: all gates passed", exit code 0.

## Required Changes

None. Verifier exit code: 0.
