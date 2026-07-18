---
feature: workstation_action_nomenclature
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/role/implementer, handyman/feature/workstation_action_nomenclature]
---

# Implementation Report: workstation_action_nomenclature

## Files Changed

- `handyman/scripts/workstation.py` — `LABELS` renamed to the workflow-stage vocabulary (`Draft request`, `Add pending feature`, `Block`, `Unblock`) plus a new `TITLES` map; every action button now carries a `title` naming its stage and produced artifact; the Verify button becomes `Run verifier` with the verification-stage title.
- `handyman/references/workstation.md` — new `## Action Nomenclature` section: glossary table mapping panel action ↔ workflow stage ↔ endpoint ↔ artifact/effect, stating that labels speak the vocabulary of workflow.md.
- `tests/test_workstation.sh` — new W16: GET / carries the three renamed labels and the stage+artifact titles (intake/verification/unblock markers).

## Design Notes

- Endpoints, JSON fields and CLI paths are untouched — only captions and tooltips change, so every existing suite case stays green unmodified (analisis-ux-ui-workstation.md, risk 3).
- The Draft request vs Add pending feature distinction is now visible in the labels and titles (both intake, different artifact); the in-dialog explanation belongs to plan B (feature 79).
- Prose in the reference stays resource-as-subject (W011): "Panel actions are labeled…", no role-as-ingestor constructions.

## Test Output

```text
tests/test_workstation.sh: 16 run, 16 passed (new W16 green)
bash tests/run_tests.sh: ALL SUITES PASSED
```
