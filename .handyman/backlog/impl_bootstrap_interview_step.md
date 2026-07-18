---
feature: bootstrap_interview_step
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/bootstrap_interview_step]
---

# Implementation Report: bootstrap_interview_step (Mitigación B)

## Files Changed

- `references/workflow.md` (Bootstrap Protocol): inserted a new **step 4** —
  "Interview the user about the business layer before filling `docs/business.md`...
  do not invent or infer the domain from code — ask... the bootstrap is not
  complete until `docs/business.md` reflects real business context from the user,
  not the template." It lists the minimum to gather (domain/problem, stakeholders,
  central use case actor → goal → flow → rules, out of scope, glossary) and points
  at the prompts in the `docs/business.md` template. Renumbered the following steps
  (old 4–8 → new 5–9).

## Design Notes

- Placed the interview **before** "Fill the copied templates" so the content has a
  source before it is written.
- Used inline-code for all paths; no new markdown links → T2 unaffected. The
  existing `[templates.md](./templates.md)` link in step 3 is untouched.
- Pairs with A (the template carries the prompts) and C (anatomy.md declares the
  contract).

## Acceptance Mapping

1. Bootstrap Protocol has a mandatory business-interview step BEFORE filling templates → new step 4.
2. The step forbids inferring the domain and declares the bootstrap incomplete until context is gathered → step 4 text.
3. Suite passes (links resolve) → verifier exit 0.

## Test Output

```text
VERIFIER_EXIT=0
  PASS all relative markdown links resolve
```
