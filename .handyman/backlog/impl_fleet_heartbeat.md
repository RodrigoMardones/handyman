---
feature: fleet_heartbeat
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/fleet_heartbeat]
---

# Implementation Report: fleet_heartbeat

## Files Changed

- `handyman/scripts/fleet.py`: `heartbeat [--root] [--feature] [--date]`
  appends `{project_root, project_name, feature, date}` to
  `$HANDYMAN_ROOT/events.jsonl`; without `--feature` it reports the NEWEST
  dated heading of `history.md` (append-only ⇒ last entry) — exactly what
  `feature.py done` just wrote, making it a drop-in `post_run` hook.
  `fleet_timeline()` now merges events with history, history winning on
  (project_root, feature, date) collisions; event-only entries render as
  `(heartbeat)`.
- `harness.config.json` (this repo): heartbeat added to `post_run` (dogfood —
  every closure from now on pushes its event).
- `handyman/references/fleet.md`: heartbeat/timeline rows in the subcommand
  table + "Heartbeat as a post_run Hook" section with the target-repo path
  pattern; Future Work pruned accordingly.
- `tests/test_fleet.sh`: FL19–FL20.

## Design Notes

- Events are JSONL (append-only, like history.md) — no schema churn on
  registry.json; malformed lines are skipped on read.
- A failing hook never blocks a verified closure (`feature.py done` post_run
  contract from feature 44).

## Test Output

```text
bash tests/test_fleet.sh -> 20 run, 20 passed, 0 failed
```
