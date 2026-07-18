---
feature: business_intake_prompts
status: approved
role: reviewer
updated: 2026-06-25
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/business_intake_prompts]
---

# Review: business_intake_prompts (Mitigación A)

Equivalent review pass against `CHECKPOINTS.md`.

## Acceptance Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Plantilla lleva Interview prompts por sección | PASS | `assets/docs-business.template.md`: 5 `**Interview prompts (ask the user):**` blocks (Domain/Stakeholders/Use Cases/Out Of Scope/Glossary) |
| 2 | Se conservan placeholders para detección posterior | PASS | "Describe the business, the problem it solves, and who it serves." and "Define domain terms so code..." retained verbatim |
| 3 | Test estático verifica los prompts | PASS | `tests/test_docs.py::test_business_intake_prompts` → "carries Interview prompts" + "interview, not guess" PASS |
| 4 | Suite verde | PASS | verifier exit 0; obsidian contract intact (frontmatter keys still found across concatenated templates) |

## Checkpoints

- [x] C1 Harness Complete — verifier exit 0
- [x] C2 State Coherent — feature 17 in_progress; current.md tracks session
- [x] C3 Architecture Respected — template + test only; no product code
- [x] C4 Verification Real — new static test enforces the contract; suite green
- [ ] C5 Session Closed — pending closure

## Verdict

**APPROVED** — passive template is now an active interview script; sentinels kept for D.
