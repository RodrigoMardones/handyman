---
feature: preflight_advisory
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/preflight_advisory]
---

# Implementation Report: preflight_advisory

## Files Changed

- `handyman/assets/init.template.sh` — nueva función advisory `check_preflight()` (invoca `scripts/preflight.py`, nunca toca EXIT_CODE) + invocación al final junto a los demás advisories.
- `init.sh` (vivo del repo) — reflejo: define e invoca `check_preflight()`.
- `tests/test_docs.py` — nuevo `test_preflight_advisory()` (define+llama+advisory+invoca preflight.py), registrado en `main()`.

## Design Notes

- Patrón idéntico a los advisories existentes (`check_graphify_context`, `check_evals`, etc.): reporta sin bloquear.
- `check_preflight()` delega el 100% del trabajo en `scripts/preflight.py` (no reimplementa); `|| true` asegura que nunca rompe el verifier.
- En el vivo, la ruta es `handyman/scripts/preflight.py` (el repo tiene la skill bajo `handyman/`); en el template, `scripts/preflight.py` (un harness instalado tiene los scripts en `scripts/`).

## Test Output

```text
test_docs.py: test_preflight_advisory PASS (4 aserciones)
./init.sh exit 0 — el verifier ahora emite el stability report al final
Preflight suite + ALL SUITES PASSED (10 suites)
```
