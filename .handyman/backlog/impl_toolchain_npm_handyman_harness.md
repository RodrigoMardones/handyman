---
type: Implementation Log
feature: toolchain_npm_handyman_harness
status: implemented
role: implementer
updated: 2026-07-19
tags: [handyman/role/implementer, handyman/feature/toolchain_npm_handyman_harness]
---

# Implementation Report: toolchain_npm_handyman_harness

Sigue el veredicto de [[explore_npm_pack_64]] (variante A: bundle esbuild,
bin único, 3.0.0). Decisiones humanas registradas en la sesión 2026-07-19:
nombre `handyman-harness` (2.0) y **no publicar hasta OK explícito del
humano** — el gate es tests verdes en local y en GitHub Actions (2.4:
auto-firma con scan de secretos del tarball).

## Files Changed

- `handyman/src/cli.ts` (nuevo): dispatcher `handyman <verbo>` sobre los 12
  verbos; re-apunta `process.argv` al módulo del verbo antes del import
  dinámico, así el entry guard de cada CLI observa el mismo argv que
  `node dist/<verbo>.js`. Aditivo: las suites bash siguen llamando al dist
  directo.
- `handyman/scripts/pack_npm.mjs` (nuevo): staging en
  `handyman/.pack-staging/` — esbuild (`bundle`, `platform=node`,
  `format=esm`, `external:vis-network`, banner `createRequire` para ajv CJS)
  sobre los 22 entrypoints de `src/`, manifest de publish derivado del
  `package.json` del repo (nombre `handyman-harness`, sin `private`, `bin`
  único, `files: [dist, assets, NOTICE]`, única dependency `vis-network`),
  copia assets/README.npm/LICENSE/NOTICE, `npm pack --json` y guards de
  inventario ejecutables (sin `.env`, sin `workspace:*`, 12 verbos + cli).
- `handyman/src/core/schema.ts`: **bug real que el laboratorio no pescó** —
  `readSchema` resolvía `../../assets` relativo a `import.meta.url`, correcto
  en `dist/core/` (tsc) pero roto en el bundle npm que aplana el módulo a
  `dist/<verbo>.js` (la ruta escapaba del paquete: ENOENT en el smoke). Fix:
  sondear `../../assets` y `../assets` antes de rendirse. El dist tsc y
  vitest no cambian de comportamiento.
- `handyman/package.json`: versión 2.1.1 → **3.0.0** (distingue el estado
  post-split; `update_harness` compara semver), script `pack:npm`, devDep
  `esbuild ^0.28.1`. El paquete del repo sigue `private: true` — el manifest
  publicable existe solo en staging.
- `handyman/README.npm.md` (nuevo): README del tarball (npm lo renombra a
  README.md en staging).
- `tests/test_npm_pack.sh` (nuevo) + registro en `tests/run_tests.sh`: 12
  casos — inventario del tarball, manifest de publish, y smoke fuera del
  monorepo (workspace vacío, cero node_modules: `feature ready` exit 3
  drenado, dispatcher contrato idéntico, verbo inválido exit 2, toolbox
  usage exit 0). Offline por diseño; corre en local (init.sh) y en CI
  (run_tests.sh) sin tocar ci.yml.
- `pnpm-workspace.yaml`: `allowBuilds: esbuild: true` (nota 5 del explore).
- `.gitignore`: `handyman/.pack-staging/`.

## Design Notes

- Tarball: **788.6 kB / 3.9 MB unpacked / 54 entradas** (los 53 del lab + el
  dispatcher). Cero `.env`, cero `workspace:*`, cero fuentes `.ts`.
- `npx --yes -p <tarball> handyman feature ready` desde un directorio fuera
  del monorepo (con `.handyman/feature_list.json` vacío) instala el paquete
  con `vis-network` desde el registry y devuelve exit 3 con el output
  correcto — el equivalente exacto de `npx handyman-harness feature ready`
  post-publish.
- Los dos dist conviven: el tsc del repo sigue siendo el oráculo de las
  suites; el bundleado existe solo en staging/tarball.
- `npm publish` queda como acción humana desde `handyman/.pack-staging/`
  (esta máquina no tiene sesión npm: `ENEEDAUTH` verificado 2026-07-19).

## Test Output

```text
npm pack suite (test_npm_pack.sh): Summary: 12 run, 12 passed, 0 failed
shellcheck -S warning tests/test_npm_pack.sh: OK
./init.sh: tools/files/state/lint/build/harness OK, ALL SUITES PASSED, exit 0
scan de secretos del tarball extraído: 0 hits del valor real de Z_AI_API_KEY,
0 hits de patrones sk-*/api_key, 0 entradas .env
```
