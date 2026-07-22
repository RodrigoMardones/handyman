---
type: Implementation Log
feature: harness_evidence_debt_advisory
id: 52
role: implementer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: harness_evidence_debt_advisory (feature 52)

`checkFrontmatterAdvisory` sólo inspecciona los `review_` que **existen**;
nunca cruzaba contra `feature_list.json`. La feature 32 ya calculaba esa deuda
pero sólo detrás de `POST /api/triage`: el gate no la veía. Ahora la ve.

## Piezas

- `handyman/src/validate_harness.ts`:
  - `checkEvidenceDebtAdvisory(workspace)` (nuevo): un `NOTE:` por cada
    feature `done` sin `review_<name>.md`, nombrando la ruta del archivo
    faltante. Llamado entre el advisory de frontmatter y el de branch.
  - Reusa `computeEvidenceDebt` de `@handyman/toolbox-core/triage` (subpath
    ya exportado, dependencia ya declarada). No re-implementa el cruce.
  - `try/catch` alrededor del cómputo: un workspace pelado o ilegible no es
    problema de este advisory, y no debe tumbar el validador.
- `tests/test_init.sh`: T20 (fixture con `done` sin review -> NOTE + exit 0)
  y T21 (fixture con el review presente -> silencio + exit 0).

## Por qué NOTE y no gap

Romper el exit code de harnesses instalados que ya arrastran deuda legítima es
hostil. Que avise primero; endurecerlo después es cambiar una línea, y para
entonces hay datos. Las dos direcciones están cubiertas por test, así que
endurecerlo es un cambio con red.

## Verificación

- `bash tests/test_init.sh` -> 19/19 (era 17/17).
- `bash tests/run_tests.sh` -> ALL SUITES PASSED (29 suites).
- `./init.sh` -> exit 0, **con** el NOTE nuevo presente.

## Hallazgo

El efecto secundario que el plan anticipaba («este harness va a empezar a
imprimir NOTEs por features viejas») **no se materializó**: la única entrada de
deuda en todo el backlog es `harness_unblock_verbs`, la feature 51 que esta
misma sesión cerró sin reporte de reviewer. Las 21 features anteriores tienen
su `review_`. Es decir: el advisory encontró deuda real en su primera corrida,
y la deuda era nuestra. La 51 quedó saldada con
`review_harness_unblock_verbs.md`.
