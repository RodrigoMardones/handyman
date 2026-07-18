---
feature: preflight_advisory
status: approved
role: reviewer
updated: 2026-07-01
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/preflight_advisory]
---

# Review: preflight_advisory

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Checklist

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0
- [x] Acceptance: init.template.sh define y llama check_preflight()
- [x] Acceptance: la función es advisory (no altera EXIT_CODE)
- [x] Acceptance: el init.sh vivo invoca check_preflight()
- [x] Acceptance: test_docs.py verifica define+llama+advisory

## Required Changes

_None. check_preflight() sigue el patrón de los advisories existentes, delega en preflight.py con `|| true`, y el init.sh vivo refleja la invocación. test_preflight_advisory (4 aserciones) pasa; ./init.sh verde._
