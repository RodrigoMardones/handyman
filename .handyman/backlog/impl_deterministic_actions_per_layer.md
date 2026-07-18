---
feature: deterministic_actions_per_layer
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/deterministic_actions_per_layer]
---

# Implementation Report: deterministic_actions_per_layer

Research-only feature (mirror of `error_inconsistency_docs` id 9 and
`bussiness_context` id 15). Deliverable is a work plan in `docs/`; no product
scripts are implemented here.

## Files Changed

- `docs/analisis-acciones-deterministas-por-capa.md` (new) — investigation +
  work plan mapping, layer by layer, which harness mutations have a deterministic
  script and which are done by hand.

## Design Notes

- **Question answered:** beyond `feature_list.json` (covered by `scripts/feature.py`),
  which artifact mutations lack an ordered script, and how to extend the
  `feature`/`update`/`validate`/`upgrade` pattern to them.
- **Evidence-based findings:**
  - Backlog entries (`impl_`/`review_`/`explore_`) have **no** generator;
    `assets/backlog-impl.template.md` and `assets/backlog-review.template.md`
    exist but `scaffold.sh` only `make_dir backlog` (L136) and never copies them
    (L141-144 copy only feature_list/current/history/business); no explore
    template exists at all. Frontmatter contract is strict per type
    (`references/anatomy.md` L22-24, `references/obsidian.md`) yet nothing
    validates report frontmatter (`validate_harness.py` only checks
    `feature_list.json`).
  - `current.md`: `feature.py start` writes only the skeleton; `Plan`/`Log`/
    `Next Step` and `updated:` bumps are hand-edited (`workflow.md` Implementer
    step 3).
  - `history.md`: `feature.py done` appends a minimal 3-line entry; the rich
    format is hand-enriched (append-only per `obsidian.md`).
  - Other cases found: `migrate-global` (only workflow op without a tool, per
    `docs/analisis-iteraciones.md`), `index.md` MOC regeneration, and Obsidian
    frontmatter/tag consistency.
- **Root causes:** asymmetric determinism (JSON state got a CLI, the surrounding
  markdown did not), orphaned backlog templates, rich format living only in
  convention, contract without enforcement, and ops without a tool.
- **skill-creator consulted:** grounds the split — `scripts/` for
  deterministic/repetitive tasks, `assets/` for templates the scripts consume,
  `references/` for the when/why; output formats are better fixed by a
  template/script than by prose.
- **Action plan A-E** scoped to `SKILL.md` and `references/`, each item splitting
  the deterministic part (new script/template) from the interactive part, plus a
  budget-aware `SKILL.md` pointer (997/1000 words, margin 3). Implementation
  scripts are listed as follow-up features (section 7), not built here.
- **Constraints honored:** doc uses inline-code for all paths (no markdown links)
  so `test_docs.py` link verification stays green; one feature at a time.

## Test Output

```text
python3 tests/test_docs.py  -> 53 run, 53 passed, 0 failed
./init.sh                   -> VERIFIER: all gates passed (EXIT=0)
```
