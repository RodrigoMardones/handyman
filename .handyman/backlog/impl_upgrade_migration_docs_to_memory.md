---
type: Implementation Log
feature: upgrade_migration_docs_to_memory
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/upgrade_migration_docs_to_memory]
---

# Implementation Report: upgrade_migration_docs_to_memory

## Files Changed

- `handyman/src/upgrade_harness.ts`:
  - `Migration` gana el hook opcional `apply(ctx: {root, workspace, dryRun})`
    para logica de migracion custom (los `ensures` solo copian plantillas;
    esto mueve contenido del usuario). Se invoca tras los ensures y antes de
    los advisories; contrato: idempotente y honra dryRun.
  - Entrada nueva del registry a `3.7.5` con `apply: migrateDocsToMemory` y
    advisories de gitignore (`!.handyman/memory/`) y AGENTS.md.
  - `migrateDocsToMemory`: si `memory/` existe -> `ok (exists)`; si no hay
    archivos de conocimiento en `docs/` -> `skip`; si no, backup de los
    originales en `.upgrade-backups/<stamp>/docs/` y `renameSync` de cada
    `docs/<f>` a `memory/<f>` (contenido byte a byte). Dry-run imprime
    `would move:` sin escribir.
  - `printPending` ahora imprime tambien los advisories de cada migracion
    pendiente (los hace visibles en `--check`, acceptance 2).
  - Import += `renameSync`.
- `tests/test_upgrade.sh` (15 casos, antes 10):
  - U6 actualizado: el harness 1.5.0 termina con `memory/business.md` (el
    ensure 1.6.0 crea `docs/business.md` y la migracion nueva lo mueve) —
    era el comportamiento correcto del mundo post-F73.
  - U10 actualizado: el contenido custom se preserva MOVIDO a `memory/` con
    backup en `.upgrade-backups/*/docs/` (nunca sobreescrito).
  - U11 (nuevo): harness legacy 2.1.1 con los 4 archivos -> `memory/`
    poblada, contenido identico, `docs/` vaciada, backup, re-seal a CUR.
  - U12 (nuevo): segunda corrida `nothing to apply` y contenido intacto
    (idempotencia).
  - U13 (nuevo): harness ya en `memory/` -> guard `ok (exists): memory/` y
    el contenido canonico no se toca (un duplicado legacy en docs/ queda).
  - U14 (nuevo): `--check` lista la migracion con sus advisories
    (`!.handyman/memory/`, AGENTS.md).
  - U15 (nuevo): dry-run `would move:` sin escribir nada.

## Criterio de version de la entrada (decision pedida por el acceptance)

La entrada se registra a **3.7.5 = la version de la skill que ENTREGA EL FIX**,
no la que introdujo el cambio y no la secuencia 1.x. Razon:

1. **La secuencia 1.x esta muerta para harnesses sellados con version de
   skill.** `pendingMigrations` compara `installed < version <= current`; un
   harness legacy 2.1.1 queda POR ENCIMA de todas las entradas 1.6-1.8 y las
   saltaria todas. Registrar a 1.9.0 haria la migracion inalcanzable para
   exactamente los harnesses que la necesitan.
2. **La version que introdujo el cambio fue 3.5.0** (verificado por git: el
   commit `b4abf51` de F73, `workspace_memory_layout`, sella
   `package.json 3.5.0`; la descripcion decia 3.6.0, el dato real es 3.5.0).
   Registrar a 3.5.0 dejaria fuera a los harnesses sellados en 3.5.0-3.7.4
   que aun arrastran `docs/` (sellados despues del cambio pero antes del fix).
3. **Registrar a la version-del-fix (3.7.5) ofrece la migracion a TODO
   harness sellado antes del fix**, y el guard propio de la migracion
   (`memory/` ausente Y archivos `docs/` presentes) la hace segura e
   idempotente para los que no la necesitan. El comentario del criterio queda
   inline en el registry.

## Test Output

```text
tests/test_upgrade.sh: 15/15 (U6/U10 actualizados, U11-U15 nuevos)
tests/test_preflight.sh: 13/13 (sin roturas por advisories en --check)
tests/test_npm_pack.sh: 14/14
pnpm --filter handyman-harness build (tsc -b): OK
./init.sh → exit 0 (verificado en feature.js done)
```
