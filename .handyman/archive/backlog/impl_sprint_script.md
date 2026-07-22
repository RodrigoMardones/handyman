---
type: Implementation Log
feature: sprint_script
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/sprint_script]
---

# Implementation Report: sprint_script

## Files Changed

- `handyman/scripts/sprint.py` (NEW): open/close/status lifecycle. Imports `resolve_workspace` (validate_harness) + `history_closures`/`backlog_reports` (metrics.py) - no reimplementation. `open <id>`: validates `^\d{4}-SP\d+$`, rejects a second open sprint, stamps unlabeled pending/in_progress features, records `current_sprint` in harness.config.json + feature_list config mirror (post_run precedence pattern). `close`: derives `docs/sprints/sprint.<id>.md` from template, archives done features to `archive/feature_archive.json` (keyed by sprint), strips labels from carry-over, clears current_sprint; `--dry-run` previews; rejects in_progress labeled features and existing doc. `status`: read-only report.
- `handyman/assets/sprint.template.md` (NEW): frontmatter sprint/status/updated/tags + Identity/Features/Metrics/Tools/Achievements(manual)/Lessons(manual)/Carry-over. Wikilink-and-inline-code only (T2-safe when instantiated under the workspace, which test_docs walks).
- `tests/test_sprint.sh` (NEW, S1-S8) wired as 12th suite in `tests/run_tests.sh`.

## Design Notes

- Template ships WITH the script (backlog.py precedent from feature 21) instead of plan D - each feature stays self-contained and green.
- Derived-not-maintained: doc content comes from history headings (period, Tools/Branch bullets), backlog frontmatter (verdicts, coverage), feature_list (table, carry-over). Branch bullets are forward-compatible with plan C (render `-` until they exist).
- `open` requires somewhere to record current_sprint (harness.config.json or a feature_list config block) - explicit error instead of inventing a config.
- GOTCHA found by review: assert.sh ends suites with `summary`, not `finish_suite`.

## Test Output

```text
tests/test_sprint.sh: 8 run, 8 passed, 0 failed
shellcheck -S warning tests/test_sprint.sh: clean; py_compile sprint.py: OK
./init.sh -> EXIT 0
```
