---
type: Implementation Log
feature: preflight_orchestrator
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/preflight_orchestrator]
---

# Implementation Report: preflight_orchestrator

## Files Changed

- `handyman/scripts/preflight.py` — nuevo orquestador read-only (resuelve workspace, subprocesa validate/upgrade/update/tools_discovery, reporte unificado format/drift/sync/discovery, siempre exit 0).
- `tests/test_preflight.sh` — nueva suite (5 casos) cableada como 10º suite en `tests/run_tests.sh`.
- `handyman/references/anatomy.md` — fila `scripts/preflight.py` en Optional Support Files.

## Design Notes

- Reutiliza el 100% de los scripts existentes (no reimplementa chequeos) — literatura `ponytail`: orquestar, no inventar.
- Read-only: nunca escribe; sale siempre 0. Es un *stability report*, no un *quality gate* (los bloqueantes ya viven en `validate`). Aplicar fixes queda en el operador (managed vs project-owned).
- Reusa `resolve_workspace` de `validate_harness.py` (lazy import) para una sola fuente de verdad de la resolución.
- Reporta el drift vivo (1.11.11 → 1.13.13) y la desync config↔role-files (Haiku 4.5 vs Sonnet 4.6) — los hace visibles sin bloquear.

## Test Output

```text
Preflight suite: 5 run, 5 passed, 0 failed
./init.sh exit 0 (ALL SUITES PASSED — 10 suites)
shellcheck clean en tests/test_preflight.sh
```
