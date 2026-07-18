---
feature: index_regen
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/index_regen]
---

# Implementation Report: index_regen

Plan D of `docs/analisis-acciones-deterministas-por-capa.md`. Report and review
scaffolded with `scripts/backlog.py`; progress recorded with `feature.py log`/`next`.

## Files Changed

- `scripts/index_md.py` (new) — regenerates `$WS/index.md` from live state:
  frontmatter `tags: [handyman/moc]`, title from `project_name`, `## Features`
  grouped by status (in_progress/pending/blocked listed, done counted), backlog
  reports as wikilinks, existing docs/progress as wikilinks. Emits markdown links
  only for `feature_list.json` / `feature-request.md` (existence-gated, so the T2
  link check stays green) and preserves a `## Notes` block across regenerations.
- `tests/test_index.sh` (new, wired into `tests/run_tests.sh`) — 5 cases:
  frontmatter/title/features, backlog wikilinks, `## Notes` preservation,
  existence-gated links, and the missing-feature_list error.
- `references/obsidian.md` (Map Of Content paragraph) and `references/anatomy.md`
  (Optional Support Files row).

## Design Notes

- Wikilinks for vault-internal targets keep the MOC Obsidian-native while leaving
  T2 (which only checks `[text](target)`) with just two always-resolvable links.
- `## Notes` preservation is the "interactive" half (operator notes) called out in
  the plan; everything else is regenerated deterministically.
- Dogfooded: the repo's own `index.md` was regenerated (handyman / id 23 in
  progress / 21 done) and the verifier — including T2 — stayed green.

## Test Output

```text
bash tests/test_index.sh -> 5 run, 5 passed, 0 failed
./init.sh                -> ALL SUITES PASSED; lint: OK; T2 links resolve; EXIT=0
```
