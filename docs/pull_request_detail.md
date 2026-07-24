## Revisores

- RodrigoMardones

## Cambios

- **Drift residual `docs/` → `memory/` (feature 78, `memory_drift_templates_references`)**
  - 16 archivos del skill (`handyman/assets/` + `handyman/references/`) actualizados a memory-first con notas legacy explícitas: roles implementer/reviewer, tabla resumen de `feature-request`, mensajes de `init.sh`, y las references workflow, checklists, examples, obsidian, templates, graphify, models, tools, anatomy y security.
  - `anatomy.md` retira la fila `docs/current/` (carpeta eliminada en la feature 73; handoffs fusionados en `progress/`) y los sprints pasan a `memory/sprints/`; `schemas/sprint.schema.json` describe la ruta real de escritura.
  - `harness.gitignore.template` conserva `!.handyman/docs/` anotada como legacy para harnesses creados con skill ≤2.x.
  - Superficies estables preservadas a propósito: fallbacks legacy `docs/` en init/scaffold, tag Obsidian `#handyman/docs`, URIs MCP `handyman://.../docs/*` y nombres de assets `docs-*.template.md` (prefijo histórico, ahora documentado en `references/templates.md`).
- **Sello de versión 3.6.0**
  - `handyman/SKILL.md` y `handyman/package.json`: bump 3.5.0 → 3.6.0 (cambio preexistente en el working tree; se integra a esta rama).
- **Estado del harness (dogfooding)**
  - Cierre del período `feat-rework-tools`: 9 features archivadas en `archive/feature_archive.json`, history compactado y documento derivado `memory/sprints/sprint.feat-rework-tools.md`.
  - Apertura del período `feat-residual-memory-revision`; features registradas: 78 (esta rama), 79 (`upgrade_migration_docs_to_memory`, pendiente) y 80 (`src_comment_memory_drift`, follow-up detectado por el review).
  - Reportes `backlog/impl_memory_drift_templates_references.md` y `backlog/review_memory_drift_templates_references.md` (veredicto APPROVED, sin cambios requeridos).

## Tarea o asunto asociado

- feat/residual-memory-revision · feature 78 (`memory_drift_templates_references`)

## Evidencia del cambio

- `./init.sh` exit 0 como gate de `feature done`: shellcheck, `tsc -b`, `validate_harness` y `tests/run_tests.sh` con todas las suites verdes.
- Suites tocadas por las plantillas del verifier: `tests/test_docs.js` 220/220 y `tests/test_init.sh` 29/29 (sentinels del business-check y fallback legacy intactos).
- Smoke test de bootstrap: `scaffold.sh local` en directorio vacío emite `memory/` + `memory/sprints/` y cero referencias `docs/` en `AGENTS.md`/`index.md`/`init.sh` salvo notas legacy explícitas.
- Review delegado: APPROVED, verificado contra diff y verifier por cuenta propia (`.handyman/backlog/review_memory_drift_templates_references.md`).
