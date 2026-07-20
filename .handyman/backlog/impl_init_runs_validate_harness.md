---
type: Implementation Log
feature: init_runs_validate_harness
status: implemented
role: implementer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/implementer, handyman/feature/init_runs_validate_harness]
---

# Implementation Report: init_runs_validate_harness

## Files Changed

- `init.sh` — `run_validate_harness()` nueva; `run_phase "harness"` insertada entre
  `build` y `test`.
- `handyman/assets/init.template.sh` — el mismo par, con `dist/` resuelto en el root
  del harness instalado (no bajo `handyman/`).
- `tests/test_init.sh` — helpers `copy_validator` y `phys_tmp`; casos T25-T28.
- `.handyman/docs/verification.md` — el bloque de Required Commands documentaba
  «Orquesta: validate -> lint -> build -> test», una fase `validate` que no existía.
  Ahora lista las siete fases reales y explica por qué `harness` es silenciosa.

## Corrección al diagnóstico del plan

El plan dice que los advisories de las features 52 y 55 «llegan sólo por
`check_preflight`, no bloqueante y a stderr». La primera mitad es cierta; conviene
precisar la segunda, porque decide el diseño:

**`preflight` ya corría `validate_harness`** — es su fase `format`
(`preflight.ts:157-159`) — **y sí imprime su salida completa**, NOTEs incluidos,
indentada bajo `--> format`. Verificado: 70 líneas `NOTE:` en la salida de
`preflight` sobre este repo.

O sea: los advisories **sí llegaban**. Lo que faltaba era la **compuerta**:
`check_preflight` invoca preflight con `|| true`, y preflight siempre sale 0 por
contrato (es un reporte read-only). Un gap bloqueante encontrado por el validador
no podía hacer fallar `./init.sh`.

Esto redefine la bala 3 («no imprimir los NOTEs dos veces») de un problema
hipotético a uno real: sin cuidado, la fase nueva duplicaría las 70 líneas.

## Design Notes

- **La fase es silenciosa en éxito, y ésa es la resolución de la bala 3.** Imprime
  sólo cuando el validador falla. `check_preflight` sigue intacto y sigue siendo el
  canal de los advisories. Separación limpia: la fase se queda con el exit code,
  preflight con el texto. Cero duplicación, cero cambio en `preflight.ts` — que
  importa, porque `feature.js start` también lo llama (`runPreflight`) y recortarle
  la fase `format` habría degradado el reporte de inicio de trabajo.
- **Va después de `build`** para que `dist/` esté fresco; antes no existiría en un
  checkout limpio.
- **Salta con 0 cuando falta `dist/` o `node`**, igual que `check_preflight`. Un
  verificador que explota por no estar compilado todavía no es una compuerta, es un
  bloqueo.
- **Sin gaps bloqueantes nuevos en este repo.** `validate_harness` sale 0 sobre
  `.handyman` hoy: 70 NOTEs, ningún gap. El efecto secundario que el plan anticipaba
  («va a empezar a imprimir NOTEs») ya ocurría por preflight, así que la fase no
  cambia nada visible salvo el exit code potencial.

## Dos hallazgos sobre el entry guard, encontrados escribiendo los tests

Los cuatro CLIs (`validate_harness`, `preflight`, `update_harness`,
`upgrade_harness`) guardan su entrada con
`import.meta.url === file://${process.argv[1]}`. Cuando no coinciden, `main()` no
corre y el proceso **sale 0 sin imprimir nada**. Dos formas de provocarlo:

1. **Invocarlos a través de un symlink.** `import.meta.url` es la ruta real,
   `argv[1]` la del symlink. El comentario en `preflight.ts:357-365` asume que estos
   CLIs «nunca se alcanzan por symlink», y con eso el guard alcanza — pero el modo de
   falla es silencioso y con exit 0, que es el peor par posible para una compuerta.
2. **En macOS, cualquier fixture bajo `mktemp -d`.** Devuelve `/var/...`, y `/var`
   es symlink a `/private/var`: mismo desajuste.

Ambos me hicieron pasar tests en falso antes de detectarlos (ver el review). Los
helpers `copy_validator` (copia `dist/` en vez de enlazarlo) y `phys_tmp`
(`cd … && pwd -P`) existen por esto, con el porqué escrito al lado.

**No se cambió el guard.** Está fuera del alcance de esta feature y es una decisión
documentada. Queda anotado como deuda: un exit 0 mudo es un mal contrato para un
binario que participa de un gate.

## Cómo se testeó la fase, y por qué así

`tests/test_init.sh` nunca corre el `./init.sh` real — lo haría recursivamente sobre
su propia suite. Los casos existentes prueban el contrato contra
`tests/fixtures/init.reference.sh`, una implementación de referencia mínima que no
tiene fases.

T25-T27 extraen `run_validate_harness` **del `init.sh` real** con `sed` y la ejecutan
contra fixtures. Así la aserción cae sobre código de producción y no sobre una copia
que pueda derivar, sin pagar la recursión. T25 (gap bloqueante -> falla, nombra el
gap) y T26 (deuda de evidencia -> verde y silenciosa) son las dos direcciones que la
bala 5 pide; T27 cubre el skip; T28 fija la plantilla.

## El gate rechazó el primer intento de cierre

`feature.js done` salió 1 en la primera pasada: la fase **`lint`** falló con
`SC2034: PROJECT_ROOT appears unused` en `tests/test_init.sh:588`. Shellcheck no ve
a través del `eval` que trae `run_validate_harness`, así que las tres asignaciones de
`PROJECT_ROOT` le parecen escrituras muertas.

Resuelto declarándolas `export PROJECT_ROOT=…`, que además describe mejor lo que
pasa: la variable la consume código traído de otro archivo, no el bloque que la
asigna. `shellcheck -S warning tests/test_init.sh` queda limpio.

Vale la pena que quede escrito: la feature es «el verificador propio corre el
validador», y el propio verificador rechazó el primer cierre — por una fase distinta
y sobre el código de test de esta misma feature.

## Test Output

```text
tests/test_init.sh
  PASS init.sh: the harness phase is wired into the blocking phase list
  PASS init.sh: a blocking harness gap fails the phase and reports it
  PASS init.sh: evidence debt alone keeps the phase green and silent
  PASS init.sh: the harness phase skips cleanly when dist/ is absent
  PASS init.template.sh carries the same blocking harness phase

Summary: 27 run, 27 passed, 0 failed

bash tests/run_tests.sh -> ALL SUITES PASSED
./init.sh                -> ==> harness / harness: OK / VERIFIER: all gates passed
```
