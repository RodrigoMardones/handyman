---
type: Explore Report
feature: toolchain_npm_handyman_harness
status: explored
role: explorer
updated: 2026-07-19
tags: [handyman/role/explorer, handyman/feature/toolchain_npm_handyman_harness]
---

# Explore Report: empaquetado npm para la feature 64

Experimentos corridos el 2026-07-19 en un clon limpio (branch de laboratorio
`lab/npm-pack-64`, script `scratchpad/lab_pack_64.sh`), sin tocar el arbol de
trabajo. Responde las tres preguntas del handoff-2026-07-19b §2.2.

## Veredicto: bundlear toolbox-core con esbuild (variante A)

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Bundle o dos paquetes? | **Bundle (esbuild)** | Tarball A: 791.7 kB / 53 archivos, autocontenido; smoke fuera del monorepo verde. Variante B exige poseer el scope npm `@handyman` (el dist compilado importa el especificador literal `@handyman/toolbox-core/registry`) o renombrar imports en todo src, y son dos publishes para un core cuyo unico otro consumidor (apps/web) vive en el monorepo |
| ¿Un bin o 12? | **Uno** (`handyman <verbo>`) | Las suites bash invocan `node dist/<verbo>.js` directo (grep en tests/): el dispatcher es aditivo, no rompe el oraculo |
| ¿Version? | **3.0.0** | El snapshot instalado y la rama dicen 2.1.1 siendo estados incompatibles; `update_harness` compara semver y necesita distinguirlos |

## Medidas de la variante A

- `esbuild src/*.ts` (21 entrypoints, sin tests) `--bundle --platform=node
  --format=esm --external:vis-network` + banner `createRequire`: 3.7 MB de
  dist bundleado, 21 archivos. Los mayores: toolbox_state.js 348K,
  toolbox.js 340K, feature.js 292K.
- `npm pack --dry-run` con staging (`files: ["dist", "assets"]`, sin
  workspace deps, `dependencies: { vis-network }`): **791.7 kB tarball,
  3.9 MB unpacked, 53 archivos, cero `.env`, cero `workspace:*`**.
- Smoke fuera del monorepo (directorio con `.handyman/feature_list.json`
  vacio, sin node_modules): `feature.js ready` exit 3 con output correcto
  (backlog drenado = resolucion completa funciona), `toolbox.js` usage exit 0
  (el import del core bundleado resuelve).

## Notas para el implementador de la 64

1. **Banner CJS obligatorio**: ajv es CommonJS; el output ESM de esbuild
   necesita `--banner:js="import { createRequire } from 'node:module'; ..."`
   o revienta en runtime con `require is not defined`.
2. **vis-network queda external y como dependency normal**: toolbox_assets.ts
   no importa su codigo, resuelve `vis-network/standalone/umd/vis-network.min.js`
   desde node_modules para servirlo same-origin. Con npx/instalacion global la
   dependencia declarada garantiza que este.
3. **El orphan `dist/toolbox_serve.js` muere gratis**: no existe
   `src/toolbox_serve.ts`, el bundle produce exactamente 21 archivos sin el.
   Empaquetar desde un staging fresco (prepack) y no desde el dist del repo.
4. **Dos dists conviven**: el dist tsc del repo sigue siendo el oraculo de las
   suites bash; el dist bundleado existe solo dentro del tarball (prepack a
   staging). No pisar el uno con el otro.
5. **pnpm 10+ bloquea el postinstall de esbuild** (`approve-builds`); el
   binario funciona igual via optionalDependencies de plataforma, pero si el
   build de prepack corre en CI hay que aprobar esbuild en
   `pnpm-workspace.yaml` (`onlyBuiltDependencies`).
6. **files whitelist**: `["dist", "assets"]` deja fuera `.env`,
   `skills-lock.json` y `src/` sin lineas extra. npm agrega solos
   package.json, README y LICENSE.
7. **Nombre**: `handyman-harness` seguia libre en npm al 2026-07-19 (npm view
   da 404); `handyman` sigue tomado (0.0.1, modificado 2022). La reserva del
   nombre es la accion humana 2.0 del handoff y bloquea el cierre de la 64.
