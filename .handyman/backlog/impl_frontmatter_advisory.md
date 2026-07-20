---
type: Implementation Log
feature: frontmatter_advisory
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/frontmatter_advisory]
---

# Implementation Report: frontmatter_advisory

Plan E of `docs/analisis-acciones-deterministas-por-capa.md` — the enforcement
capstone for the deterministic-actions plan. Reports scaffolded with
`scripts/backlog.py`; progress recorded with `feature.py log`/`next`.

## Files Changed

- `scripts/validate_harness.py` — new non-blocking `check_frontmatter_advisory()`
  (+ `_frontmatter_keys()` helper and `FRONTMATTER_REQUIRED` map). It scans
  `progress/current.md` and `backlog/impl_*/review_*/explore_*` and prints a
  `NOTE:` when a report is missing required keys for its type or the `#handyman/`
  tag namespace. Wired into `main()` after `validate()`; it never touches the
  gap list, so the exit code is unchanged. Empty placeholder files are skipped.
- `tests/test_init.sh` — T15 (incomplete report -> NOTE, exit still 0) and T16
  (well-formed report -> silent); suite 12 -> 14.
- `references/anatomy.md` (Verification Contract item 8) and
  `references/checklists.md` (Analysis Checklist item + Common Risks row).

## Design Notes

- Advisory, not a gate: closes root cause 4.4 ("contract without enforcement")
  by *surfacing* drift without blocking, mirroring the existing init.sh
  advisories (graphify / version / business-context).
- Lenient by design: checks key presence and the `handyman/` namespace, not exact
  values, and skips empty files — so it is silent on the repo's own harness
  (verified: 0 NOTEs) and on minimal fixtures, and only speaks on real drift.
- Pairs with Feature A: `scripts/backlog.py` *prevents* the drift this advisory
  *detects*.

## Test Output

```text
bash tests/test_init.sh -> 14 run, 14 passed, 0 failed
./init.sh               -> ALL SUITES PASSED; lint: OK; 0 NOTEs on repo; EXIT=0
```
