---
feature: start_and_close_timestamps
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/start_and_close_timestamps]
---

# Implementation Report: start_and_close_timestamps

## Files Changed

- `handyman/assets/schemas/feature_list.schema.json` — added an optional `meta` definition (`started_at`, `done_at`) referenced from the `feature` definition; `additionalProperties:false` preserved, so the contract stays backward-compatible (features without `meta` still validate).
- `handyman/assets/schemas/sprint.schema.json` — NEW draft-07 schema describing the derived sprint document's frontmatter state surface, declaring `closed_at`.
- `handyman/assets/sprint.template.md` — added `closed_at:` to the frontmatter and a `- **Closed at:**` Identity line.
- `handyman/src/feature.ts` — `nowIso()` + `stampMeta()` helpers; `cmdStart` stamps `meta.started_at`, `cmdDone` stamps `meta.done_at` (real ISO 8601 via `new Date().toISOString()`); added `meta` to the `Feature` interface.
- `handyman/src/sprint.ts` — `renderDoc` computes a `closedAt` ISO timestamp and applies `<closed_at>` in the derived document (calendar `today` still feeds only the human-facing date headings).
- `handyman/src/core/schema.ts` — compiles `sprint.schema.json` and exports `validateSprint`.
- `handyman/src/core/index.ts` — re-exports `validateSprint`.
- `handyman/src/core/schema.test.ts` — vitest cases for `meta` validation (accept/reject) + `validateSprint`.
- `tests/test_feature.sh` — F26 (start stamps `meta.started_at` ISO 8601), F27 (done stamps `meta.done_at` ISO 8601).
- `tests/test_sprint.sh` — S12 (close stamps `closed_at` in the sprint doc).
- `tests/test_docs.js` — `testFeatureMeta` + `testSprintSchema` doc-schema checks.

## Design Notes

- Timestamps use the real wall-clock `new Date().toISOString()` (UTC, e.g. `2026-07-17T12:34:56.789Z`). The `--date` flag only backdates the human-facing calendar date headings in `progress/current.md`/`history.md`; it never overrides the exact moment, which is what the observer needs for precise duration/throughput metrics.
- `meta` is a nested object (not top-level feature keys) to keep the feature state machine uncluttered; `started_at`/`done_at` are the only members. A freshly `add`ed feature has no `meta`; it appears on first `start`.
- Schemas use ISO 8601 `pattern` (not `format: "date-time"`) to match the repo convention (every other field uses `pattern`) and to avoid Ajv's "unknown format ignored" stderr warnings, which were contaminating `--json` test output. Confirmed all suites green after the switch.
- `closed_at` lands in the sprint doc frontmatter (machine-readable state) and the Identity section (human-readable), both replaced from one `closedAt` value.

## Test Output

```text
typecheck: TC=0
build:     BUILD=0
bash tests/run_tests.sh: TESTS=0  -> ALL SUITES PASSED
bash init.sh: INIT=0

New passing cases:
  PASS start: stamps meta.started_at as an ISO 8601 timestamp
  PASS done: stamps meta.done_at as an ISO 8601 timestamp on close
  PASS close: the sprint document carries an ISO 8601 closed_at
  PASS feature schema declares an optional meta field
  PASS feature meta honors additionalProperties:false
  PASS feature_list accepts a feature carrying a valid meta
  PASS feature meta rejects unknown keys
  PASS sprint schema declares closed_at
  PASS sprint schema accepts a valid closed frontmatter with closed_at
  PASS sprint schema rejects unknown frontmatter keys

Functional check (temp harness):
  node dist/feature.js start demo -> features[0].meta.started_at = 2026-07-18T03:22:36.301Z
  node dist/sprint.js close        -> doc frontmatter closed_at = 2026-07-18T03:22:49.932Z
  node dist/validate_harness.js    -> OK (contract unbroken)
```
