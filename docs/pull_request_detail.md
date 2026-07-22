## Revisores

- RodrigoMardones

## Cambios

- **Investigación y cierre de sprint**: cerrado el sprint `feat-rework-tools` (9 features archivadas → `feature_archive.json`, historial compactado, documento de período en `memory/sprints/`). Generado `docs/analisis-harness-replicacion-minima.md` con el análisis de replicación mínima del harness: inventario de los ~368 archivos del harness, conjunto mínimo replicable (Tier 1 config + Tier 2 conocimiento), y 4 soluciones propuestas (seed bundle, gist/release, template repo, verbo CLI).
- **Diseño del seed bundle (Parte A)**: la carpeta `.handyman.seed/` es un snapshot portable (Tier 1 config + Tier 2 memory + plantillas puente) que se regenera on-demand con el verbo `seed export`. **Decisión**: NO se commitea — se gitignora como artefacto derivado (igual que `dist/`), porque el harness vivo en `.handyman/` es la fuente de verdad y `seed export` lo reproduce cuando hace falta.
- **Verbo `seed export/import` del CLI (Parte D)**: nuevo verbo `seed` en `handyman/src/seed.ts` con subcomandos `export` (genera el seed desde el harness vivo: Tier 1+2 + plantillas + manifest) e `import` (restaura un harness desde el seed: bootstrap skeleton + overlay Tier 1+2, idempotente). Registrado en `cli.ts` (dispatcher `VERBS`) y `pack_npm.mjs` (inventory guard de verbos). Tests `seed.test.ts` con 9 casos (round-trip export/import, idempotencia no destructiva, manejo de errores de uso).
- **Limpieza del archivo histórico**: retirados 318 reportes terminados de `.handyman/archive/backlog/` del índice git (ruido histórico derivable de `feature_archive.json` + historial git), patrón añadido a `.gitignore`. El índice `feature_archive.json` se mantiene versionado.
- **Ajustes de tests**: `tests/test_docs.js` excluye `.handyman.seed` del link-verifier (artefacto de plantillas bundled, análogo a `assets/`); `tests/test_mcp.js` flexibiliza el check M12 para aceptar tanto "sprint abierto" como "sin sprint abierto" (el cierre del sprint es estado legítimo del harness dogfood).

## Tarea o asunto asociado

- `feat-harness-seed` — replicación mínima del harness de Handyman (verbo CLI `seed export/import`; el bundle `.handyman.seed/` es regenerable y gitignored)

## Evidencia del cambio

- Verifier `./init.sh`: **exit 0** (lint OK, build OK, test OK, harness OK, preflight OK: format/drift/sync/discovery/context todos en verde).
- Tests del verbo seed: **9/9 pass** (`npx vitest run src/seed.test.ts`).
- Consistencia verificada: `seed import` restaura un harness completo (17 archivos: bootstrap skeleton + overlay Tier 1+2) en un repo limpio de forma idempotente.
- Smoke test de export: genera 6 archivos Tier 1+2 + 11 templates + `manifest.json` (versión 3.5.0 detectada desde el harness).
- Leak-check (artefacto de render `cache_control`): 0 ocurrencias en todos los archivos editados (verificado con grep).
