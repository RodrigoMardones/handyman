---
feature: workstation_interaction_contract
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/role/implementer, handyman/feature/workstation_interaction_contract]
---

# Implementation Report: workstation_interaction_contract

## Files Changed

- `handyman/scripts/workstation.py` — single `fmt` layer in the panel JS (`status`, `session`, `aggregate`, `timeline`, `queueEntry`): humanized statuses (`in_progress` -> `in progress`), sentence templates replacing the `k=v` aggregate dump and glued timeline/queue strings; `dateEl()` renders dates relative with the absolute in `title` (session updated + last closure); `emptyNode()` unifies the four empty states under one `.empty` style; the dialog submit goes busy/disabled with a `working...` note until the response and the statusline reports with `ok:` / `error:` textual prefixes (the refresh error too); `slugInput()` ships native `required` + `pattern="[a-z0-9_]+"` validation, `labeled()` gains per-field help, `HELP` explains each dialog's effect including the Draft-request-vs-Add distinction; reason input required; CSS for `.empty`, `.formstatus.working`, `dialog small`, `.dlghelp`. All rendering stays `textContent`-only.
- `tests/test_workstation.sh` — new W17: fmt layer present, old machine-string constructs absent (`fleet: harnesses=`, raw ` [status]` render), native slug pattern + help markers, busy marker, `ok:`/`error:` prefixes, draft-vs-add help.

## Design Notes

- The suite drives no browser (constraint §4 of the analysis doc), so W17 asserts the contract structurally in the served source: the single formatting layer exists and the old constructs are gone. Endpoint behavior remains covered by W2-W14, all untouched.
- Native browser validation (required/pattern) blocks a bad slug before any server round-trip — platform feature over custom JS (ponytail rung 4); the server-side NAME_RE guard stays as the real boundary.
- `working...` uses ASCII dots, mirroring the existing `running...` verifier marker.

## Test Output

```text
tests/test_workstation.sh: 17 run, 17 passed (new W17 green)
bash tests/run_tests.sh: ALL SUITES PASSED
```
