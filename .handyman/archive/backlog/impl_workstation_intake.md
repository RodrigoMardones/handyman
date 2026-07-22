---
type: Implementation Log
feature: workstation_intake
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/workstation_intake]
---

# Implementation Report: workstation_intake

## Files Changed

- `handyman/scripts/workstation.py`: `do_POST` pipeline (route → Host → token
  `X-Workstation-Token` → JSON content-type → 1 MiB cap → parse → validate →
  act under `MUTATION_LOCK`). Endpoints: `/api/feature/add` (shells
  `feature.py --root TARGET add`, gate bullet auto-appended last),
  `/api/feature/block`, `/api/feature/unblock`, `/api/request-draft`
  (CORE-filled canonical `feature-request.md`; overwrite only when absent or
  pristine-template, else 409 unless `force`). Registry as write allowlist
  (`registered_root`), `NAME_RE ^[a-z0-9_]+$`, length caps, argv-array
  subprocess only, feature.py stderr mapped 409 (already exists / is not
  blocked / not found) vs 500. Success returns a `fresh_snapshot(root)`.
  UI: Request/Add/Block/Unblock buttons per fleet row → shared `<dialog>`
  forms, `api()` helper sending the token, aria-live status updates.
- `tests/test_workstation.sh`: W5–W11.

## Design Notes

- The panel never opens feature_list.json for writing: every mutation is the
  same deterministic CLI a session would run, so schema and invariants hold
  on drifted harnesses too (contract keys only reach `add`).
- Draft pristine-check compares bytes against the shipped template — a
  deterministic "has someone filled it in" rule with zero heuristics.

## Test Output

```text
bash tests/test_workstation.sh -> 11 run, 11 passed, 0 failed
```
