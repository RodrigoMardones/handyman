---
type: Implementation Log
feature: tools_discovery_discovery
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/tools_discovery_discovery]
---

# Implementation Report: tools_discovery_discovery (port #13)

Port de `scripts/tools_discovery.py` (467 LOC) a `src/tools_discovery.ts` sobre el
core compartido. Ultimo CLI Python de la migracion; `scripts/` queda solo con
`scaffold.sh`.

## Files Changed

- `handyman/src/tools_discovery.ts` (nuevo, ~970 LOC) — port fiel de list/find/check/declare
  reusando el core (`resolveWorkspace`, `PLATFORM_ROLE_DIRS`, `parseFrontmatter`,
  `unifiedDiff`, `validateHarnessConfig`).
- `handyman/src/preflight.ts` — bloque discovery repuntado de
  `python3 scripts/tools_discovery.py check` a `node dist/tools_discovery.js check`
  (+ docstrings; era la unica dependencia viva del .py).
- `tests/test_tools_discovery.sh` — SUT repuntado a `node dist/tools_discovery.js`
  (16 invocaciones `python3 "$TD"` -> `node "$TD"`; var `TD` -> `dist/tools_discovery.js`;
  header). 0 aserciones editadas; los `python3 -c` JSON helpers se conservan.
- `tests/test_docs.py` — 3 aserciones pinneadas repuntadas de `tools_discovery.py`
  a `tools_discovery.js` (discovery.md cataloga, examples.md verifica skills,
  feature-request template ata Tools>skills).
- `handyman/references/discovery.md`, `workflow.md`, `templates.md`, `examples.md`,
  `README.md`, `anatomy.md` — referencias activas repuntadas a `node dist/tools_discovery.js`
  (+ nueva fila `src/tools_discovery.ts` en la tabla CLI de anatomy.md).
- `handyman/assets/feature-request.template.md` — 2 comentarios repuntados a
  `node dist/tools_discovery.js check`.
- `handyman/scripts/tools_discovery.py` — eliminado (`git rm`).
- `handyman/scripts/_resolve_compat.py` — eliminado (`git rm`); era el shim temporal
  que restauraba `resolve_workspace`/`PLATFORM_ROLE_DIRS` para los 3 hermanos Python
  (preflight, upgrade_harness, tools_discovery). Los 3 ya estan porteados -> deuda saldada.

## Design Notes

- **ensure_ascii=True** (riesgo #13): el Python `cmd_declare` y los `--json` de
  list/find usan `json.dumps(data, indent=2)` con el DEFAULT `ensure_ascii=True`
  (a diferencia de `saveFeatureList`, que usa `ensure_ascii=False`). Se anadio un
  serializador propio `asciiStringify`/`quoteAscii` que escapa no-ASCII como
  `\uXXXX` minuscula (surrogates UTF-16 para astrales, natural al iterar code units
  de JS). Verificado byte-identico con nombres/descripciones unicode (`café`, `niño`,
  `©`, `“comillas”`, `—`).
- **difflib -> core/unifiedDiff**: `declare --dry-run` usa `unifiedDiff(keepEndsLines(old), keepEndsLines(new), {fromFile, toFile})`
  donde `keepEndsLines` replica `str.splitlines(keepends=True)` (maneja `\n`, `\r\n`, `\r`).
- **argparse paridad (subparsers)**: se derivo empiricamente la regla de prog/usage:
  `unrecognized arguments` (opcion o extra posicional) lo emite el parser GLOBAL
  (uso global de 2 lineas + `prog:`); `the following arguments are required` /
  `invalid choice` lo emite el SUBPARSER (`usage: PROG <cmd> ...` + `PROG <cmd>: error:`).
  El prog se fija en `"tools_discovery.py"` (convencion de paridad de los otros ports;
  el oraculo y la paridad normalizan prog). `looksLikeOption` replica el fix
  espacio-en-arg y `_negative_number_matcher`.
- **schema validation**: `declare` valida via `validateHarnessConfig` (ajv). Los mensajes
  ajv no son byte-identicos a jsonschema, pero el oraculo no los aserta (mismo precedente
  que #9/#14).
- **skill/agent glob**: `*/SKILL.md` y `*.agent.md` se replican con `readdirSync` + sort
  por path string (Python `sorted(root.glob(...))`); first-occurrence-wins por nombre;
  salida final ordenada por nombre. local-then-global con `$HANDYMAN_SKILL_ROOTS`
  (`:`-separated) o defaults `~/...`.

## Test Output

```text
PARITY (twin fixture, py vs node, 20 escenarios): ALL CASES BYTE-IDENTICAL
  list / list --json / list --json (unicode) / list (unicode plain)
  find FIRST / find café (unicode)
  check (all-present / missing skill / unicode declared / mcp / agents-gate / no-discovery)
  declare (append / dry-run / dup-rejected / creates-block / unicode name)
  usage errors (no subcommand / bad kind / find missing keyword)

Gates (handyman/):
  typecheck: 0   vitest: 7 files / 77 tests   lint: 0 (23 warnings pre-existing en feature.ts)   build: 0

Project root:
  bash tests/run_tests.sh: ALL SUITES PASSED
  ./init.sh: exit 0
  tests/test_tools_discovery.sh: 16 run, 16 passed, 0 failed
  tests/test_preflight.sh: 11 run, 11 passed, 0 failed
```

## Verifier

`./init.sh` exits 0. Migracion completada: 0 CLIs Python restantes en `scripts/`.
