---
type: Implementation Log
feature: fleet_run_verifier
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/fleet_run_verifier]
---

# Implementation Report: fleet_run_verifier

## Files Changed

- `handyman/scripts/fleet.py`: `run_verifier()` + `status --run-verifier
  [--verifier-timeout S]` — executes each readable harness's own `init.sh`
  (cwd = its root, stdout/stderr discarded, only the exit code observed) and
  reports `green (exit 0)` / `red (exit N)` / `skipped (no executable
  init.sh)` / `timeout`; field also present in `--json`.
- `handyman/references/fleet.md`: subcommand row + philosophy bullet updated
  ("no foreign verifier runs **by default**").
- `tests/test_fleet.sh`: FL21 (green/red/skipped + flag-off silence),
  FL22 (timeout via `--verifier-timeout 1`).

## Design Notes

- `status` keeps its exit-0 observe contract even with red verifiers; gating
  a fleet on verifier state stays an operator decision (health --strict is
  the gate, and it does not include verifier runs).
- `TimeoutExpired`/`OSError` degrade to `timeout`/`skipped` — a hung or
  broken foreign verifier can never crash the fleet report.

## Test Output

```text
bash tests/test_fleet.sh -> 22 run, 22 passed, 0 failed
```
