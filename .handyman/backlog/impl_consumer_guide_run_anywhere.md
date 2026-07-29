---
type: Implementation Log
feature: consumer_guide_run_anywhere
status: implemented
role: implementer
updated: 2026-07-29
tags: [handyman/role/implementer, handyman/feature/consumer_guide_run_anywhere]
---

# Implementation Report: consumer_guide_run_anywhere

Dos entregables: (a) la guía run-anywhere del paquete `handyman-harness` en el
README que viaja en el tarball, y (b) la lab de instalación realineada al flujo
actual. Sin bump de versión (3.7.5; publicar sigue siendo acción humana).

Al verificar los comandos contra el código real (regla de la feature: la guía
no promete nada que no exista) salió un **bug mayor del tarball publicado** que
hacía imposible tanto la guía como la lab: el CLI `toolbox` del bundle no
ejecutaba ningún subcomando. El fix estructural es la sección 2.

## 1. What — guía y lab

- **`handyman/README.npm.md`**: nueva sección "## Run anywhere: one install,
  every registered project" entre Install y CLI usage. Instalación
  (`npm i -g handyman-harness` / `npx -y handyman-harness@3 <verb>`), registro
  (`toolbox register <path>`, `toolbox discover --scan <dir> --register`),
  revisión de la flota desde cualquier cwd (`toolbox status|health|timeline`,
  con `--json`), un MCP para toda la flota (`handyman mcp` stdio /
  `--http --host 127.0.0.1 --port 8177`, arg `project` por tool, resources
  `handyman://{project}/current|resume|docs/{doc}`), y dos caveats honestos:
  el nombre es el basename del root y debe ser único (colisión → las tools MCP
  rechazan el nombre y piden la ruta absoluta, F99) y el registry es
  machine-local (rutas absolutas; re-registrar en cada máquina). Cada comando
  se verificó contra `toolbox.ts`/`mcp.ts` (flags `--scan/--register/--json/
  --http/--host/--port`, mensaje "is ambiguous" de `resolveProject`).
- **`README.md` raíz**: un enlace corto a esa sección bajo "Instalación Con
  Skills" (repo → consumidor npm), en español como el resto del documento.
- **`tests/lab_skill_install.sh`**: reescrita como consumer journey del
  paquete (6 casos, estilo `lib/assert.sh`, todo bajo un `mktemp` con
  `HANDYMAN_ROOT` aislado): tarball disponible (corre `pack:npm` si falta,
  como test_npm_pack) → desempaque (offline: `npm install <tarball>` bajaría
  vis-network del registry) → fixture vía `scaffold.sh` → `cli.js toolbox
  register` → `toolbox status` y `toolbox list` **desde otro cwd sin harness**
  → `cli.js evals validate`. La medición vieja (npm install + tsc sobre la
  skill, FAIL esperado en pasos 2-4, oráculo de las archivadas 64/65/68) se
  retira: duplicaba intención y medía un flujo que ya no existe. Sigue fuera
  del gate (`run_tests.sh` lista sus suites; la lab es sonda manual), ahora
  verde.

## 2. Bug encontrado y fix (bloqueaba la feature)

**Síntoma:** en el tarball, `node dist/toolbox.js register|status|list|...`
nunca corría: con harness en cwd regeneraba `index.md` y salía 0 (side
effect!); sin harness abortaba `error: no feature_list.json under <cwd>` exit
1. El `handyman toolbox …` publicado en 3.7.5 estaba roto vía CLI (vía API
programática y MCP sí funcionaba: ahí no entra el guard).

**Causa raíz:** los entry-guards `import.meta.url === file://${argv[1]}`.
esbuild colapsa el `import.meta.url` de todos los módulos del bundle a la URL
del propio bundle, así que al correr `dist/toolbox.js` los guards de los
verbos que `toolbox.ts` importa (`index_md`, `metrics`, `upgrade_harness`)
también se evaluaban true y su `main()` + `process.exit()` corría primero.
El smoke viejo de test_npm_pack ("usage exits 0") pasaba por accidente: nunca
ejercía el main de toolbox.

**Fix:** guards por nombre de archivo invocado —
`if (basename(process.argv[1] ?? "") === "<verb>.js")` — válido desde `dist/`
(tsc), desde el bundle y a través del dispatcher (`cli.js` re-apunta `argv[1]`
a `dist/<verb>.js`), e inmune a symlinks (sustituye también al
`entryGuardUrl` con realpath de feature.ts, handoff bug #3). Aplicado a los
13 puntos de entrada: toolbox, feature, backlog, metrics, index_md, sprint,
preflight, evals, update_harness, upgrade_harness, validate_harness,
tools_discovery, mcp (más imports de `basename` donde faltaba). Comentario
completo en `toolbox.ts`; nota corta "bundle-proof (see toolbox.ts)" en el
resto.

**Test actualizado:** el caso de test_npm_pack pasa de "usage exits 0"
(asertaba el accidente) a "bundled toolbox.js runs its own main (usage on
stderr, exit 2)" — regresión directa del bug: ejerce el main real.

## Files Changed

- `handyman/README.npm.md` — sección Run anywhere.
- `README.md` — enlace a la sección.
- `handyman/src/{toolbox,feature,backlog,metrics,index_md,sprint,preflight,
  evals,update_harness,upgrade_harness,validate_harness,tools_discovery,mcp}.ts`
  — entry-guard basename-proof (+import de `basename` en metrics, evals,
  validate_harness, preflight, tools_discovery).
- `tests/lab_skill_install.sh` — reescrita (consumer journey, 6 casos).
- `tests/test_npm_pack.sh` — caso toolbox-usage aserta el main real.

Sin tocar: `tests/test_mcp.js` y `tests/test_toolbox.sh` (cambios sin
commitear de la sesión F99, ajenos), `feature_list.json`, `progress/`,
`package.json`/`SKILL.md` (versión 3.7.5 intacta).

## Decisions

- **Desempaque en vez de `npm install <tarball>`** en la lab: la dependencia
  vis-network se bajaría del registry; la casa es offline por diseño.
- **Lab fuera del gate**: `run_tests.sh` nunca la invocó (sonda report-only);
  se mantiene así — el gate ya cubre el contrato vía test_npm_pack +
  test_toolbox. Documentado en el header de la propia lab.
- **El fix de guards cubre los 13 verbos**, no solo los importados por
  toolbox: misma línea por archivo, y evita que el próximo import entre
  verbos reabra la trampa.
- **`.handyman/index.md` quedó regenerado** (side effect de la primera
  corrida de la lab, antes del fix: el bug ejecutó `index_md` con cwd=repo
  root). Su contenido es una regeneración fiel del estado vivo e incluye
  entradas de sesiones intermedias (`review_npm_pack_evals_and_stale_paths`),
  así que NO se revierte (revertir podría borrar trabajo ajeno); queda
  registrado aquí.

## Test Output

```text
cd handyman && npm run build            # tsc -b — verde
bash tests/run_tests.sh                 # ALL SUITES PASSED (23/23, incluye
                                        # test_docs.js, test_init.sh y
                                        # test_npm_pack.sh 17/17)
bash tests/lab_skill_install.sh         # Summary: 6 run, 6 passed, 0 failed
```

Prueba del fix (bundle, mktemp aislado): `toolbox.js register` escribe
`registry.json`; `toolbox.js status` desde cwd SIN harness reporta la flota y
sale 0; `cli.js toolbox list` idem con el `project_name` vivo.
