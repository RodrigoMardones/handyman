---
feature: feature_tools_provenance
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/feature_tools_provenance]
---

# Implementation Report: feature_tools_provenance

## Files Changed

- `handyman/scripts/feature.py` — `done` gains optional `--tools` (help shows the format, e.g. `skills: handyman, ponytail; agents: reviewer`); the rich history entry now carries a `- **Tools:** <value>` line between Changes and Verification; omitted flag → the narrative placeholder `...` (same convention as Plan/Changes).
- `handyman/references/workflow.md` — Leader Protocol #4: before converting the form, validate `## Tools` against the declared `discovery` block via `tools_discovery.py check` and close gaps deterministically with `declare` (or correct the form). Closure Protocol #3: headed form now lists Tools; pass `--tools` to record what was actually consulted (input for future selection).
- `tests/test_feature.sh` — +F18: two closes in one fixture — with `--tools` → exact provenance line in history; without → placeholder `...`; 17→18. F12 (rich headed fields) green unchanged — regression proof.

## Design Notes

- Plan E of `docs/analisis-workflow-etapas.md`: closes the loop intent → contract → verification → provenance. Selection is validated at intake (vs discovery) and recorded at closure (vs actual usage); `metrics.py` (plan B) can aggregate the line later.
- No schema/contract change: provenance lives in the history artifact (derive-don't-declare boundary).

## Test Output

```text
test_feature.sh: 18 run, 18 passed, 0 failed
shellcheck clean; py_compile OK
./init.sh -> EXIT=0
```
