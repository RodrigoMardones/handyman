---
type: Doc
tags: [handyman/topic/migration, handyman/sprint/2026-SP1, handyman/sprint/2026-SP2]
updated: 2026-07-16
---

# Plan de Migracion: Python + Bash → TypeScript sobre Node

Documento de trabajo del sprint **2026-SP1**. Roadmap ordenado para mudar la skill
Handyman de Python + Bash a TypeScript ejecutado sobre Node, **preservando el contrato
de CLIs ("ordenes") y manteniendo verdes los tests** en todo momento.

Fuente de datos del inventario y los riesgos: `backlog/explore_migration_surface.md`
(exploracion read-only del 2026-07-15). Invariantes de arquitectura:
`docs/architecture.md`. Convenciones actuales/objetivo: `docs/conventions.md`.

## 1. Decisiones fijadas (2026-07-15)

| Decision | Eleccion | Consecuencia |
|----------|----------|--------------|
| Runtime objetivo | **Node primero (ecosistema npm)** | Node LTS, `tsc` + build, `vitest`, `ajv`. Loop de dev con `tsx` opcional. |
| Artefactos Bash (`init.sh`, `scaffold.sh`) | **Se mantienen en Bash** | Los repos destino no necesitan runtime JS para verificar; `init.sh` sigue siendo el oraculo black-box y lo ejecuta `feature done`. Solo migra la logica Python. |
| Invocacion / distribucion | **Compilar a `dist/*.js`, correr `node dist/x.js`** | Se agrega paso de build y se publica `dist/` con la skill. Las referencias `python3 scripts/x.py` en SKILL.md/references pasan a `node dist/x.js`. |

## 2. Estrategia: Strangler Fig + Oraculo de Paridad

No hay big-bang. Se migra **un script a la vez**, y en cada paso:

1. Se escribe el gemelo TS (`src/x.ts`) apoyado en el `core` compartido.
2. Se compila a `dist/x.js`.
3. Se **repunta la suite black-box** de ese script (`tests/test_x.sh`) al nuevo
   entrypoint `node dist/x.js` (cambio de una linea; ver seccion 6).
4. La suite debe quedar **verde sin tocar las aserciones**: es el oraculo de paridad.
5. Se **elimina el original Python** (sin dual-maintenance silencioso) y se actualizan
   sus referencias en `SKILL.md` / `handyman/references/`.

El insight clave: los tests black-box en bash invocan cada CLI por subproceso
(`python3 $SCRIPT --root $T`) y **nunca importan Python**, asi que son
runtime-agnosticos. Son exactamente lo que garantiza "que los tests y ordenes se
mantengan": si pasan apuntados a Node, el contrato se preservo.

## 3. Contrato invariante (lo que la migracion NO puede cambiar)

- **Superficie de CLI**: subcomandos, flags, posicionales de cada script.
- **Exit codes**: convencion `0` ok, `1` error, `2` usage, `3` sin trabajo listo
  (`feature ready`). El `2` de usage viene de la semantica de `argparse` → hay que
  reproducirlo (ver riesgos).
- **Forma de stdout**: p.ej. ultima linea `status: ok|warn|error` (+ `next:` hint),
  payloads `--json`. Los tests fijan esto con grep.
- **Bytes de los archivos de estado**: `feature_list.json`, `progress/*.md`,
  `sprint.<id>.md`, `index.md`. Ver riesgo de `ensure_ascii`.
- **Una feature a la vez**; `additionalProperties:false` en el schema de estado.

## 4. Inventario y orden de migracion

12 scripts Python (3881 LOC) + 2 artefactos Bash. Unica dep externa Python:
`jsonschema` → se reemplaza por **`ajv`** sobre los mismos `assets/schemas/*.json`.

| # | Script | LOC | Oraculo (test) | Riesgo | Fase |
|---|--------|-----|----------------|--------|------|
| — | `validate_harness.py` (helpers) | 365 | via otros + test_docs | **Core**: `resolve_workspace` lo importan 8 modulos | Core (SP1) |
| 1 | `index_md.py` | 170 | `test_index.sh` | Bajo (generador) → **SPIKE** | SP1 |
| 2 | `metrics.py` | 193 | `test_metrics.sh` | Medio: `%` half-even, `--json` ensure_ascii | SP2 |
| 3 | `backlog.py` | 167 | `test_backlog.sh` | Bajo | SP2 |
| 4 | `feature.py` | 631 | `test_feature.sh` | **Alto**: maquina de estados; corre `bash init.sh` en `done` | SP2 |
| 5 | `sprint.py` | 429 | `test_sprint.sh` | Alto: importa `metrics`; deriva doc de sprint | SP3 |
| 6 | `validate_harness.py` (CLI) | — | `test_*` | Medio | SP3 |
| 7 | `preflight.py` | 170 | `test_preflight.sh` | **Alto**: lanza 5 hermanos via subprocess | SP3 |
| 8 | `update_harness.py` | 484 | `test_update.sh` | Alto: `difflib.unified_diff` | SP3 |
| 9 | `upgrade_harness.py` | 329 | `test_upgrade.sh` | Alto: `difflib`, jq-en-test | SP3 |
| 10 | `tools_discovery.py` | 465 | `test_tools_discovery.sh` | Alto: `declare` usa ensure_ascii=True; `difflib` | SP4 |
| 11 | `evals.py` | 308 | `test_evals.sh` | Alto: `shlex.split`, `:.2f` half-even | SP4 |
| — | `scaffold.sh` | 170 | — | **Se queda en Bash** | — |
| — | `assets/init.template.sh` | — | `test_init.sh` + fixture | **Se queda en Bash** (de-jq → node en cutover) | — |

Cadena de dependencia mas profunda: `sprint → metrics → tools_discovery → validate`.
Por eso el `core` (resolve_workspace + IO + schema) se construye primero.

## 5. Registro de riesgos de portabilidad (verificados)

1. **Redondeo half-even (banker) — divergencia REAL.** Python `round()` / `f"{x:.Nf}"`
   redondean al par (`{2.5:.0f}`→2, `{0.125:.2f}`→0.12); JS `toFixed`/`Math.round`
   redondean half-up (→3, →0.13). Afecta `metrics.py` (% de aprobacion) y `evals.py`
   (todos los `:.2f`). Los tests actuales usan valores limpios y pasan de ambas formas,
   pero para paridad real hace falta un **formateador half-even** en el `core`.
2. **`ensure_ascii`.** Casi todo escribe `json.dumps(indent=2, ensure_ascii=False)+"\n"`,
   que es **byte-identico** a `JSON.stringify(x,null,2)+"\n"` (de-riesgado). Excepciones:
   `tools_discovery declare` y `metrics --json` usan `ensure_ascii=True` (escapan no-ASCII)
   → el port debe replicar el escape en esos dos casos.
3. **Idioms sin equivalente en stdlib**: `difflib.unified_diff` (dry-run de
   update/upgrade/declare), `shlex.split` (runner de `evals`), semantica de exit-**2** de
   `argparse`, y `{value!r}` (repr) en salidas. Requieren shim/vendor en el `core`.
4. **Grafo invisible en runtime**: `preflight` lanza 5 hermanos via `sys.executable`;
   `feature done` corre `bash init.sh`. No hay analogo directo en TS → usar
   `child_process` y **mantener el mismo texto de bloque** que los tests grepean.
5. **`init.template.sh` es el oraculo**: `test_init.sh` + `tests/fixtures/init.reference.sh`
   lo caracterizan, y `feature done` lo ejecuta. No se porta; solo se le quita `jq`.

## 6. Mecanica del oraculo de paridad

Cada `tests/test_x.sh` hoy invoca el script asi (aprox):

```bash
python3 "$SCRIPTS/x.py" --root "$T" <args>
```

El repunte por script es un cambio de una linea, parametrizando el invocador:

```bash
# antes:  RUN=(python3 "$SCRIPTS/index_md.py")
# despues: RUN=(node "$DIST/index_md.js")
"${RUN[@]}" --root "$T" <args>
```

Regla: **nunca** se "adapta" la asercion para que pase; se reproduce el contrato
byte-a-byte. Si un test necesita cambiar, es un bug del port, no del test.

## 7. Roadmap por sprints

- **SP1 — De-riesgar el experimento (CERRADO 2026-07-16, veredicto GO).** Toolchain Node +
  build + vitest + ajv; verificador self-contained (sin jq/shellcheck); `core` TS (workspace,
  IO, schema, utils de paridad); **spike** portando `index_md` end-to-end con paridad
  byte-a-byte. Los 4 criterios de exito se cumplieron con evidencia verificada. Detalle:
  `docs/current/go-no-go-sp1.md`; periodo archivado en `docs/sprints/sprint.2026-SP1.md`.
- **SP2 — Hojas + maquina de estados (activo).** `metrics`, `backlog`, `feature`. Parametrizar
  todas las suites black-box. Primer contacto con half-even (`metrics`) y con el
  subprocess de `feature done`.
- **SP3 — Periodo + orquestacion.** `sprint`, `validate_harness` (CLI), `preflight`
  (fan-out), `update_harness`, `upgrade_harness` (`difflib`).
- **SP4 — Discovery + cutover.** `tools_discovery`, `evals`. Luego el **cutover**:
  reescribir invocaciones en `SKILL.md`/`references`, quitar Python, CI single-track
  (Node), publicar `dist/`, y quitar `jq` de `init.template.sh` (→ `node`).

## 8. Sprint 2026-SP2 (activo)

Abierto 2026-07-16 tras el GO de SP1. El `core` ya existe en la rama de integracion, asi que
las tres son hojas paralelizables (sin `depends_on` que las bloquee).

| id | feature | riesgo | estado |
|----|---------|--------|--------|
| 5 | `metrics` | Medio: half-even (%), `--json` ensure_ascii=True | pending |
| 6 | `backlog` | Bajo | pending |
| 7 | `feature_state_machine` | Alto: maquina de estados; `done` corre `bash init.sh` | pending |

Trabajo listo ahora (`feature ready`): **5, 6, 7** (las tres). Criterios de aceptacion completos
en `feature_list.json`. SP1 (features 1–4) quedo archivado en
`archive/feature_archive.json` + `docs/sprints/sprint.2026-SP1.md`.

## 9. Definicion de "experimento exitoso" (go/no-go tras SP1)

Se declara viable la migracion completa si, al cerrar SP1:

- El `core` TS reproduce resolucion de workspace + IO byte-identico + validacion ajv,
  con tests unitarios verdes.
- `index_md` corre en Node y su suite black-box pasa **sin editar aserciones**.
- El verificador `./init.sh` queda verde en un entorno **sin jq ni shellcheck**.
- El costo/tiempo observado del port de 1 script permite estimar los 11 restantes.

Si algun riesgo de la seccion 5 resulta mas caro de lo previsto (p.ej. `difflib` o el
fan-out de `preflight`), se re-evalua el alcance antes de SP2, no despues.

## 10. Referencias

- Exploracion del surface: `backlog/explore_migration_surface.md`
- Arquitectura e invariantes: `docs/architecture.md`
- Convenciones (actual/objetivo): `docs/conventions.md`
- Verificacion y oraculos: `docs/verification.md`
