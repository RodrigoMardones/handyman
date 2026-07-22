---
type: Implementation Log
feature: feature_request_format_contracts
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/feature_request_format_contracts]
---

# Implementation Report: feature_request_format_contracts

Plan C of `docs/analisis-feature-request-md.md`.

## Files Changed

- `assets/feature-request.template.md`: added two contract lines to the
  `How to write a good request` header — (1) the green gate is ALWAYS the last
  Acceptance bullet; (2) only `name`, `title`, `description`, and `acceptance` become
  the `feature_list.json` entry (via `feature.py add`), the rest is process guidance.
- `references/templates.md`: mirrored both format contracts in the `## feature-request.md`
  section.

## Design Notes

- These are **format contracts**, so they are stated crisply (not as soft prose), per the
  skill-creator guidance cited in the research doc §7.
- The green-gate-as-last-Acceptance contract matches the empirical invariant from §3.3 of the
  research doc (all 24 closed features end Acceptance with the green gate).
- The field→`feature.py add` mapping makes explicit what the Leader Protocol (#4) already does,
  so the human filling the form knows which sections are stored vs. guidance.

## Test Output

```text
$ ./init.sh
  PASS all relative markdown links resolve
  53 run, 53 passed, 0 failed
VERIFIER: all gates passed   # EXIT 0
```
