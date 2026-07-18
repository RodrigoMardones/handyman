---
feature: post_run_hooks
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/post_run_hooks]
---

# Implementation Report: post_run_hooks

## Files Changed

- `handyman/assets/schemas/harness.config.schema.json` — `post_run` opcional (array de strings, `uniqueItems`) vía nueva definición `command_list`.
- `handyman/assets/schemas/feature_list.schema.json` — `post_run` en la definición `config` + nueva definición `command_list`.
- `handyman/assets/harness.config.local.template.json`, `harness.config.global.template.json`, `feature_list.template.json` — sentinel `"post_run": []`.
- `handyman/scripts/feature.py` — `_read_post_run(root)` (prefiere harness.config.json, fallback feature_list config) + `run_post_run(root)` (ejecuta cada comando tras el close; exit 0 siempre; paso que falla solo WARNs); invocado en `cmd_done` tras marcar done+history.
- `tests/test_feature.sh` — F13/F14/F15 (post_run ok, post_run que falla -> WARN + exit 0, sin post_run = close normal).
- `handyman/references/anatomy.md` + `references/templates.md` — documentación del bloque `post_run`.

## Design Notes

- El hook es **opt-in**: sin `post_run` declarado, el cierre es idéntico al de hoy.
- **Siempre exit 0**: un paso custom que falla solo emite `post_run WARN` a stderr; nunca revierte un cierre que ya pasó el verifier (el hook corre *después* del close).
- `shell=True` es intencional: post_run son comandos shell declarados por el operador del harness (datos del config, no entrada externa no confiable); el operador controla el config.

## Test Output

```text
Feature-CLI suite: 15 run, 15 passed (3 nuevas post_run)
./init.sh exit 0 (ALL SUITES PASSED — templates validan contra schemas con post_run)
```
