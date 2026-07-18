---
feature: workstation_detail_declutter
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/role/implementer, handyman/feature/workstation_detail_declutter]
---

# Implementation Report: workstation_detail_declutter

## Files Changed

- `handyman/scripts/workstation.py` — `renderHarness` reordered: breadcrumb → `.pagetitle` with the project name → identity meta → **Actions** (draft badge + stage buttons) → **Status** (one strip: `idle`/`working` badge + session + relative last closure + signals) → Queue → per-harness Timeline without the redundant project prefix (`fmt.timelineEntry(t, omitProject)`); `queueSection` folds `done`/`blocked` groups into `<details>` (open queue stays visible) and items drop the redundant status suffix (`fmt.queueItem`); new `plural()` helper replaces every lazy `(s)` (aggregate, signals badge, group counts); CSS: `ul` reset (no bullets, flush left), `.pagetitle`, bordered fit-content `details`, `.stage > span` label column so the action buttons align.
- `tests/test_workstation.sh` — new W19: pagetitle present, collapsible queue groups, `plural()` shipped and no `(s)` left, `omitProject` timeline variant, `ul` reset, and Actions rendering before Queue (source-order check).

## Design Notes

- Verified visually against the real registry with headless-Chrome captures (scratchpad `f82-harness.png`, `f82b-harness.png`): the 80-done wall now folds to one `▶ done · 80 features` row and the detail fits in ~1.5 screens with Actions above the fold.
- Two polish iterations from the screenshots: `details` at `fit-content` (a full-width empty bar read oddly) and a fixed-width stage label column (buttons aligned).

## Test Output

```text
tests/test_workstation.sh: 19 run, 19 passed (new W19 green)
bash tests/run_tests.sh: ALL SUITES PASSED
```
