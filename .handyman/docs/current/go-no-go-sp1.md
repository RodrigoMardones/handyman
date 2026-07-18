---
tags: [handyman/topic/migration, handyman/sprint/2026-SP1, handyman/decision]
updated: 2026-07-16
---

# Veredicto Go/No-Go — Sprint 2026-SP1

**Decisión: GO.** La migración completa Python + Bash → TypeScript sobre Node se declara
viable. Los cuatro criterios de "experimento exitoso" (plan §9) se cumplieron con evidencia
real, verificada de forma independiente.

## Criterios (plan §9) vs. evidencia

| # | Criterio | Resultado | Evidencia |
|---|----------|-----------|-----------|
| 1 | El `core` TS reproduce resolución de workspace + IO byte-idéntico + validación ajv, con tests unitarios verdes | ✅ | `src/core/` (workspace, featureList, schema, rounding, diff); **59 tests vitest**; save byte-idéntico y `formatHalfEven` re-verificados contra Python (incl. emoji/no-ASCII, `1.005→"1.00"`, `2.675→"2.67"`) |
| 2 | `index_md` corre en Node y su suite black-box pasa **sin editar aserciones** | ✅ | `src/index_md.ts` sobre el core; `test_index.sh` repuntado a `node dist/index_md.js` (solo el invocador); **Index-MOC 6/6**; paridad byte-a-byte IDÉNTICA en 3 fixtures + workspace real (1084 bytes) |
| 3 | El verificador `./init.sh` queda verde en un entorno **sin jq ni shellcheck** | ✅ | Feature #2: de-jq + shellcheck advisory; `bash tests/run_tests.sh` ALL PASSED y `./init.sh` exit 0 sin jq/shellcheck |
| 4 | El costo/tiempo del port de 1 script permite estimar los 11 restantes | ✅ | Ver estimación abajo |

## Costo observado (criterio 4)

- **Core (#3):** un implementer, ~5 archivos + tests, paridad half-even/difflib pineada contra Python. El riesgo #1 (redondeo banker) y #3 (`difflib`) del plan §5 quedaron **resueltos y con tests** en el core — ya no son incógnitas para SP2–SP4.
- **Spike (#4):** un implementer; el patrón strangler (gemelo TS → oráculo byte-idéntico → borrar el `.py`) funcionó **sin fricción** y sin editar una sola aserción.
- **Extrapolación:** los scripts hoja restantes (`metrics`, `backlog`) deberían costar ~1 spike cada uno reusando el core. Los de riesgo alto (`feature`, `sprint`, `preflight`, `update/upgrade`, `tools_discovery`, `evals`) siguen siendo los caros por subprocess fan-out y `difflib`/`shlex`, pero sus utilidades base (half-even, unifiedDiff, IO) ya existen.

## Riesgos que se movieron

- **De-riesgados por evidencia:** half-even (core con tests), `ensure_ascii=False` byte-idéntico (probado con emoji), `difflib.unified_diff` (port con tests), `resolve_workspace` (portado + tests).
- **Aún abiertos (SP3/SP4):** exit-2 de argparse (shim pendiente), `ensure_ascii=True` en `declare`/`metrics --json`, `shlex.split` (evals), subprocess fan-out de `preflight` y `feature done → bash init.sh`.
- **Nuevo, menor:** el toolchain fija TypeScript `^7.0.2` (TS7 preview Go-based) que no auto-incluye `@types/node` → requiere `"types":["node"]` en tsconfig (ya aplicado). Vigilar estabilidad de esa versión.
- **Deuda de infra:** `tests/run_tests.sh` ahora requiere Node + deps instaladas + build (self-building en `test_index.sh`). Documentar en `docs/verification.md` que un checkout limpio necesita `npm ci` antes de la suite.

## Recomendación para SP2

Proceder con SP2 (`metrics`, `backlog`, `feature`) siguiendo el mismo patrón. Primer contacto
real con: half-even en `metrics` (ya cubierto por el core) y el subprocess de `feature done`
(mantener el mismo texto de bloque que los tests grepean, plan §5.4).
