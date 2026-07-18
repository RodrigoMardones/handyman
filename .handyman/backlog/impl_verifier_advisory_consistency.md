---
feature: verifier_advisory_consistency
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/verifier_advisory_consistency]
---

# Implementation Report: verifier_advisory_consistency

## Files Changed

- `init.sh` (vivo del repo) — añadidas las funciones advisory `check_business_context()`, `check_tools_discovery()`, `check_evals()` (mirror del template, paths adaptadas a `handyman/`) + sus invocaciones al final junto a las demás.

## Design Notes

- Cierra el drift: el init.sh vivo y assets/init.template.sh ahora invocan el mismo conjunto de advisories (harness_version, graphify_context, business_context, tools_discovery, evals, preflight).
- Las paths se adaptan al layout del repo (skill bajo `handyman/`): `handyman/evals/trigger-eval.json`, `handyman/SKILL.md`, `handyman/scripts/evals.py`, `handyman/references/...`.
- Todos los advisories son no bloqueantes (no alteran EXIT_CODE), patrón idéntico a los ya presentes.
- Los advisories ahora emiten sus NOTEs correctamente (check_evals NOTE sobre SKILL.md cambiado; check_business_context silencioso porque business.md está relleno; check_tools_discovery con discovery declarado).

## Test Output

```text
bash -n init.sh: SYNTAX OK
6 advisories presentes + invocados
./init.sh exit 0 (ALL SUITES PASSED)
```
