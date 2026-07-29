---
type: Implementation Log
feature: registry_basename_uniqueness
status: implemented
role: implementer
updated: 2026-07-29
tags: [handyman/role/implementer, handyman/feature/registry_basename_uniqueness]
---

# Implementation Report: registry_basename_uniqueness

Las MCP tools seleccionan proyecto por NOMBRE = `basename(project_root)` del
registry global (`$HANDYMAN_ROOT/registry.json`). Dos roots registrados con
igual basename (`/tmp/hm-studio`, `/foo/hm-studio`) eran ambiguos y el
`find()` resolvía en silencio el primero. Dos cambios, sin romper
compatibilidad:

1. **MCP `resolveProject` rechaza la ambigüedad.** Si más de un harness
   registrado comparte el basename pedido, lanza un error explícito que lista
   los `project_root` candidatos y sugiere pasar la ruta absoluta.
2. **`toolbox register` advierte al crear la colisión.** Registrar un root
   cuyo basename ya existe en OTRO `project_root` emite un `WARN` por stderr,
   pero registra igualmente (exit 0); re-registrar el mismo root sigue
   siendo el dedup silencioso de siempre.

## What

- **`handyman/src/mcp.ts` (`resolveProject`).** El `listHarnesses().find(...)`
  pasa a `filter(...)` sobre todos los matches: cero matches conserva el
  error "not registered" existente (con las alternativas registradas); un
  match conserva el comportamiento actual; dos o más lanzan `project name
  '<name>' is ambiguous: N registered harnesses share it: <root1>, <root2>.
  Pass the absolute project root instead of the name.` La rama
  `isAbsolute(project)` no se tocó: las rutas absolutas (registradas o no)
  siguen resolviendo directo. El binding `const match = matches[0]` + guarda
  `!match` satisface `noUncheckedIndexedAccess` sin non-null assertions.
- **`handyman/src/toolbox.ts` (`cmdRegister`).** Tras el early-return de
  dedup (mismo `project_root` → "already registered", sin warning), se
  calcula `basename(root)` y se filtran las entradas del registry con igual
  basename; si hay alguna, `warn()` (helper nuevo junto a `err`/`out`, misma
  casa: `WARN: <msg>` a stderr) emite `name '<name>' is shared with
  <root(s)> — MCP tools resolving by name will be ambiguous; prefer absolute
  paths`, y el flujo sigue: push, sort, save, exit 0.
- **`packages/toolbox-core/src/registry.ts`: sin cambios.** Los helpers de
  nombre (`listHarnesses` con `basename`) viven en `mcp.ts`, no en
  toolbox-core, y toolbox-core no tiene suite de tests (solo `build`/
  `typecheck`), así que no correspondía test unitario ahí.

## Files Changed

- `handyman/src/mcp.ts` — `resolveProject`: find → filter; nuevo error de
  ambigüedad con candidatos y sugerencia de ruta absoluta.
- `handyman/src/toolbox.ts` — helper `warn()`; `cmdRegister` advierte al
  registrar un basename ya presente en otro root (registra igualmente).
- `tests/test_mcp.js` — caso M29: registry con dos roots de igual basename →
  `resolveProject("hm-studio")` lanza el error listando ambos roots, y
  `resolveProject(<absoluta>)` del root duplicado sigue resolviendo
  (`root` y `name` correctos). Fixture sigue el patrón de M5/M8
  (`HANDYMAN_ROOT` temporal + `registry.json` escrito a mano).
- `tests/test_toolbox.sh` — caso TB24: dos roots distintos con igual
  basename → el primer `register` no advierte, el segundo emite el `WARN`
  con el root conflictivo y AMBOS quedan registrados (exit 0, 2 entradas);
  re-registrar el mismo root no advierte y sigue diciendo "already
  registered".

## Decisions

- **Warning no bloqueante por diseño.** El brief manda no romper
  compatibilidad ni exit codes: el registry admite basenames duplicados
  (caso legítimo: mismo proyecto en dos checkouts), la ambigüedad se
  rechaza solo en el punto de resolución por nombre (MCP), donde el error
  enseña la salida (ruta absoluta).
- **`WARN` a stderr, estilo `err()`.** Las suites capturan `2>&1`, y stderr
  mantiene limpio el stdout para consumidores que parsean (`list --json`,
  etc. en otros verbos); se añadió `warn()` como helper en vez de inlinear
  el `process.stderr.write`.
- **Sin helper nuevo en toolbox-core.** Extraer `basename`-matching al
  paquete compartido añadía superficie sin segundo consumidor: mcp.ts y
  toolbox.ts ya importan `basename` de `node:path`.
- **Mensaje de ambigüedad sin lista de "registered harnesses".** A
  diferencia del error de not-registered, aquí las alternativas útiles son
  los candidatos conflictivos, no el registry completo.

## Test Output

```text
cd handyman && npm run build   # tsc -b — verde, sin errores
node tests/test_mcp.js         # 35/35 passed (M29: 2 checks nuevos)
bash tests/test_toolbox.sh     # Summary: 25 run, 25 passed, 0 failed (TB24 nuevo)
bash tests/test_init.sh        # Summary: 33 run, 33 passed, 0 failed
```
