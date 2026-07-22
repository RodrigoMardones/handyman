---
type: Review Log
feature: init_runs_validate_harness
status: approved
role: reviewer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/init_runs_validate_harness]
---

# Review: init_runs_validate_harness

## Verdict

APPROVED

## Advertencia de procedencia

Mismo actor que el `impl_`, declarado en ambos. El NOTE de colisión de la feature 55
se dispara — y ahora lo hace **dentro de la fase que esta feature agregó**, que es la
primera vez que el advisory corre en el gate propio del repo y no sólo en el tramo
advisory.

## Stage 1: Spec Compliance

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope
- [x] The implementation report exists and matches what changed

1. **Fase propia y bloqueante.** `run_phase "harness" run_validate_harness` entre
   `build` y `test`. T25 comprueba que un gap bloqueante hace fallar la fase
   nombrándolo; el caso de wiring comprueba que está en la lista de ejecución y no
   huérfana.
2. **Advisories sin cambiar el exit code.** Se cumple por vía de `check_preflight`,
   que sigue imprimiendo la salida completa del validador (70 NOTEs sobre este repo,
   verificado). La acceptance pide «igual que hoy hacen por preflight», y siguen
   haciéndolo por preflight, exactamente igual.
3. **Sin doble impresión.** La fase es silenciosa en éxito. T26 lo fija de forma
   fuerte: exige exit 0 **y salida vacía**.
4. **La plantilla hereda el cambio.** T28 comprueba las tres cosas que pueden
   divergir: que la función exista, que esté cableada como fase, y que resuelva
   `dist/` en el root del harness instalado y no bajo `handyman/` — la ruta difiere
   en la plantilla, y copiar la del repo habría sido el error natural.
5. **Las dos direcciones testeadas.** T25 y T26.
6. **Gate verde.** `./init.sh` -> `harness: OK` + `VERIFIER: all gates passed`;
   `run_tests.sh` -> ALL SUITES PASSED.

Se acepta la corrección del `impl_` al diagnóstico del plan: `preflight` ya corría el
validador **y ya imprimía sus NOTEs**. Lo que faltaba era la compuerta, no la
visibilidad. Está verificada (70 líneas `NOTE:` en la salida de preflight) y mejora
la feature: es lo que hace que la bala 3 sea un requisito real y no decorativo.

## Hallazgos

**Ninguno abierto contra el código entregado.** Pero el camino hasta acá tuvo dos
falsos verdes que merecen quedar escritos, porque son el modo de falla que este
harness existe para evitar:

1. **Fixture con `dist/` enlazado por symlink.** El entry guard
   `import.meta.url === file://${process.argv[1]}` falla, `main()` no corre, y el
   proceso sale **0 sin imprimir nada**. T26 y T27 —que esperan «exit 0 y salida
   vacía»— pasaron en verde sin haber ejecutado el validador ni una vez.
2. **`mktemp -d` en macOS.** Devuelve `/var/...`, y `/var` es symlink a
   `/private/var`. Mismo desajuste, mismo falso verde, ya sin symlink explícito.

Los dos se detectaron sólo porque T25 —el caso que espera un **fallo**— seguía en
rojo. Un caso negativo salvó a dos positivos. Es el argumento a favor de exigir las
dos direcciones, como la acceptance hacía.

Las mitigaciones (`copy_validator`, `phys_tmp`) llevan el porqué escrito al lado, así
que el próximo que escriba un fixture acá no vuelve a caer.

## Deuda registrada, fuera de alcance

**El entry guard sale 0 en silencio cuando no matchea.** Afecta a
`validate_harness`, `preflight`, `update_harness` y `upgrade_harness`. Hoy es
inofensivo porque los invocadores usan rutas literales, y `preflight.ts:357-365` lo
documenta como asunción deliberada. Pero un binario que participa de una compuerta y
cuyo modo de falla es «exit 0, sin salida» es un contrato frágil: si algún día un
invocador pasa por un symlink, el gate se pone verde sin verificar nada y nadie se
entera. No se tocó — fuera de alcance, y la asunción está escrita. Queda nombrado
para que se decida, no para que se olvide.

## Stage 2: Code Quality

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

- **Sin deps nuevas**; sin cambios en TypeScript. Todo el cambio es shell más tests.
- **`preflight.ts` no se tocó**, y era la tentación obvia (recortarle la fase
  `format` para evitar la duplicación). Habría degradado `feature.js start`, que
  llama al mismo preflight. Resolverlo del lado del consumidor fue lo correcto y lo
  más barato.
- **El skip cuando falta `dist/` o `node` copia el patrón de `check_preflight`**, no
  inventa uno nuevo.
- **Los tests se apoyan en el `init.sh` real**, extrayendo la función con `sed` en
  vez de reimplementarla. Una copia en el test habría podido derivar del original sin
  que nada lo notara — que es precisamente lo que un oráculo no debe permitir.
- **`verification.md` corregido de paso.** Documentaba una fase `validate` que no
  existía. Ahora la lista coincide con `init.sh` y explica el silencio.

## Verification

```text
bash tests/test_init.sh   -> 27 run, 27 passed, 0 failed
bash tests/run_tests.sh   -> ALL SUITES PASSED
./init.sh                 -> ==> harness / harness: OK / VERIFIER: all gates passed
```

## Required Changes

None.
