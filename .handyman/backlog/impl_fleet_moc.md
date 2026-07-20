---
type: Implementation Log
feature: fleet_moc
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/fleet_moc]
---

# Implementation Report: fleet_moc

## Files Changed

- `handyman/scripts/fleet.py`: `moc` + `build_fleet_moc()` — regenerates
  `$HANDYMAN_ROOT/index.md` with frontmatter `tags: [handyman/fleet]`, a
  Registry block, one section per harness (version line, status counts, live
  session, last closure, `open:` links) and the operator `## Notes` block
  preserved via `index_md._preserved_notes` (shared, not duplicated).
- `tests/test_fleet.sh`: FL15–FL16 (generation + Notes preservation across
  regenerations; empty-registry degradation for list/status/health/moc).

## Design Notes

- Absolute markdown links, emitted only for files that exist on disk — local
  workspaces live outside the vault root, so wikilinks would not resolve.
- The fleet MOC is the vault view: opening `$HOME/HANDYMAN` in Obsidian shows
  registry + fleet index in one navigable place (the usability decision that
  fixed the registry location).

## Test Output

```text
bash tests/test_fleet.sh -> 16 run, 16 passed, 0 failed
bash tests/run_tests.sh -> ALL SUITES PASSED (12 suites)
```
