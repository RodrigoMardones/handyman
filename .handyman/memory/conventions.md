---
type: Doc
---

# Code Conventions

> El repo esta en migracion **Python + Bash -> TypeScript + Bun/Node**. Esta seccion
> documenta las convenciones **actuales** (que siguen vigentes hasta que un script se
> migre) y las **objetivo** (TS). Un script migrado sigue las convenciones TS; uno no
> migrado sigue las de Python.

## Language And Runtime

**Actual (Python):**
- Version: Python 3.12 (CI). `from __future__ import annotations` en todos los scripts.
- Solo stdlib (`argparse`, `json`, `pathlib`, `re`, `subprocess`, `datetime`,
  `shutil`, `difflib`, `shlex`) + `jsonschema` como unica dep externa.
- Naming: `snake_case` funciones/vars, `SCREAMING_SNAKE` constantes.
- Cada script es un CLI con `argparse`, docstring de uso, y bloque `main()`.

**Actual (Bash):** `set -u`; pasa `shellcheck -S warning`; `init.template.sh` y
`scaffold.sh` portables (POSIX-ish), sin bashisms innecesarios.

**Objetivo (TypeScript):**
- TypeScript estricto (`strict: true`), ESM.
- Runtime primario **Node** (LTS, `engines.node >=20`), decidido en `ts_toolchain_foundation`
  (2026-SP1): build con `tsc` a `dist/`, test runner **vitest**. Evitar APIs exclusivas de un
  runtime en la logica de core.
- Naming: `camelCase` funciones/vars, `PascalCase` tipos, `SCREAMING_SNAKE` constantes.
- Formatter/linter: **Biome** (decidido en `ts_toolchain_foundation`, 2026-SP1): un unico
  binario para format + lint, rapido, preset `recommended`, 2 espacios, comillas dobles,
  organize-imports. Config en `handyman/biome.json`. Descartado ESLint + Prettier (dos
  herramientas + mas config para el mismo resultado).
- Validacion de schema con `ajv` sobre los mismos `assets/schemas/*.json`.

## Tests

- **Test path pattern:** `tests/` en el root. Hoy: `tests/test_*.sh` (black-box) +
  `tests/test_docs.py`. Runner: `tests/run_tests.sh`.
- **Los tests black-box en bash son el ORACULO DE PARIDAD.** Invocan cada CLI y
  verifican stdout/stderr/exit code. Son runtime-agnosticos: al migrar un script a TS,
  su suite bash debe seguir verde apuntada al binario/entrypoint TS. Esto es lo que
  garantiza "que los tests y ordenes se mantengan".
- **Test naming:** `test_<script>.sh` (uno por script/area).
- **Fixtures:** `tests/fixtures/`, helpers en `tests/lib/assert.sh`.
- **Reales vs mocks:** los tests ejercitan los CLI reales sobre un `HARNESS_WORKSPACE`
  temporal; no mockear el comportamiento de nucleo que debe probarse.
- **Objetivo:** agregar tests unitarios TS (`bun test` o vitest) para el `core`, SIN
  eliminar las suites black-box mientras exista el par Python/TS.

## Error Handling

- Errores de dominio y de uso se distinguen por **exit code** (`1` error, `2` usage,
  `3` sin trabajo listo). Mensajes a stderr; salida util a stdout.
- Forma de observacion estable: p.ej. ultima linea `status: ok|warn|error` o `--json`.
- No cambiar la semantica de exit codes al portar.

## Comments

Preferir nombres claros. Comentar solo el razonamiento no obvio (como ya hacen los
scripts Python actuales, con comentarios de intencion sobre cada `check_*`). Los docs
del proyecto (`docs/`, `README.md`) estan en espanol; mantener ese idioma.

## Analysis Documents (regla unica, F1 del rework de capas)

Un analisis vive en exactamente un lugar segun su estado, nunca en varios:

- **En vuelo:** `$HARNESS_WORKSPACE/backlog/explore_<topic>.md` (formato del
  asset `backlog-explore.template.md`). Es el unico hogar para investigacion
  activa; el chat solo lleva la referencia.
- **Durable de producto:** `docs/` del repo, solo para documentos que un
  lector futuro necesita para operar el producto (p. ej.
  `mapa-entidades-negocio.md`, plantillas de PR). Un analisis se "gradua" a
  `docs/` unicamente si deja de ser investigacion y pasa a ser referencia.
- **Cumplido:** `docs/archive/` cuando el trabajo que motivo el analisis ya
  cerro. Los comentarios de codigo que citan un analisis como procedencia
  apuntan a `docs/archive/analisis-*.md`.
- El grafo de graphify es la capa de contexto sobre todo lo anterior:
  `preflight` avisa (`context: NOTE`) cuando `graphify-out/graph.json` es mas
  viejo que el ultimo commit; refrescarlo (`/graphify --update`) es parte del
  cierre de rama, no de cada feature.
