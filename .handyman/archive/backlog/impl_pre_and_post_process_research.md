---
type: Implementation Log
feature: pre_and_post_process_research
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/pre_and_post_process_research]
---

# Implementation Report: pre_and_post_process_research

## Files Changed

- `docs/analisis-pre-post-process.md` — nuevo documento de investigación + plan de
  trabajo (9 secciones, formato de los `analisis-*` existentes).
- `.handyman/feature_list.json` — feature 41 añadida vía `feature.py add`.

## Design Notes

- Feature de **investigación** (arquetipo investigación, no implementación): el
  entregable es un documento de investigación + una propuesta de trabajo, no código.
- **Hallazgo clave (paradoja central):** los cinco chequeos que pide el usuario
  **ya existen como scripts** (`validate_harness`, `upgrade_harness`,
  `update_harness`, `tools_discovery`, `evals`), pero viven dispersos — algunos
  bloqueantes, otros advisory, otros solo CLI — y ninguno está consolidado en un
  gate pre-run ni documentado como paso del workflow. La mejora es *orquestar*, no
  *inventar* (literatura `ponytail`).
- **Evidencia de drift vivo:** `upgrade_harness.py --check` muestra tres versiones
  coexistiendo en este harness (`1.8.4` en feature_list, `1.11.11` en root config,
  `1.13.13` en la skill) — prueba que la estabilidad entre versiones que se busca no
  es teórica.
- **Propuesta de diseño:** separar *stability gate* (pre-run, read-only, orquestado
  por un `preflight.py` fino que reutiliza el 100% de los scripts) del *quality
  gate* (`init.sh` actual, sin tocar su semántica), más un *hook post-run* declarado
  (lista `post_run` opt-in en `harness.config.json`, ejecutada por `feature.py done`
  siempre con exit 0).
- **Scope del plan:** `SKILL.md`/`references/`/`assets/`/`scripts/`/`init.sh`, con 6
  ítems (A–F) y 6 features sugeridas **no añadidas** (espejo de los análisis
  9/15/20/25/32).
- Formato: inline-code (no markdown links) en las referencias a archivos/scripts para
  no romper la verificación de links de `test_docs.py` (T2).

## Test Output

```text
$ ./init.sh
...
ALL SUITES PASSED
    test: OK
VERIFIER: all gates passed
NOTE: context graph may be stale - rebuild with /graphify --update
EXIT_CODE=0
```

- Verifier verde tras añadir el doc (lint/build/test + markdown links de
  `test_docs.py` resuelven; sin nuevos links markdown en el doc).
- `feature.py add` escribió solo contract keys (id/name/title/description/acceptance/
  status).
