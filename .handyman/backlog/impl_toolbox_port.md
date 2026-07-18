---
feature: toolbox_port
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_port]
---

# Implementation Report: toolbox_port

## Files Changed

- `handyman/src/toolbox.ts` (new): TypeScript port of the legacy
  `scripts/fleet.py` (recovered from git `0111090`), renamed toolBox.
  Subcommands: register/unregister/list/discover/status/health/heartbeat/
  timeline/moc (+ `--html`). Registry stays at `$HANDYMAN_ROOT/registry.json`
  (default `$HOME/HANDYMAN`) storing only `project_root` + date; every other
  fact reads live per query. Design tokens (`--hw-*`), dark-mode layering and
  the WCAG notes ported verbatim from the legacy `_HTML_STYLE`.
- `handyman/src/metrics.ts`: exported `collect`, `historyClosures` and their
  types (toolbox composes them; no parsing reimplemented).
- `handyman/src/index_md.ts`: exported `preservedNotes`, `NOTES_HEADING`
  (MOC `## Notes` preservation).
- `handyman/src/upgrade_harness.ts`: exported `parseVersion`,
  `currentSkillVersion`, `readInstalledVersion`, `SemVer` (version drift).
- `handyman/assets/schemas/registry.schema.json` (restored from git history,
  retitled toolBox).
- `tests/test_toolbox.sh` (new): 23-case port of the legacy `test_fleet.sh`
  (python3 → node, jsonschema → ajv); wired into `tests/run_tests.sh`.

## Design Notes

- Naming: user decision — the fleet domain is now **toolBox** (`toolbox.js`,
  MOC tag `handyman/toolbox`, "Handyman ToolBox" pages). Disk layout is
  unchanged so the existing `$HOME/HANDYMAN` registry/events keep working.
- `spawnSync` timeout reports both the `ETIMEDOUT` error and the
  SIGTERM+null-status shape as `timeout` (macOS delivers the latter).
- `serve` is reserved and stubbed; it lands with `toolbox_observer` (16).

## Test Output

```text
bash tests/test_toolbox.sh -> Summary: 23 run, 23 passed, 0 failed
npm run build -> clean
```
