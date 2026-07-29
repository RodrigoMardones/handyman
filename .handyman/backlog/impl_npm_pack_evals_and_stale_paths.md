---
type: Implementation Log
feature: npm_pack_evals_and_stale_paths
status: implemented
role: implementer
updated: 2026-07-29
tags: [handyman/role/implementer, handyman/feature/npm_pack_evals_and_stale_paths]
---

# Implementation Report: npm_pack_evals_and_stale_paths

Dos arreglos al paquete publicable `handyman-harness@3.7.5`, sin bump de
versión (publicar sigue siendo acción humana):

1. **`evals` roto en el tarball.** `dist/evals.js` resuelve el eval set como
   `../evals/trigger-eval.json` relativo a `dist/` (espejo del layout del repo),
   pero `evals/` no se copiaba a `.pack-staging/` ni estaba en `files`, así que
   en el paquete instalado `evals validate` fallaba con "eval set not found".
2. **Mensajes con rutas stale del monorepo.** Errores, usages y references
   apuntaban a `node handyman/dist/*.js` y `scripts/upgrade_harness.py` (el
   Python retirado) — inútiles para el consumidor npm.

## What

- **Fix evals (sin tocar `evals.ts`).** La resolución `resolve(dirname(
  import.meta.url), "..", "evals/trigger-eval.json")` desde el bundle
  `dist/evals.js` apunta a `<pkg>/evals/trigger-eval.json`, idéntico al caso
  repo (`handyman/evals/` — un único JSON; el schema opcional vive en
  `assets/schemas/`, que ya se shippeaba). Bastó con empaquetar `evals/`:
  `pack_npm.mjs` ahora copia `handyman/evals/` al staging, declara `"evals"`
  en `files` y gana una guarda de inventario (`die` si falta
  `evals/trigger-eval.json` en el tarball, al estilo de las guardas .env /
  workspace:* / verbs).
- **Mensajes → bin publicado.** Forma elegida `npx handyman-harness@3 <verb>`
  en strings de código TS (consistente con `references/mcp.md` y
  `references/toolbox.md`, que ya usaban esa forma) y `npx -y handyman-harness@3
  <verb>` en comandos-a-correr de docs/scripts (con `-y`, como la línea vecina
  de `scaffold.sh` para `.vscode/mcp.json`).

## Files Changed

- `handyman/scripts/pack_npm.mjs` — copia `evals/` al staging; `files` +=
  `"evals"`; guarda de inventario `evals/trigger-eval.json`.
- `handyman/src/mcp.ts` — error de proyecto no registrado: `node
  handyman/dist/toolbox.js register <root>` → `npx handyman-harness@3 toolbox
  register <root>`; descripción de `feature_next`: idem para `feature start`.
- `handyman/src/upgrade_harness.ts` — pista `apply:` ahora `npx
  handyman-harness@3 upgrade_harness --root <root>`; `PROG` =
  `"upgrade_harness"` (usage/errores ya no dicen `.py`).
- `handyman/scripts/scaffold.sh` — NOTE de declare fallback → `npx -y
  handyman-harness@3 tools_discovery declare mcp handyman`.
- `handyman/references/toolbox.md` — intro de subcomandos, Typical Loop y hook
  `post_run` pasan a `handyman toolbox …` / `npx -y handyman-harness@3 toolbox
  heartbeat`; el párrafo del hook se reescribe (ya no habla de relative paths).
- `handyman/references/mcp.md` — Streamable HTTP y el declare de
  `discovery.mcp` pasan a `npx -y handyman-harness@3 …`.
- `tests/test_npm_pack.sh` — caso de inventario `package/evals/
  trigger-eval.json`; smoke fuera del monorepo extendido: `cli.js evals
  validate` exige exit 0 + `validate: OK`, y `evals.js validate` directo exige
  contrato idéntico. Además el tmpdir se canonicaliza (`pwd -P`): en macOS
  `/var` → `/private/var` rompía el entry-guard `import.meta.url ===
  file://$argv[1]` al correr un `dist/<verb>.js` bundled directamente (main()
  no corría y el caso salía vacío). De paso el caso toolbox-usage ahora ejerce
  de verdad el usage.
- `tests/test_init.sh` — T33 aserta el nuevo NOTE (`tools_discovery declare
  mcp handyman` sin `.js`).

## Decisions

- **`evals.ts` intacto.** El layout `<pkg>/evals/` junto a `dist/` hace que la
  resolución existente sirva en repo y paquete; tocar el resolver añadía riesgo
  sin necesidad.
- **Ocurrencias que quedan (justificadas).** `src/upgrade_harness.ts:5`
  (docstring: historia del port desde `scripts/upgrade_harness.py`) y
  `references/mcp.md:33,40` (sección "Connecting" documenta el modo checkout —
  `${workspaceFolder}` / `<repo>` — y contrasta con el párrafo "From the
  published package, no checkout needed" que sigue). Grep final limpio fuera de
  esas.
- **`feature_next` (mcp.ts:999) incluida** aunque el brief solo citaba ~l129:
  la regla del grep final manda no dejar rutas stale de cara al consumidor y
  esa descripción es texto que lee el usuario del MCP.

## Test Output

```text
cd handyman && npm run build          # tsc -b — verde, sin errores
bash tests/test_npm_pack.sh           # Summary: 17 run, 17 passed, 0 failed
bash tests/test_evals.sh              # Summary: 8 run, 8 passed, 0 failed
bash tests/test_init.sh               # Summary: 33 run, 33 passed, 0 failed
# regresión extra por los strings tocados:
node tests/test_mcp.js                # 33/33 passed
bash tests/test_upgrade.sh            # Summary: 15 run, 15 passed, 0 failed
```

Smoke clave (paquete desempacado, workspace vacío, sin node_modules):
`node dist/cli.js evals validate` → `eval set: …/package/evals/
trigger-eval.json`, `items: 20 (positive=10, negative=10)`, `validate: OK`,
exit 0 — y salida byte-idéntica vía `dist/evals.js` directo.
