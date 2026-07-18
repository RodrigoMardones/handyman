---
feature: metrics_script
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/metrics_script]
---

# Implementation Report: metrics_script

## Files Changed

- `handyman/scripts/metrics.py` (NEW) — read-only aggregator of the three artifact layers: `feature_list.json` status counts, `progress/history.md` dated headings (regex `^## (\d{4}-\d{2}-\d{2}) - Feature (\d+): (.+)$` — the `YYYY-MM-DD` template line cannot match), `backlog/*.md` frontmatter via the shared `_parse_frontmatter` imported from `tools_discovery.py`; `resolve_workspace` imported from `validate_harness.py`. Reports status counts, throughput per date, review verdicts + approval rate, and done-features-without-impl+review coverage. `--json` for machine consumption. Always exit 0 (usage error 2 only), mirror of `preflight.py`.
- `tests/test_metrics.sh` (NEW, 6 cases M1–M6) — blocks + exit 0, template-line exclusion, 50% approval-rate math, missing-pair coverage flag, `--json` contract (keys + values), graceful empty harness.
- `tests/run_tests.sh` — wired as 11th suite after test_preflight.

## Design Notes

- Plan B of `docs/analisis-workflow-etapas.md`: derive, don't declare — no new state, no contract change, observes the artifacts stages already write.
- Reuse over reimplementation (ponytail rung 2): both helpers imported, not copied.
- Dogfood on the live repo: 54 done / throughput across 7 dates / 100% approval / full report coverage.

## Test Output

```text
test_metrics.sh: 6 run, 6 passed, 0 failed
shellcheck -S warning tests/test_metrics.sh: clean
./init.sh -> EXIT=0 (11 suites green)
```
