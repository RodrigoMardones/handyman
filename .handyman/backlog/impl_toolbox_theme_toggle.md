---
type: Implementation Log
feature: toolbox_theme_toggle
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_theme_toggle]
---

# Implementation Report: toolbox_theme_toggle

Plan B of `docs/analisis-ui-observador-toolbox.md`: port the legacy §6.4 theme
contract to the React panel. Control layer only — the CSS tokens in
`HTML_STYLE` (toolbox.ts) already switch on `:root[data-theme="light"]`,
`:root[data-theme="dark"]` and the `prefers-color-scheme` media query; this
feature only moves the switch. Zero new colors/hex anywhere.

## Files Changed

- `handyman/src/toolbox_serve.ts`:
  - `panelHtml()` `<head>` gains a SYNCHRONOUS inline anti-flash script,
    placed before `<style>` and every body script: reads the versioned key
    `hw-theme:1`; only the literal values `"light"`/`"dark"` become
    `document.documentElement.dataset.theme`; anything else (no key,
    corrupt value) leaves the attribute absent so the media-query tokens
    rule (system mode). The whole read is wrapped in `try/catch` so
    disabled/denied storage never breaks the page.
  - `PANEL_CSS`: `nav .theme-toggle` rules — existing `--hw-*` tokens only
    (`--hw-surface`, `--hw-border-strong`, `--hw-accent`, spacing/radius);
    active state styled via the `[aria-pressed="true"]` selector, so the
    visual state and the accessible state can never diverge.
- `handyman/assets/toolbox_panel.js`:
  - `THEME_KEY = "hw-theme:1"` / `THEME_MODES = ["light","dark","system"]`,
    `storedTheme()` (try/catch; any non-explicit value normalizes to
    `"system"`), `applyTheme(mode)` — explicit modes `setItem` + set
    `data-theme`; system mode `removeItem` (DELETES the key per contract)
    + `delete dataset.theme` so the media query takes over immediately.
  - `ThemeToggle` component: 3 buttons (`light`/`dark`/`system`) inside
    `role="group"` `aria-label="color theme"`; `aria-pressed` is true only
    on the active mode; each button carries an `aria-label` ("light theme",
    …). A `useEffect` keyed on `mode` attaches the
    `matchMedia("(prefers-color-scheme: dark)")` change listener ONLY when
    `mode === "system"` (effect returns early otherwise) and the cleanup
    removes it on every mode switch — in explicit light/dark no listener
    exists at all.
  - `App` nav renders `<${ThemeToggle} />` after the statusline (matches
    the feature #19 htm/component style).
- `tests/test_toolbox_serve.sh` (TS1b, new cases only; no existing
  assertion edited):
  - "panel `<head>` ships the synchronous anti-flash theme script": greps
    the live `/` response (`$BODY`) for `hw-theme:1` and `dataset.theme`.
  - "panel asset ships the 3-state theme control": greps the served panel
    JS for `hw-theme:1`, `aria-pressed`, `prefers-color-scheme: dark` and
    `removeItem`.

## Key Decisions

- **System mode = absence of the key**, not a stored `"system"` value: the
  anti-flash script and `storedTheme()` both treat anything that is not
  exactly `"light"`/`"dark"` as system, so a future default change never
  fights a stale stored preference (the doc's "borrar la clave" contract).
- **Listener gated by the effect, not by a branch inside the handler**: the
  `useEffect` returns before `addEventListener` unless mode is system, and
  React's cleanup tears it down on switch — the listener is truly absent in
  explicit modes rather than merely inert. The handler itself only
  re-asserts `delete dataset.theme`; the repaint is the media query's job
  (CSS is the renderer, JS only holds the switch).
- **Active-state styling via `[aria-pressed="true"]`** instead of a CSS
  class, so accessibility state is the single source of truth.
- **No React state for the document attribute on mount**: the anti-flash
  script already set `data-theme` before first paint; `ThemeToggle` just
  reads the same key on mount, so server HTML and client control agree
  without a hydration flash.

## Test Output

`./init.sh` -> exit 0, `VERIFIER: all gates passed`. `npm run lint` (biome)
passes with pre-existing warnings only; `tsc` build clean; full bash suite
green (all sub-suites 0 failed).

```text
toolBox observer suite (test_toolbox_serve.sh)
  PASS serve boots on an ephemeral port and prints the URL
  PASS GET / returns the React panel with root div and the four vendor scripts
  PASS panel asset is valid JS (node --check)
  PASS panel asset ships the sparkline (accessible polyline) and fmt helpers
  PASS panel <head> ships the synchronous anti-flash theme script
  PASS panel asset ships the 3-state theme control (aria-pressed, system mode)
  PASS /api/state carries snapshots, signals, features, fleet and timeline
  PASS /api/state carries per-harness metrics (throughput, verdicts, coverage)
  PASS /api/md serves whitelisted files and refuses everything else
  PASS /api/md serves docs:<name>.md and 404s a doc the harness lacks
  PASS /api/corpus indexes features, progress, backlog and docs
  PASS /graph serves the harness graphify export and 404s the unknown
  PASS vendor libs (react, react-dom, htm, minisearch) serve from node_modules
  PASS observer is read-only (POST 405) and refuses foreign Host headers
  PASS SSE emits a change event when the workspace mutates
Summary: 15 run, 15 passed, 0 failed
```

## What the Reviewer Should Scrutinize

- The anti-flash script runs before `<style>`; confirm no code path can
  throw outside the `try/catch` (it is a single statement block; `var` used
  deliberately — no TDZ, oldest-syntax-safe).
- htm/React renders `aria-pressed=${false}` as `aria-pressed="false"` (kept
  attribute, correct ARIA toggle semantics); criterion "true only on
  active" holds — verify in a browser if in doubt.
- The matchMedia handler only deletes `dataset.theme`; in system mode the
  attribute should already be absent, so this is a defensive re-assert. If
  the reviewer prefers a stricter no-op handler, it is a one-line change.
- Legacy prior art: `.handyman/backlog/impl_workstation_theme_toggle.md`
  (same contract in the retired Python panel) — check nothing from its
  review feedback was lost in this port.
- Tests grep markers rather than executing DOM behavior (no headless
  browser in the suite by design); the behavioral surface covered is the
  served HTML/JS contract.

## Changes after review

Review `backlog/review_toolbox_theme_toggle.md` Issue 1 (MEDIUM, blocking):
the anti-flash test case was vacuous — `panelHtml()` inlines the panel asset
into `<body>`, and that asset independently contains both grep markers
(`hw-theme:1` via `THEME_KEY`, `dataset.theme` in `applyTheme`), so the case
passed even with the head script deleted.

Fix (tests only; product code untouched): the case in
`tests/test_toolbox_serve.sh` is now POSITIONAL — it captures the line number
of the FIRST `hw-theme:1` match and the first `<style>` match in the served
`/` body and fails unless both exist and the theme line is strictly before
the style line. Only the `<head>` anti-flash script can satisfy that
ordering.

Mutation evidence: temporarily stripped the `<script>/* anti-flash ...
</script>` block from `dist/toolbox_serve.js`, re-ran the suite —

```text
  FAIL panel <head> ships the synchronous anti-flash theme script
       anti-flash script not before <style> in /: theme=265 style=9
Summary: 15 run, 14 passed, 1 failed
```

(theme=265 is the body-inlined asset match; style=9 the head style tag).
Restored the dist file; `./init.sh` -> exit 0, both theme cases PASS,
`VERIFIER: all gates passed`.
