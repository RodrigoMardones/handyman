## Revisores

- RodrigoMardones

## Cambios

- Documenta el pipeline de trabajo como 7 etapas nombradas: nueva sección "Stages at a Glance" en `handyman/references/workflow.md` (etapa → guardián → artefacto en disco → medida derivable) más la regla "a stage without its artifact did not happen"; el contrato de `feature_list.json` se mantiene en 4 estados (nada nuevo que declarar). Se añade el item de cierre correspondiente en `handyman/references/checklists.md`.
- Agrega `handyman/scripts/metrics.py`: agregador de solo lectura que deriva métricas de los tres artefactos que el workflow ya escribe — conteos por estado de `feature_list.json`, throughput por fecha desde los encabezados fechados de `progress/history.md`, tasa de aprobación y cobertura de reportes (`impl_`/`review_`) desde el frontmatter de `backlog/`. Soporta `--json` y siempre sale con código 0. Nueva suite `tests/test_metrics.sh` (6 casos), cableada como la 11ª suite en `tests/run_tests.sh`.
- Agrega el subcomando `declare <skill|mcp|agent> <nombre> [--dry-run]` en `handyman/scripts/tools_discovery.py`: añade la declaración al bloque `discovery` de `harness.config.json` mediante round-trip de JSON, rechaza duplicados sin escribir, valida el resultado contra el schema antes de guardar y soporta previsualización con `--dry-run`. Extiende `tests/test_tools_discovery.sh` con 4 casos nuevos.
- Agrega el modo `--strict` a `handyman/scripts/preflight.py`: opcional, pensado para CI, sale con código distinto de cero cuando el reporte de estabilidad detecta desfase de versión, desincronización de configuración/role-files o herramientas declaradas faltantes; el modo por defecto se mantiene siempre en 0. Extiende `tests/test_preflight.sh` con 3 casos nuevos.
- Agrega el flag opcional `--tools` a `handyman/scripts/feature.py done`, que registra en la entrada de `progress/history.md` qué skills/agentes se usaron realmente en la feature; se documenta el paso de validar la sección `## Tools` del formulario de intake contra el bloque `discovery` en `handyman/references/workflow.md`. Extiende `tests/test_feature.sh` con 1 caso nuevo.
- Agrega el documento de investigación `docs/analisis-workflow-etapas.md`, que sustenta el plan anterior con evidencia del repositorio y literatura de las skills `handyman`, `skill-creator` y `ponytail`.

## Tarea o asunto asociado

- feat/breakingpoints-workflow

## Evidencia del cambio

- `bash tests/run_tests.sh`: ALL SUITES PASSED (docs, init 14, update 12, feature 18, backlog 7, index 5, upgrade 10, tools-discovery 16, evals 7, preflight 8, metrics 6).
- `./init.sh`: exit 0 (todas las fases y advisories pasan).
- `find handyman/scripts tests -name '*.sh' | xargs shellcheck -S warning`: limpio.
