---
feature: fleet_health
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/fleet_health]
---

# Implementation Report: fleet_health

## Files Changed

- `handyman/scripts/fleet.py`: `health [--json] [--strict] [--stale-days N]
  [--idle-days N] [--today D]` + `harness_signals()` deriving INVARIANT
  (>1 in_progress), STALE_WIP (in_progress with `updated` older than the window
  or unparseable), BEHIND (unsealed or older than the skill version), IDLE
  (pending queue with stale/no closures) and UNREADABLE (unresolvable root).
- `tests/test_fleet.sh`: FL11–FL14 (each signal with dedicated fixtures,
  `--today` determinism, `--strict` both ways).

## Design Notes

- Signals are information, not verdicts: default exit stays 0; `--strict`
  (exit 1 on ≥1 signal) is the opt-in gate for operator cron/CI.
- `--today` mirrors `feature.py done --date`: date-relative rules become
  reproducible in tests and replays.
- An unreadable harness short-circuits to UNREADABLE only (no noise from
  derived rules over missing data).

## Test Output

```text
bash tests/test_fleet.sh -> 16 run, 16 passed, 0 failed
bash tests/run_tests.sh -> ALL SUITES PASSED (12 suites)
```
