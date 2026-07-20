## Revisores

- RodrigoMardones

## Cambios

- **Panel Next.js (`apps/web`)**: migración completa del observer a Next 16 — 14 rutas API nativas con paridad byte a byte con el observer Node retirado (`/api/state`, `/events` SSE vía singleton de runtime, API de lectura, 7 relays LLM con SSE estable), vistas `fleet`, `harness/[name]`, `intake`, `ask`, `search` y `timeline` con refresco en vivo por `fs.watch → SSE`, y primera acción de escritura del panel: `POST /api/feature` registra una feature en un harness del registry sin spawnear procesos (features 41, 43-45, 47-48, 60).
- **Paquete `@handyman/toolbox-core`**: extracción de la capa de datos y relays LLM compartida por CLI y panel, con shims dist-estables en `handyman/` para no romper rutas (feature 42).
- **Contrato de verbos del harness honesto**: `done` escribe el veredicto real leído de `backlog/review_<name>.md` (distingue `NO REVIEW FILE` de `NO VERDICT`); un solo camino de escritura a `feature_list.json` (`saveValidated`); `acceptance` sobre una feature `done` se niega salvo `--force` auditado; `backlog.js review --force` re-emite veredictos conservando el cuerpo; `./init.sh` corre `validate_harness` como fase bloqueante; unificación del intake en una función core (features 46, 51-59).
- **Advisories sin ruido heredado**: `validate_harness` acepta la convención legacy de frontmatter (`verdict:`/`date:`/`reviewer:` como alias de `status:`/`updated:`/`role:`), espejando el fallback que `done` ya usaba — los NOTEs de frontmatter sobre el backlog real bajan de 32 a 1, y el que queda es deuda real (feature 61).
- **Preparación open source** (decisiones de negocio 2026-07-19): licencia unificada — los cuatro `package.json` del workspace declaran MIT, cerrando la contradicción con los dos que decían Apache-2.0 (feature 62); untrackeadas 14 skills de terceros sin licencia de `.agents/skills/` (quedan las 3 con licencia: brand-guidelines, frontend-design, ponytail), el cache regenerable de graphify con rutas absolutas locales, `cost.json` y los punteros machine-specific — nada se borra del disco (feature 63).
- **Camino npm registrado**: features 64-66 pendientes documentan la decisión de publicar el toolchain como `handyman-harness` en npm, migrar SKILL.md a `npx` y dar visibilidad al panel en los README (registradas, no implementadas).
- **Estado del harness**: sprints 2026-SP5/SP6, handoffs 2026-07-18 y 2026-07-19, reportes impl/review por feature y suites nuevas (`test_web_*`, casos T15-T29 del verificador).

## Tarea o asunto asociado

- feat/llm-toolbox-tasks / features 41-63 (+ registro de 64-66)
- Reviews de las features 51-63 auto-firmadas y declaradas (`actor: … (single-agent session)` en cada reporte); aceptadas así por decisión del 2026-07-19, con la deuda visible en el gate.

## Evidencia del cambio

- `./init.sh` exit 0 en las 7 fases (format, build, harness, test, drift, sync, discovery); corrido además por cada `feature.js done` (61, 62, 63).
- `bash tests/run_tests.sh` — ALL SUITES PASSED.
- `tests/test_init.sh` 28/28, incluido T29 (convención legacy silenciada) con T15 como caso negativo vigente.
- NOTEs de `frontmatter is missing` en el backlog real: 32 → 1 (solo `explore_workstation_ui_state_2.md`, incompleto en ambas convenciones).
- `git ls-files .agents` → solo las 3 skills con licencia; `git ls-files graphify-out` → solo `GRAPH_REPORT.md`, `graph.html`, `graph.json`, `manifest.json`.
