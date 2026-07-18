---
feature: feature_request_templates_doc
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/feature_request_templates_doc]
---

# Implementation Report: feature_request_templates_doc

Plan E of `docs/analisis-feature-request-md.md`.

## Files Changed

- `references/templates.md`: extended the `## feature-request.md` section with a paragraph
  describing the recommended form structure — the CORE block (filled every time) vs. the
  OPTIONAL block (filled only when it applies) — and the two request archetypes (Research
  leaves a plan in `docs/`; Implementation changes code + tests), each mapped to a worked
  example.

## Design Notes

- Disclosure progresiva (skill-creator): the heavy guidance now lives in `references/` and the
  asset; `SKILL.md` keeps only its existing short pointer (confirmed untouched via `git diff`).
- No new markdown links were introduced; the existing relative link to the asset still resolves,
  so `test_docs.py` link verification stays green.

## Test Output

```text
$ ./init.sh
  PASS all relative markdown links resolve
  PASS SKILL.md stays within 1000 words (997)
  53 run, 53 passed, 0 failed
VERIFIER: all gates passed   # EXIT 0
```
