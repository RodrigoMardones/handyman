---
feature: docs_sprint_split
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/docs_sprint_split]
---

# Implementation Report: docs_sprint_split

## Files Changed

- `handyman/scripts/scaffold.sh`: `make_dir` for `docs/current` and `docs/sprints` after the docs dir (idempotent, never overwrites).
- `handyman/scripts/index_md.py`: the Docs section of the MOC now lists `docs/sprints/*.md` and `docs/current/*.md` as wikilinks after the four knowledge docs (existence-gated like everything else).
- `tests/test_init.sh`: T18 (fresh local scaffold creates both dirs).
- `tests/test_index.sh`: I6 (sprint + current docs listed as wikilinks).
- Live workspace: `.handyman/docs/current/` and `.handyman/docs/sprints/` created (dogfood; sprint.py close targets docs/sprints/).

## Design Notes

- Knowledge docs (business/architecture/conventions/verification) stay flat in docs/ - only the two period spaces are added (mirror of the progress/current -> history pair, applied to documentation).
- Wikilinks (not markdown links) because test_docs T2 walks the live workspace: wikilinks are not parsed by the link checker.

## Test Output

```text
test_index.sh: 6 run, 6 passed / test_init.sh: 16 run, 16 passed
shellcheck (scaffold.sh + suites): clean; ./init.sh -> EXIT 0
```
