---
type: Implementation Log
feature: workstation_design_tokens
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/workstation_design_tokens]
---

# Implementation Report: workstation_design_tokens

## Files Changed

- `handyman/scripts/fleet.py` — `_HTML_STYLE` rewritten as a token sheet: all colors/spacing/type live once in `:root` (`--hw-bg/surface/fg/muted/border/accent/ok/warn/danger/backdrop`, `--hw-space-1..4`, `--hw-text-s/m/l`); the dark-mode block only reassigns variables. Added `.badge`/`.badge-{ok,warn,danger,muted}` primitives, `a`/`:focus-visible` accent rules, `_FAVICON` (16x16 PNG data URI, no xmlns/URL) + `_FAVICON_LINK`. `build_fleet_html`: favicon link, wordmark `Handyman · Fleet`, `skill <version>` in the meta line, drift cell rendered as a textual badge.
- `handyman/scripts/workstation.py` — imports `_FAVICON_LINK`; `_PANEL_STYLE` consumes tokens only (its dark block deleted — the `:root` reassignment covers it); button/dialog/h2 styles normalized to the token scales; panel head gets the favicon and the h1 becomes `Handyman · Workstation` + `skill <version>` badge; JS gains `badge()`/`verifierBadge()` and renders drift, health signals and verifier results as textual badges (text remains the primary encoding).
- `tests/test_fleet.sh` — FL23 "no external assets" refined: `<link>` allowed only as `href="data:image/` (the favicon); `https?://` and `<script` still forbidden.
- `tests/test_workstation.sh` — new W15: both pages carry `--hw-` tokens, the data-URI favicon and the wordmark+version; every line containing a hex color must be a `--hw-` token definition (stray-hex guard) on both the panel and the `moc --html` export.

## Design Notes

- Tokens are named by role, not value, and live in `_HTML_STYLE` because both pages already share that base — single source, zero style drift between the live panel and the static export (analisis-ux-ui-workstation.md, plan A / risk 2).
- PNG (not SVG) favicon: an SVG data URI needs the `xmlns` URL, which the fleet page's no-external-assets contract greps for. A PNG keeps both pages URL-free.
- `<title>` stays "Handyman Workstation" so the pre-existing W1 grep keeps matching; the wordmark with the middot lives in the h1 (asserted by W15).
- Badges add a secondary visual cue only; the textual labels (`BEHIND`, `STALE_WIP`, `green (exit 0)`) remain the primary encoding per the accessibility constraint.

## Test Output

```text
tests/test_fleet.sh: 23 run, 23 passed (FL23 self-contained check green with favicon)
tests/test_workstation.sh: 15 run, 15 passed (new W15 green)
bash tests/run_tests.sh: ALL SUITES PASSED
```
