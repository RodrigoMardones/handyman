---
type: Implementation Log
feature: unattended_loop_contract
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/unattended_loop_contract]
---

# Implementation Report: unattended_loop_contract

## Files Changed

- `handyman/references/workflow.md` (nueva `## Unattended Loop` tras Closure: contrato work-detection/one-feature/verifier-gate/stop-conditions + fence while-ready + regla no-runner; Stability check ahora "six controls" con bullet **Worklist**)
- `handyman/scripts/preflight.py` (5o bloque `worklist` reusa `feature.py ready` por subprocess; NOTE + "loop stop condition" cuando exit 3; NUNCA entra en strict problems; docstring actualizado)
- `tests/test_preflight.sh` (T9 worklist OK con feature ready bajo --strict, T10 drenado NOTE + stop condition + exit 0 bajo --strict)
- `tests/test_docs.py` (`test_unattended_loop_reference`: seccion + tokens + worklist en preflight)

## Design Notes

- El loop es un CONTRATO, no un runner (tesis 3 del research doc): handyman aporta exit codes con significado (ready 0=trabajo/3=drenado, implementados en feature A) y el runner externo es un while de shell del operador.
- worklist es advisory puro: un backlog drenado es stop signal, no inestabilidad -> fuera de strict (T9/T10 lo prueban CON --strict activo).
- El fixture de preflight ya tenia features vacias -> T10 usa el fixture tal cual (drenado natural); T9 inyecta una pending.
- W011: redaccion pasiva ("an external runner can chain sessions"), sin rol-como-sujeto leyendo contenido untrusted.

## Test Output

```text
test_preflight.sh: 10 run, 10 passed / test_docs.py: 186 run, 186 passed
shellcheck clean / ./init.sh EXIT=0
```
