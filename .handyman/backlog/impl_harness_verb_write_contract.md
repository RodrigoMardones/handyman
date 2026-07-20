---
type: Implementation Log
feature: harness_verb_write_contract
status: implemented
role: implementer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/implementer, handyman/feature/harness_verb_write_contract]
---

# Implementation Report: harness_verb_write_contract

## Files Changed

El árbol arrastra 39 archivos sin commitear del lote 50-55, así que `git diff HEAD`
no delimita esta feature. Lo que le pertenece:

- `handyman/src/feature.ts`
  - `cmdAdd`, `cmdStart`, `cmdBlock`, `cmdDone`: `save(path, data)` -> `saveValidated`,
    con `return rc` en el fallo. Cuatro sitios.
  - `cmdAcceptance`: guarda de estado `done` + bandera `force`; firma pasa a
    `(CommonArgs & {name, acceptance, force}, workspace, root)`.
  - `appendAcceptanceOverride`: nueva, escribe la entrada de historia del override.
  - `parseAcceptance`: acepta `--force` y `--date`; usage y `--help` actualizados.
  - `ParsedArgs.force`; `dispatch` pasa `force`, `date` y `root` a `cmdAcceptance`.
  - Comentario de `saveValidated` y ayuda principal: reescritos al contrato nuevo.
- `tests/test_feature.sh` — 4 casos: F34, F34b, F34c, F35.

## Design Notes

- **`save()` queda privado de `saveValidated`.** Después del cambio, el único
  `save(path, data)` del archivo es el de dentro de `saveValidated` (`:212`). Eso es
  lo que hace verificable la bala 1 con un `grep`, y lo que convierte «un segundo
  caller» en algo que se nota. Está anotado en el comentario de la función.
- **La bala 1 dice «los 9 verbos», pero sólo 6 escriben `feature_list.json`.**
  `ready` es de sólo lectura; `log` y `next` escriben `progress/current.md`, no la
  lista. Ruteárlos por `saveValidated` sería ruido: validarían un objeto que no
  tocaron. El contrato real es «todo camino que escribe `feature_list.json` valida
  antes», y ése queda cerrado. La acceptance registrada dice los seis por nombre.
- **Corrección al diagnóstico del plan.** El plan cita `feature.ts:203-217` y cuenta
  el `save()` de dentro de `saveValidated` entre los pelados. No lo es. Los verdaderos
  eran cuatro: `add`, `start`, `block`, `done`.
- **`--force` y no `--allow-done`**, para que sea la misma palabra que la feature 58
  usa en `backlog.js review`. Dos CLIs del mismo harness no deberían pedir dos
  vocabularios para «sí, ya sé, hacelo igual».
- **El override no reabre la feature.** `--force` reescribe el contrato y deja el
  status en `done`; la entrada de historia lo dice literalmente (`Closure: unchanged
  (still done)`). Reabrir sería una transición de estado, y eso ya tiene sus verbos.
  F34b fija las dos cosas juntas.
- **La entrada de historia nombra al review comprometido.** Incluye
  `Warning: backlog/review_<name>.md signed the previous contract`, que es el dato
  que hace accionable el registro: dice qué archivo quedó desalineado.
- **`--date` en `parseAcceptance`.** No es alcance extra: `start`, `done`, `log` y
  `next` ya lo aceptan, y por el mismo motivo — un registro fechado necesita una
  fecha fijable para ser testeable. `acceptance --force` ahora escribe uno.

## Riesgo evaluado: ¿rutear `add` rompe algo?

`saveValidated` valida el documento **completo**, no el delta. Un `feature_list.json`
que ya estuviera inválido antes haría fallar el primer verbo que lo tocara, aunque
ese verbo no fuera la causa. Se aceptó: es exactamente lo que la feature pide, el
mensaje de error nombra los errores del schema, y el harness de este repo valida
limpio (las 40 corridas de `test_feature.sh` y el gate completo pasan).

## Test Output

```text
tests/test_feature.sh
  PASS acceptance: refuses a done feature and leaves the contract intact
  PASS acceptance: --force rewrites a done contract and records the override
  PASS acceptance: an open feature rewrites without --force and without a history entry
  PASS start: blocked -> in_progress still works through the validated write path

Summary: 40 run, 40 passed, 0 failed

bash tests/run_tests.sh -> ALL SUITES PASSED
```
