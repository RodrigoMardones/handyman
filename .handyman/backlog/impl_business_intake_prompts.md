---
feature: business_intake_prompts
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/business_intake_prompts]
---

# Implementation Report: business_intake_prompts (Mitigación A)

## Files Changed

- `assets/docs-business.template.md`: rewritten from a passive "fill from the
  business context provided" template into an **active interview script**:
  - Top callout: "Fill this during bootstrap by interviewing the user — do not
    guess or infer the domain from code... Bootstrap is not complete until this
    file reflects real business context, not this template."
  - Added a `**Interview prompts (ask the user):**` block under every section
    (Domain, Stakeholders, Use Cases, Out Of Scope, Glossary) with explicit
    questions the leader must pose.
  - **Preserved** the original placeholder lines (e.g. "Describe the business,
    the problem it solves, and who it serves.", "Define domain terms so code...")
    so mitigation D can grep them as "still unfilled" sentinels.
- `tests/test_docs.py`: new `test_business_intake_prompts()` (wired into `main()`)
  asserting the template carries ≥3 interview-prompt blocks and the
  interview-not-guess instruction.

## Design Notes

- Kept the template free of YAML frontmatter (docs templates are plain markdown).
- The `assets/` dir is excluded from the T2 link check, so the markdown inside the
  template is illustrative and safe.
- Coordination with D: the detection sentinels (placeholder lines) are intentionally
  retained verbatim.

## Acceptance Mapping

1. Template carries interview prompts per section → 5 `Interview prompts` blocks.
2. Structure/placeholders preserved for later detection → original lines intact.
3. Static test verifies the prompts → `test_business_intake_prompts` PASS.
4. Suite passes → verifier exit 0.

## Test Output

```text
VERIFIER_EXIT=0
  PASS docs-business.template.md carries Interview prompts
  PASS docs-business.template.md tells the leader to interview, not guess
```
