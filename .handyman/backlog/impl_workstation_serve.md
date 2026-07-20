---
type: Implementation Log
feature: workstation_serve
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/workstation_serve]
---

# Implementation Report: workstation_serve

## Files Changed

- `handyman/scripts/workstation.py` (new): `serve` subcommand —
  ThreadingHTTPServer hard-bound to 127.0.0.1 (`--port`, 0 = ephemeral;
  `--handyman-root`; `--refresh-seconds`; `--verifier-timeout`), session token
  `secrets.token_hex(16)` printed and embedded; `GET /` serves the
  self-contained live panel (fleet table, queues, health, timeline; vanilla JS
  rendering exclusively via textContent/createElement; fetch+setInterval with
  pause and document.hidden skip; aria-live status line); `GET /api/state`
  returns ONE document via `build_state()` (snapshots + `harness_signals` +
  `read_features` per harness, fleet aggregate, timeline[:20], registry_error,
  skill_version, generated, verifier_busy). Host-header guard, JSON 404/405,
  `Cache-Control: no-store`, silenced request log.
- `tests/test_workstation.sh` (new): W1–W4 with `start_server`/`stop_server`
  (port 0, bounded readiness poll, PORT+TOKEN parsed from stdout) and an
  `http` curl helper (`--max-time 5`); wired into `tests/run_tests.sh`.

## Design Notes

- Imports fleet primitives (sibling pattern): `_snapshots`,
  `harness_signals`, `fleet_timeline`, `handyman_root`, `registry_path`,
  `_HTML_STYLE`, `run_verifier` — no parsing reimplemented.
- `do_POST` intentionally answers 405/404 only; mutation endpoints land with
  the intake feature. `MUTATION_LOCK`/`VERIFIER_BUSY` hooks are in place.

## Test Output

```text
bash tests/test_workstation.sh -> 4 run, 4 passed, 0 failed
```
