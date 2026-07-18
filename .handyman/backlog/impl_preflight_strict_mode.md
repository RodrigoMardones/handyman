---
feature: preflight_strict_mode
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/preflight_strict_mode]
---

# Implementation Report: preflight_strict_mode

## Files Changed

- `handyman/scripts/preflight.py` — `preflight(root, strict=False)` collects `problems` (drift rc!=0 → "drift BEHIND", sync rc!=0 → "sync DRIFT", discovery rc!=0 → "discovery MISSING"); with `--strict` and problems → prints `STRICT failure (...)` and returns 1, else the stable line. Format stays OUT of strict (already blocking in the verifier's validate phase — no double gate). Docstring: --strict semantics + exit codes; also fixed the stale `update_harness.py --list` line (code moved to `--check` in a previous session, header never updated).
- `tests/test_preflight.sh` — +T6 (strict stable → 0), +T7 (strict on BEHIND → !=0 naming drift), +T8 (strict on declared-missing skill → !=0 naming discovery); 5→8.

## Design Notes

- Plan C of `docs/analisis-workflow-etapas.md`: opt-in CI gating; default stays the documented always-exit-0 advisory (T1–T5 unchanged and green — regression proof).
- Dogfood: live `--strict` correctly gated on the real pre-existing drift (1.13.13 vs 1.14.15); cured it the way the workflow prescribes — `upgrade_harness.py --root .` re-sealed (backup in `.handyman/.upgrade-backups/20260701-172717`), synced the `feature_list.json` config mirror, live strict now exit 0.

## Test Output

```text
test_preflight.sh: 8 run, 8 passed, 0 failed
shellcheck clean; py_compile OK
live: preflight --strict -> exit 0 (strict; stable)
./init.sh -> EXIT=0
```
