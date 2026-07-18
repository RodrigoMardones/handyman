---
feature: error_inconsistency_docs
status: implemented
role: implementer
updated: 2026-06-24
tags: [handyman/role/implementer, handyman/feature/error_inconsistency_docs]
---

# Implementation Report: error_inconsistency_docs

## Files Changed

- `docs/analisis-inconsistencia-bootstrap.md` (new) — research document with
  root-cause analysis and an action plan for the `bootstrap` template
  inconsistency observed across models.

## Design Notes

- **Type of feature:** docs-only research deliverable. No product code changed.
- **Evidence-based.** Every root cause cites concrete repo behavior, verified by
  reading the source:
  - `scripts/scaffold.sh` writes `harness.config.json` in **both** scopes (the
    `copy_and_stamp ... harness.config.json` call is outside the `local`/`global`
    branch), contradicting the `SKILL.md` Installation Scope table that lists it
    as global-only. → root cause 3.1 (the "juntos vs. separados" symptom).
  - `feature_list.json` carries a `config` block duplicating a subset of
    `harness.config.json` → two sources of truth (3.2).
  - `scripts/validate_harness.py` (the live gate) only checks files/parse/≤1
    in_progress/status enum; the JSON Schema (`additionalProperties: false`) runs
    only against **templates** in `tests/test_docs.py`, never against the live
    `feature_list.json`. → invented `start_date`/`close_date` pass undetected
    (3.3).
  - Dates are pervasive in `progress/current.md` / `progress/history.md` and
    written by `feature.py done`, but absent from the feature contract → models
    hallucinate them (3.4).
  - `references/workflow.md` has no Bootstrap Protocol; `SKILL.md` Bootstrap prose
    invites hand-creation (3.5).
- **Action plan (acceptance #2)** is in section 4, scoped to `references/` and
  `assets/`: A (single `bootstrap` path + Bootstrap Protocol), B (config source
  of truth), C (wire schema to the live verifier), D (make "features carry no
  dates" explicit), E (mandate `feature.py add`). Out-of-scope fixes (`SKILL.md`
  table, `scripts/` schema validation) are documented as future features, not
  improvised here.
- **skill-creator consulted (acceptance #3).** Section 5 applies its guidance:
  `scripts/` for determinism, principle of least surprise (one source of truth),
  executable gates over prose for format contracts, coherent layered disclosure.
- **T2 safety.** The doc uses inline-code for every path reference (no markdown
  links), matching `docs/analisis-actualizacion-harness.md`. `tests/test_docs.py`
  runs `strip_code()` before link extraction, so inline-code paths are never
  parsed as links — `all relative markdown links resolve` stays green.

## Acceptance Criteria

- [x] documento de investigación generado en `docs/` que explica la inconsistencia
- [x] el documento incluye un plan de acción concreto referido a `assets/` y `references/`
- [x] se utiliza la skill `skill-creator` para consultar buenas prácticas
- [x] `bash tests/run_tests.sh` passes (suite verde, T2 markdown-links intacto)

## Test Output

```text
./init.sh -> EXIT=0
  PASS repo has markdown files
  PASS all relative markdown links resolve
ALL SUITES PASSED (test_docs 47 + test_init 10 + test_update 7 + test_feature 9 + test_upgrade 10)
VERIFIER: all gates passed
```
