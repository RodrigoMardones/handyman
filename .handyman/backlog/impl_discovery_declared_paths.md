---
type: Implementation Log
feature: discovery_declared_paths
status: implemented
role: implementer
updated: 2026-07-21
tags: [handyman/role/implementer, handyman/feature/discovery_declared_paths]
---

# Implementation Report: discovery_declared_paths

F2 del rework de capas ([[explore_reorganizacion_capas]]), **renegociada** al
descubrir que el objetivo original ya estaba resuelto — la aceptación se
reescribió con `feature acceptance` antes de implementar (queda auditado en el
state machine).

## Renegociación (por qué NO se hizo lo planeado)

1. **`discovery` con `{name, path}` persistidos — descartado.** `tools_discovery
  check` ya materializa la relación declaración → ubicación: resuelve e imprime
  el path de cada skill y agent declarado y valida MCPs contra
  `.vscode/mcp.json`. El header del propio módulo documenta la decisión de
  diseño: *"The contract declares names (portable); check resolves and prints
  the path (machine-specific) as a direct reference — it is never persisted"*.
  Persistir paths rompería portabilidad para resolver un problema ya resuelto.
2. **`models` default+overrides — descartado.** El único consumidor es
  `update_harness` (sync config ↔ role files); el bloque de 4 claves funciona y
  cuesta 6 líneas de JSON. Cambiar schema + sync + tests para ahorrar 3 líneas
  es ceremonia con ROI negativo. Queda como está.

El gap real del reclamo original ("no relaciona el uso") era de **señal**: ~30
NOTEs de "installed but not declared" generados por las skills globales del
usuario enterraban el reporte de discovery en cada preflight.

## Files Changed

- `handyman/src/tools_discovery.ts` — `check` emite el NOTE de no-declarada
  solo para skills instaladas bajo roots **locales del proyecto**
  (`<root>/.agents/skills` etc.); las de roots globales (`~/...`,
  `$HANDYMAN_SKILL_ROOTS`) son toolbox personal, no contrato del repo, y salen
  del reporte. `--skills-dir` (override hermético) conserva el reporte
  completo. Las declaradas siguen resolviéndose desde cualquier root.
- `tests/test_tools_discovery.sh` — T15: local no declarada → NOTE; global no
  declarada → silenciosa; declarada global sigue `ok` con path. 17/17.

## Resultado en vivo

NOTEs del repo: de ~30 (ruido global) a 13 — y las 13 son skills físicamente
instaladas en `.agents/skills/` del repo sin declarar: señal real para decidir
declarar o limpiar.

## Test Output

```text
tests/test_tools_discovery.sh — Summary: 17 run, 17 passed, 0 failed
./init.sh — gate completo adjunto por feature done
```
