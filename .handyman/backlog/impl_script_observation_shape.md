---
feature: script_observation_shape
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/script_observation_shape]
---

# Implementation Report: script_observation_shape

## Files Changed

- `handyman/scripts/feature.py` (`main` reescrito: `_dispatch` aislado, tail `status: ok|warn|error` (+ `next:` en rc==3 drenado); `--json` exento via getattr(args,'json',False); docstring +Observation shape)
- `handyman/scripts/preflight.py` (tail del reporte: `next:` + `status:` ok/warn/error, los 3 casos; mismo patron)
- `handyman/references/anatomy.md` (parrafo Optional Support Files introductorio + fila preflight actualizada a `--check`/worklist)
- `tests/test_feature.sh` (F25 status ok/warn/error + next: + JSON exento)
- `tests/test_preflight.sh` (T11 status ok/warn/error + next:)

## Design Notes

- Patron observation design de la skill agent-harness-construction (literatura citada): `status` + `summary`/`next_actions` + `artifacts`. Aqui el summary es el cuerpo del reporte (ya existe); el aporte es la linea final estable.
- `--json` exento porque el JSON payload ES la observacion estructurada (anadirle `status:` al stdout romperia el parseo JSON de un consumidor).
- Exit 3 de ready se mapea a `warn` (no error): un backlog drenado no es un fallo, es una condicion de parada legitima del loop.
- Empezar por los 2 scripts del loop (preflight + feature) es deliberado: son los que un runner externo invoca; el resto puede adoptar el shape incrementalmente.

## Test Output

```text
test_feature.sh: 25 run, 25 passed / test_preflight.sh: 11 run, 11 passed
./init.sh EXIT=0
```
