---
type: Review Log
feature: harness_verb_write_contract
status: approved
role: reviewer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/harness_verb_write_contract]
---

# Review: harness_verb_write_contract

## Verdict

APPROVED

## Advertencia de procedencia

Mismo actor que el `impl_`, declarado en el `actor:` de ambos. El NOTE de colisión
de la feature 55 va a dispararse, correctamente.

## Stage 1: Spec Compliance

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope
- [x] The implementation report exists and matches what changed

Bala por bala, verificado por ejecución y no por inspección:

1. **Camino de escritura único.** `grep "save(path, data)"` sobre `feature.ts`
   devuelve **una sola línea**: la de dentro de `saveValidated` (`:215`). Los seis
   verbos que escriben la lista pasan por ahí.
   Verificación funcional, no estructural: sobre un fixture donde la feature `b`
   tiene `status: "bogus_status"`, un `block a --reason x` —verbo recién ruteado—
   sale **1**, imprime `refusing to write invalid feature_list.json:
   /features/1/status: must be equal to one of the allowed values`, y el md5 del
   archivo **no cambia**. Aborta sin tocar el archivo, que es lo que la bala pide.
2. **`acceptance` sobre `done` sale != 0 con la lista intacta.** Comprobado fuera de
   la suite: exit **1**, `acceptance` sigue siendo `orig`. F34 lo fija.
3. **La bandera de escape deja constancia.** `--force` reescribe y añade a
   `history.md` una entrada `(acceptance rewritten)` que nombra el delta de criterios
   y el review comprometido. F34b lo fija junto con lo que importa: **el status sigue
   `done`**, el override no reabre nada.
4. **`start` desde `blocked` sigue verde.** F35: `blocked -> in_progress`, con
   `blocked_reason` eliminado, ahora a través de la ruta validada. La transición
   documentada en `references/workflow.md` no se convirtió en un rechazo — que era el
   riesgo real de esta feature.
5. **Cobertura.** F34, F34b, F34c, F35. 40 casos, 40 verdes.
6. **Gate verde.** `bash tests/run_tests.sh` -> ALL SUITES PASSED.

### Sobre la desviación de la bala 1

La acceptance registrada nombra seis verbos; el plan de sprint decía «los 9».
La reducción es correcta y no es alcance recortado: `ready` es de sólo lectura, y
`log`/`next` escriben `progress/current.md`. Hacerlos llamar `saveValidated` los
haría validar un documento que no modificaron — ceremonia, no garantía. El invariante
que importa («todo camino que escribe `feature_list.json` valida antes») queda cerrado
y es verificable con un `grep` de una línea.

Se acepta también la corrección del `impl_` al diagnóstico del plan: `feature.ts:203-217`
contaba el `save()` interno de `saveValidated` entre los pelados. No lo era; los pelados
eran cuatro.

## Stage 2: Code Quality

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

- **Sin deps nuevas** (`architecture.md:46-52`). `validateFeatureList` ya estaba
  importado y ya tenía dos consumidores.
- **Contrato del CLI: sólo aditivo.** `--force` y `--date` son banderas nuevas en
  `acceptance`; ningún exit code preexistente cambia de valor. El único rechazo nuevo
  es el que la feature pide. Las suites black-box —el oráculo de paridad de
  `conventions.md:36-39`— pasan sin modificaciones fuera de los 4 casos añadidos.
- **`--force` reusa el vocabulario de la 58** en vez de inventar `--allow-done`. Un
  harness con dos CLIs no debería pedir dos palabras para el mismo gesto.
- **Ayuda y comentarios siguen al código.** El header del módulo, el `--help` de
  `acceptance`, la ayuda principal y el comentario de `saveValidated` describen el
  contrato nuevo. `saveValidated` documenta además que `save()` queda privado suyo,
  que es lo que hace notable una futura regresión.
- **Los tests fijan lo que puede romperse en silencio**, no lo obvio: F34b comprueba
  que el override *no* reabre la feature; F34c comprueba que la ruta ordinaria sigue
  *sin* escribir entrada de historia — el falso positivo que un guard mal puesto
  produciría.

## Nota de proceso, no bloqueante

Durante la implementación, dos comprobaciones manuales dieron falsos verdes antes de
corregirse: un `$?` que medía el exit de `head` en vez del comando, y una prueba de
schema donde el verbo sobreescribía justo el campo inválido. Ninguna llegó a la suite.
Queda anotado porque el modo de falla —una verificación que parece pasar por estar mal
construida— es exactamente lo que el harness existe para evitar, y no lo detecta ningún
gate: sólo rehacer la comprobación.

## Verification

```text
bash tests/test_feature.sh   -> 40 run, 40 passed, 0 failed
bash tests/run_tests.sh      -> ALL SUITES PASSED
./init.sh                    -> exit 0 (via feature.js done)
```

## Required Changes

None.
