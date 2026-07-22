---
type: Implementation Log
feature: harness_unblock_verbs
id: 51
role: implementer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: harness_unblock_verbs (feature 51)

El harness imprimia «unblock blocked work» sin ofrecer el verbo, y no habia
forma soportada de corregir una lista de acceptance: las dos operaciones
obligaban a editar `feature_list.json` a mano, que es exactamente lo que
`docs/architecture.md:170` prohibe. Dos verbos atomicos cierran el hueco por
el mismo camino de escritura que el resto de la maquina de estados.

## Piezas

- `handyman/src/feature.ts`:
  - `cmdUnblock(name)`: `blocked` -> `pending` y borra `blocked_reason`.
    Rechaza cualquier otro estado de origen. Es deliberado: `unblock` es la
    inversa de `block`, no un «set to pending» generico que pudiera reabrir
    una feature `done`.
  - `cmdAcceptance(name, acceptance[])`: reemplazo de la lista completa. Una
    lista de acceptance es un contrato que se lee como unidad, y editarla a
    mano es lo que la regla prohibe. Al menos un `--acceptance` es
    obligatorio: un flag olvidado no puede leerse como «borra el contrato».
  - `saveValidated(path, data)`: valida contra
    `assets/schemas/feature_list.schema.json` **antes** de escribir. Reusa
    `validateFeatureList` de `core/schema.ts` (Ajv sobre el schema real, ya
    existente); un resultado invalido aborta con exit 1 y el archivo intacto.
  - `parseUnblock` / `parseAcceptance`, entradas en `COMMANDS`, dispatch, y
    los 3 usage strings + el mensaje de `invalid choice`.
  - `--acceptance` repetible, **igual que `add`** (que ya lo hacia): cero
    conceptos nuevos. `--from FILE` no se agrega hasta que el quoting de
    balas largas duela en la practica.
- `tests/test_feature.sh`: F28-F31 siguiendo el patron de F3 (`block`) —
  unblock feliz, unblock sobre no-blocked (con assert de archivo intacto),
  acceptance reemplaza, acceptance sin flag (con assert de lista intacta).
- `handyman/references/workflow.md`: la linea que decia como marcar una
  sesion `blocked` ahora dice tambien como volver.

## Verificacion

- `bash tests/test_feature.sh` -> 31/31 (era 27/27).
- `bash tests/run_tests.sh` -> ALL SUITES PASSED.
- `./init.sh` -> exit 0.

## Notas

- **Colision de roles.** Esta feature la implemento el mismo agente que actua
  de leader y de reviewer en esta sesion. Es la misma desviacion que
  documentan las features 32-35 y la que la feature 55
  (`harness_report_actor`) va a hacer visible en el registro. Queda dicho
  aqui en vez de firmarse en silencio.
- El backlog registro esta cola con ids secuenciales en orden de comando, asi
  que la numeracion diverge del plan `plan-accion-g1-g4.md`: el
  `toolbox_cli_review_notes` del plan (54) es el id 53, `roles_toolbox_pointer`
  (55) es el 54, y `report_actor` (53) es el 55. Los nombres son la clave
  estable y `depends_on` apunta al id real.
- Las 5 features entraron **sin `sprint`**: `sprint.js open` rechaza un
  segundo sprint abierto y no existe un verbo para etiquetar una feature
  agregada a mitad de sprint. Hueco real del harness, anotado y no construido.
