---
feature: workstation_design_guidelines_doc
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/role/implementer, handyman/feature/workstation_design_guidelines_doc]
---

# Implementation Report: workstation_design_guidelines_doc

## Files Changed

- `handyman/references/workstation.md` — new `## Panel Design Guidelines` section: the design-tokens table (token, role, light/dark values, why), the interaction contract (fmt layer, busy + `ok:`/`error:` prefixes, `.empty` pattern, native validation + dialog help), and the views map (`#/fleet` read / `#/harness/<name>` act state-first / `#/timeline` audit) pointing back to the Action Nomenclature glossary. The `GET /api/state` endpoint row now documents the additive `draft` field (`absent`/`pristine`/`filled`).
- `tests/test_docs.py` — new `test_workstation_reference` (mirror of `test_discovery_reference`): guidelines anchors exist in workstation.md and references/README.md still lists it.

## Design Notes

- Prose stays resource-as-subject (W011 gate green): "The presentation layer is governed…", "Rendering stays textContent-only…" — no role-as-ingestor constructions.
- `SKILL.md` untouched (token budget, precedent features 36/65/75); the heavy guidance lives in references/ per skill-creator progressive disclosure.
- No markdown links added beyond existing relative ones, so `test_markdown_links` stays green; the in-page glossary pointer is plain text to avoid anchor-link checking.

## Test Output

```text
bash tests/run_tests.sh: ALL SUITES PASSED (doc-structure suite 18/18 with
test_workstation_reference; W011 passive-framing green; workstation 18/18)
```
