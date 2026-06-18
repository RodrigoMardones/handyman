## Revisores

- RodrigoMardones

## Cambios

Rama `feat/investigation`: implementa las tres herramientas deterministas priorizadas en `docs/analisis-iteraciones.md` (ejes A1, A4 y A2), que sacan a Handyman de depender 100% del LLM para validar estructura, contrato y transiciones de estado.

### Validador de estructura determinista (A1)
- Agrega `scripts/validate_harness.py`: resuelve `HARNESS_WORKSPACE`, verifica archivos núcleo, parsea `feature_list.json`, exige ≤1 feature `in_progress`, valida estados y detecta role files que viven dentro del workspace.
- Cablea `init.sh` con un gate bloqueante `run_phase "validate"`.
- Suma los casos T8–T11 en `tests/test_init.sh`.

### Contrato formal con JSON Schema (A4)
- Agrega `assets/schemas/feature_list.schema.json` y `assets/schemas/harness.config.schema.json` (draft-07, `additionalProperties: false`, enums de `install_mode`/`status`/`valid_status`, mapas `models`/`tools` con los cuatro roles).
- `tests/test_docs.py` valida los templates contra sus schemas; degrada con NOTE si falta `jsonschema` para no romper el verifier local.
- CI (`.github/workflows/ci.yml`) instala `jsonschema` para correr la validación completa.

### CLI de transiciones de estado atómicas (A2)
- Agrega `scripts/feature.py` con `add | start | block | done`: `start` fuerza la invariante de un solo `in_progress`, `block --reason` registra `blocked_reason`, `done` cierra solo con verifier verde (append a `history.md` + reset de `current.md`).
- Suma `blocked_reason` opcional al schema de `feature_list`.
- Nuevo `tests/test_feature.sh` (F1–F9) cableado en `tests/run_tests.sh`.

### Análisis e infraestructura
- Agrega `docs/analisis-iteraciones.md`: informe investigativo de próximas iteraciones (herramientas, etapas y mejoras).
- Actualiza `references/anatomy.md` (Optional Support Files) con los nuevos artefactos.
- Ajusta `.gitignore` para mantener el estado operativo del harness local fuera de git.

## Tarea o asunto asociado

- Sin ticket asociado. Deriva de `docs/analisis-iteraciones.md` (ejes A1 validate_harness, A4 JSON Schema, A2 feature CLI).

## Evidencia del cambio

- `bash tests/run_tests.sh`: **62 checks PASS** (test_docs.py 37, test_init.sh 9, test_update.sh 7, test_feature.sh 9).
- `./init.sh`: `VERIFIER: all gates passed` (incluye el nuevo gate `validate`).
- `shellcheck -S warning` sobre `scripts/` + `tests/`: sin advertencias.
- Ruta degradada sin `jsonschema` verificada verde (test_docs.py 32 PASS + NOTE).
