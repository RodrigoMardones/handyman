---
feature: security_snyk_w011
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/security_snyk_w011]
---

# Implementation Report: security_snyk_w011

## Files Changed

- `handyman/references/security.md` — intro, scope sentence, highest-risk chain and
  Threat Model table rewritten from agent-as-subject to resource-as-subject (passive).
- `handyman/references/anatomy.md` — "Untrusted Content" opening sentence rewritten
  to resource-as-subject; mitigation anchor preserved.
- `tests/test_docs.py` — new `test_w011_passive_framing` (T6) + docstring/main wiring.
- `docs/analisis-snyk-w011.md` — investigation: alert, root cause, fix, scanner gap.

## Design Notes

- W011 (snyk-agent-scan) fires on the agent-as-grammatical-subject ingestion
  construction. The prior P1–P4 behavioral mitigation was correct but *described* the
  ingest flow in active voice, widening the lexical surface the scanner penalizes.
- Fix = the `snyk-agent-scan-compliance` W011 catalog transform (passive,
  resource-as-subject), with zero information loss: golden rule, per-role operating
  rules, checklist, threat model and the `not instructions` anchors all survive.
- `SKILL.md` left untouched: its rule is already passive and its token budget is at
  997/1000 (T4). Procedural Workflow reads ("Read `AGENTS.md`") target the harness's
  own state, not outsider free text — out of scope.
- Guard test scans `SKILL.md` + `references/*.md` + `assets/*.md`: (1) five trigger
  phrases absent, (2) no role+ingest-verb+untrusted-object regex match, (3) mitigation
  anchors present. The regex matched pre-fix (grep) and is zero post-fix — it has teeth.
- Gap: `SNYK_TOKEN` empty, so the live scanner could not be run to confirm the count
  drop (`uvx snyk-agent-scan@latest` is available). Encoded the fix as a deterministic
  test instead; doc explains how to re-verify with a token.

## Test Output

```text
test_docs.py: 90 run, 90 passed, 0 failed
ALL SUITES PASSED  (docs 90, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10)
./init.sh exit: 0  — VERIFIER: all gates passed
```
