---
type: Implementation Log
feature: bootstrap_protocol
status: implemented
role: implementer
updated: 2026-06-24
tags: [handyman/role/implementer, handyman/feature/bootstrap_protocol]
---

# Implementation Report: bootstrap_protocol (mitigation A + skill_table_fix)

## Files Changed

- `references/workflow.md` — new **Bootstrap Protocol** section (between Startup
  and Leader Protocol): 8 steps making `scaffold.sh` the mandatory first step,
  forbidding hand-creation, stating `harness.config.json` is written in **both**
  scopes, and routing feature creation through `scripts/feature.py add`.
- `references/templates.md` — added a paragraph marking `scaffold.sh` as the
  canonical layout tool (writes `harness.config.json` in both scopes) and warning
  the per-file snippets are for content, not for re-creating the layout by hand.
- `SKILL.md` — fixed the **Installation Scope** table: the `local` row now lists
  `harness.config.json` among the project-root files; the `global` row reads
  "Same files, absolute paths" instead of "Bridge files plus `harness.config.json`",
  removing the contradiction with `scaffold.sh`.

## Design Notes

- **Root cause 3.1 closed at the source.** The table previously implied config
  was global-only while `scaffold.sh` writes it in both scopes. Aligning the
  table (and reinforcing it in workflow.md/templates.md) removes the divergent
  signal that made models include/omit the config.
- **Token budget.** `SKILL.md` was 996/1000; the table edit is net +1 word
  (local cell +1, global cell ±0) → 997/1000, margin 3. Verified with `wc -w`
  and the `test_token_budgets` gate.
- **Determinism over prose (skill-creator).** The Bootstrap Protocol makes the
  deterministic script the single path; the doc snippets are explicitly demoted
  to content-fill/customization. Steps 7 (feature.py add) connect to mitigation E.

## Acceptance Criteria

- [x] references/workflow.md has a Bootstrap Protocol with scaffold.sh as the mandatory first step
- [x] references/templates.md warns against manual creation and marks scaffold.sh canonical
- [x] SKILL.md Installation Scope table no longer implies harness.config.json is global-only
- [x] token budgets respected (SKILL 997/1000, AGENTS 249/250)
- [x] `bash tests/run_tests.sh` passes

## Test Output

```text
./init.sh -> EXIT=0
  PASS all relative markdown links resolve
  PASS SKILL.md stays within 1000 words (997)
  PASS assets/AGENTS.template.md stays within 250 words (249)
ALL SUITES PASSED
VERIFIER: all gates passed
```
