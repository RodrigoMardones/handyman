---
type: Implementation Log
feature: feature_depends_on
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/feature_depends_on]
---

# Implementation Report: feature_depends_on

## Files Changed

- `handyman/assets/schemas/feature_list.schema.json` (+`depends_on`: array int uniqueItems, opcional, feature def)
- `handyman/scripts/feature.py` (+`_archived_ids`/`_unmet_deps`, `_archived_max_id` reusa `_archived_ids`; `add --depends-on` repeatable; nuevo `cmd_ready` con `--json` y exit 3 drenado; `start` WARN deps abiertas; docstring/usage/exit codes)
- `handyman/scripts/validate_harness.py` (+`_archived_ids`+`check_depends_on`: self-dep + dangling id gap, archived ids validos; wired en check_feature_list)
- `handyman/references/anatomy.md` (Feature List Contract: depends_on en la lista de claves + bullet declared-vs-derived)
- `tests/test_feature.sh` (F22 frontera con dep archivada, F23 exit 3 + --json [], F24 WARN sin bloquear)
- `tests/test_init.sh` (T19 dangling flaggeado / archived aceptado)
- `tests/test_docs.py` (`test_depends_on_contract`: schema shape + anatomy + validacion jsonschema)

## Design Notes

- Espejo schema-first de harness_version/discovery/sprint (features 5/33/49/93): additionalProperties:false obliga a declarar la clave antes de usarla; legacy sin depends_on sigue validando (opcional puro, sin sentinel en templates).
- Readiness DERIVADA, nunca declarada: `ready` computa la frontera desde el estado (done vivos + archive del sprint close); exit 3 = drenado, el stop signal que el plan B documenta como contrato de loop.
- `start` avisa pero NO bloquea (espejo del branch advisory feature 95): el orden de dependencias es recomendacion que el operador puede pisar conscientemente.
- `--json` imprime SOLO el payload (la observacion estructurada); el resumen drenado va a stderr para no romper consumidores JSON.
- validate_harness NO importa de feature.py (evita ciclo: feature.py ya importa resolve_workspace de validate_harness) -> helper `_archived_ids` duplicado a proposito, 15 lineas.

## Test Output

```text
test_feature.sh: 24 run, 24 passed / test_init.sh: 17 run, 17 passed
test_docs.py: 178 run, 178 passed / shellcheck clean / ./init.sh EXIT=0
```
