---
type: Implementation Log
feature: workstation_verify
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/workstation_verify]
---

# Implementation Report: workstation_verify

## Files Changed

- `handyman/scripts/workstation.py`: `POST /api/verifier/run` — registered-root
  check, per-root busy set under `VERIFIER_BUSY_LOCK` (concurrent run → 409),
  synchronous `run_verifier(root, --verifier-timeout)` OUTSIDE the mutation
  lock (read-only and long; intake and GETs stay live), 200 with
  `{result: green|red|skipped|timeout, exit_code}`. `/api/state` already
  exposes `verifier_busy`. UI: per-row Verify button (disabled while busy,
  textual `running...`), session-local results rendered into the Verifier
  column.
- `tests/test_workstation.sh`: W12 (green exit 0), W13 (red exit 7 + skipped),
  W14 (busy 409 while GETs answer mid-run; poll on `verifier_busy`).

## Design Notes

- W14 initially failed on a fixture artifact: macOS `mktemp` paths
  (`/var/...`) canonicalize to `/private/var/...` inside the server, so the
  test now polls `verifier_busy` non-emptiness instead of matching path
  strings. The busy set itself worked on first try (verified manually).

## Test Output

```text
bash tests/test_workstation.sh -> 14 run, 14 passed, 0 failed
bash tests/run_tests.sh -> ALL SUITES PASSED (13 suites)
```
