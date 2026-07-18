---
feature: fleet_timeline
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/fleet_timeline]
---

# Implementation Report: fleet_timeline

## Files Changed

- `handyman/scripts/fleet.py`: `timeline [--json] [--limit N]` +
  `fleet_timeline()` — merges the dated closure headings of every readable
  harness's `progress/history.md` (via `metrics.history_closures`) into one
  chronology, newest first, tagged with `project_name`/`feature`/`feature_id`.
- `tests/test_fleet.sh`: FL17–FL18 (two-harness merge with descending order;
  `--limit`/`--json` contract including `total` vs sliced `entries`).

## Design Notes

- Pull-only: no new state anywhere; unreadable harnesses are skipped by the
  same degradation rule the other subcommands use.
- Every entry carries `source: "history"` — the field the heartbeat feature
  (67) will use to merge pushed events without ambiguity.
- Sort key `(date, project_name, feature_id)` keeps same-day entries stable
  and deterministic.

## Test Output

```text
bash tests/test_fleet.sh -> 18 run, 18 passed, 0 failed
```
