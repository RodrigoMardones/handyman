---
type: Implementation Log
feature: mastra_runtime_pack
status: implemented
role: implementer
updated: 2026-07-29
tags: [handyman/role/implementer, handyman/feature/mastra_runtime_pack]
---

# Implementation Report: mastra_runtime_pack

Bundle esbuild de `agents/mastra-handyman` para correr los runners con NODE
PURO (sin tsx) desde cualquier cwd, sobre el runtime ya desacoplado de F101.
El paquete sigue `private: true`: el artefacto (`dist-bundle/`, gitignored)
corre desde el monorepo/instalación local — NO es un paquete publicable (sin
staging de manifest, sin npm pack).

## What

- **`scripts/build_bundle.mjs`** (patrón `handyman/scripts/pack_npm.mjs`):
  esbuild → `dist-bundle/{run-feature,run-workflow,run-skill}.mjs`, platform
  node, formato ESM, `target: node20` (coherente con `engines: node >=20`
  del toolchain). Borra y regenera el outdir; guards de inventario al final
  (los 3 runners presentes + `@mastra/*` no inlineado); última línea stdout
  `status: ok|error`. Script npm `"build:bundle"` + devDep `esbuild
  ^0.28.1` (misma versión que handyman/).
- **`scripts/smoke_bundle.sh`** (estilo `tests/`: `tests/lib/assert.sh`,
  mktemp + trap, `Summary: N run, N passed, 0 failed`): S1 build emite los 3
  bundles + `status: ok`; S2 `@mastra/*` queda como import runtime; S3 boot
  con `node` puro desde un cwd ajeno (mktemp) con `HANDYMAN_ROOT` aislado y
  fixture mínimo registrado POR NOMBRE, MCP apagado — exige exit ≠ 0,
  `ECONNREFUSED` + la pista `handyman mcp --http` + la URL en la salida, y
  ausencia de errores de recursos (`cannot locate the handyman assets`,
  `is not registered`, `Cannot find module`); S4 el cwd ajeno queda vacío
  (nada se escribe antes del connect).
- **Guarda MCP accionable** (`src/agents/handyman/leader.agent.ts`): el error
  `MCP at <url> exposed 0 tools` ahora añade "is the handyman MCP server
  running? Start one with 'handyman mcp --http' … or point HANDYMAN_MCP_URL"
  — la aserción (b) del brief lo exigía y mejora todo boot fallido (tsx o
  bundle).
- **README** con la sección del artefacto (build, ejecución con node,
  externos y por qué, requisito de MCP vivo, smoke); **`.gitignore`** +=
  `dist-bundle/` (mismo tratamiento que `data/`/`logs/`/`.mastra`).

## Files Changed

- `agents/mastra-handyman/scripts/build_bundle.mjs` — **nuevo**: build +
  guards de inventario.
- `agents/mastra-handyman/scripts/smoke_bundle.sh` — **nuevo**: smoke 4
  casos (chmod +x).
- `agents/mastra-handyman/package.json` — script `build:bundle`; devDep
  `esbuild: ^0.28.1`.
- `agents/mastra-handyman/.gitignore` — += `dist-bundle/`.
- `agents/mastra-handyman/src/agents/handyman/leader.agent.ts` — mensaje de
  la guarda MCP ahora accionable (cómo levantar el server).
- `agents/mastra-handyman/README.md` — sección "Bundle runnable con node
  puro (feature 102)".
- `pnpm-lock.yaml` — entrada `esbuild` en el importer del agente (única
  modificación fuera del paquete, necesaria para enlazar la devDep).

## Decisions

- **Externos: TODO lo de terceros** (`@mastra/*` — cubre los bindings nativos
  duckdb/libsql que esos paquetes traen—, `@ai-sdk/*`, `zod`, `mastra`,
  `handyman-harness`). El bundle inlinéa SOLO el src propio (~50 KB/runner):
  el paquete es `private` y siempre corre desde su instalación, así que
  `node_modules` está garantizado; node resuelve los imports relativos al
  ARCHIVO del bundle, nunca al cwd del caller — la ejecución desde `/tmp`
  funciona sin copiar nada.
- **`handyman-harness` vía `createRequire`, no import estático** (ya era así
  desde F101 en `harness-install.ts`): en el bundle, `import.meta.url` =
  `dist-bundle/<runner>.mjs` → `createRequire` sube a
  `agents/mastra-handyman/node_modules/` y sigue el link workspace al
  paquete real (donde viven `assets/` y `dist/`). Verificado en el bundle
  generado (línea con `createRequire(import.meta.url).resolve(
  "handyman-harness/package.json")` preservada) y por el boot S3, que carga
  los role templates. Queda en la lista `external` como documentación-en-
  código (esbuild nunca ve la resolución).
- **Sin banner `createRequire`**: nada de lo bundled es CJS (a diferencia de
  pack_npm.mjs, donde ajv CJS lo exige). El header del script deja la nota
  de cuándo copiarlo.
- **Sin entry-guard**: los runners ejecutan top-level (drivers, no unidades
  importables) — cada archivo del bundle ES la entrada. Contraste
  documentado con el dispatcher `cli.js` del toolchain (F100), donde los
  verbos sí son importables y guardan `main()` por basename(argv[1]).
- **`run-evals.ts` y `studio/index.ts` NO se bundlean**: el primero corre en
  dev con tsx (suite viva), el segundo lo carga `mastra dev`. Solo los 3
  runners del brief.
- **Sin cambios en tests unitarios**: la guarda MCP no tenía aserción sobre
  el mensaje viejo (grep verificado); el smoke cubre el contrato nuevo.

## Test Output

```text
cd agents/mastra-handyman && pnpm build:bundle
# bundle: …/dist-bundle (3 runners, node20 ESM, externals: …) / status: ok
pnpm test:unit          # Test Files 8 passed (8) · Tests 77 passed (77)
pnpm exec tsc --noEmit  # exit 0
bash agents/mastra-handyman/scripts/smoke_bundle.sh
#   PASS build:bundle emits the three runner bundles
#   PASS bundles keep @mastra/* as runtime imports (nothing inlined)
#   PASS node bundle boots from an alien cwd and fails ONLY at the MCP
#   PASS no state leaks into the alien cwd (dirs default under HANDYMAN_ROOT)
# Summary: 4 run, 4 passed, 0 failed
./init.sh               # VERIFIER: all gates passed (exit 0)
```

## Boot evidence (node puro, cwd ajeno, MCP apagado)

Réplica manual del caso S3 (fixture aislado, proyecto por NOMBRE
`bundle-probe`):

```text
$ cd $TMP/alien && HANDYMAN_ROOT=$TMP/HANDYMAN HANDYMAN_PROJECT_ROOT=bundle-probe \
    HANDYMAN_MCP_URL=http://127.0.0.1:19999/mcp \
    node <pkg>/dist-bundle/run-feature.mjs smoke_bundle_probe
[LLM] [handyman] Failed to connect with SSE transport … connect ECONNREFUSED 127.0.0.1:19999
MCPClient errored connecting to MCP server: { … "code":"MCP_CLIENT_CONNECT_FAILED" … }
Failed to list tools from server: { … }
Error: MCP at http://127.0.0.1:19999/mcp exposed 0 tools — is the handyman MCP
server running? Start one with 'handyman mcp --http' (installed bin) or 'node
handyman/dist/mcp.js --http' from a checkout, or point HANDYMAN_MCP_URL at a
live server.
    at connectHandymanMcp (…/dist-bundle/run-feature.mjs:482:11)
exit: 1
```

La resolución de recursos (registry por nombre, templates y catálogo vía el
paquete `handyman-harness` resuelto por el createRequire del propio bundle,
data/logs bajo el `HANDYMAN_ROOT` aislado) pasa completa con node puro y sin
tsx; el fallo es SOLO el connect MCP con mensaje accionable, y el cwd ajeno
queda sin archivos (S4).
