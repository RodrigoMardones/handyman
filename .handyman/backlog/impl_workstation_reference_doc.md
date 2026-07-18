---
feature: workstation_reference_doc
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/workstation_reference_doc]
---

# Implementation Report: workstation_reference_doc

## Files Changed

- `handyman/references/workstation.md` (new): what the panel is (interactive
  counterpart of the static fleet export), quick start + flags, the endpoint
  table, the security model (bind, token, Host check, registry allowlist,
  argv-only, DOM-safe rendering), how writes work (formal intake route via
  feature.py, gate contract, draft overwrite rule, unblock), testing notes
  (ephemeral port, temp HANDYMAN_ROOT, macOS path canonicalization) and
  limitations (last-writer-wins, session-local verifier results, single
  operator by design).
- `handyman/references/README.md`: workstation.md row in the catalog.
- `handyman/references/fleet.md`: pointer line to workstation.md.

## Design Notes

- Wording keeps resources as subjects (W011 passive framing); links are
  relative within references/ so the markdown-link gate stays green.
- SKILL.md untouched (997/1000 word budget), matching the fleet.md precedent.

## Test Output

```text
bash tests/run_tests.sh -> ALL SUITES PASSED (13 suites)
```
