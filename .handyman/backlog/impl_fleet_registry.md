---
feature: fleet_registry
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/fleet_registry]
---

# Implementation Report: fleet_registry

## Files Changed

- `handyman/scripts/fleet.py` (new): `register` / `unregister` / `list [--json]` /
  `discover --scan DIR [--register] [--max-depth]` over the machine-global
  registry `$HANDYMAN_ROOT/registry.json` (default `$HOME/HANDYMAN`; precedence
  `--handyman-root` flag > `HANDYMAN_ROOT` env > home).
- `handyman/assets/schemas/registry.schema.json` (new): draft-07,
  `additionalProperties:false`, entries carry only `project_root` + `registered`.
- `tests/test_fleet.sh` (new): FL1–FL7 cover the registry; wired into
  `tests/run_tests.sh`; every case under a temporary `HANDYMAN_ROOT`.

## Design Notes

- `register` refuses roots whose resolved workspace lacks `feature_list.json`
  (reuses `resolve_workspace`); re-register is idempotent; entries sorted for
  deterministic output.
- A corrupted registry degrades read commands to empty-with-NOTE but ABORTS
  write commands (never clobbers).
- `discover` prunes `node_modules`, `graphify-out`, `__pycache__`, hidden dirs.

## Test Output

```text
bash tests/test_fleet.sh -> 16 run, 16 passed, 0 failed
bash tests/run_tests.sh -> ALL SUITES PASSED (12 suites)
```
