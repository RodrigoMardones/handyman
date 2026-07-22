---
type: Implementation Log
feature: workstation_theme_toggle
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/backlog/impl, handyman/role/implementer, handyman/feature/workstation_theme_toggle]
---

# Implementation Report: workstation_theme_toggle

Plan G of `docs/analisis-ux-ui-workstation-2.md` (§6.4): manual
light/dark/system theme layered over `prefers-color-scheme`, without flash,
with the dark token block single-sourced in Python.

## Files Changed

- `handyman/scripts/fleet.py`
  - `import re` added.
  - The dark token reassignments moved out of the `@media` block into a
    single module-level string `_DARK_TOKENS` (now also carrying
    `color-scheme: dark`). `_HTML_STYLE` interpolates it **twice** by plain
    concatenation (no f-string, so CSS braces need no escaping): once under
    the manual selector `:root[data-theme="dark"]` and once under
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`.
    A `:root[data-theme="light"] { color-scheme: light; }` rule makes a forced
    light theme also render light native widgets under a dark OS.
  - `_THEME_COLOR_LIGHT` / `_THEME_COLOR_DARK` are **derived** from
    `_HTML_STYLE` via `re.findall(r"--hw-bg:\s*(#...)")[:2]` — the
    `<meta name="theme-color">` values can never drift from the audited
    palette because there is no second hex copy.
- `handyman/scripts/workstation.py`
  - Imports `_THEME_COLOR_DARK` / `_THEME_COLOR_LIGHT` from `fleet`.
  - `build_panel_html` head: a 3-line anti-flash IIFE `<script>` right after
    `<meta charset>` and **before** the `<style>` — reads `hw-theme:1`,
    compares against the `light`/`dark` whitelist, and only then assigns
    `document.documentElement.dataset.theme` (any other value is ignored →
    system). Two `<meta name="theme-color">` scoped with `media=`
    mirror `--hw-bg`; each carries `data-hw-token="--hw-bg"` so the W15
    "every hex sits on a `--hw-` line" grep keeps holding without a test
    exemption.
  - Nav gains `<label class="meta">theme <select id="theme">` with the three
    options `system`/`light`/`dark`, placed before the pause label.
  - `_PANEL_STYLE`: `nav label + label { margin-left: 0; }` (only the first
    trailing control absorbs the flex free space, so both controls stay
    right-aligned as a group) and a token-only `nav select` rule
    (`--hw-border-strong`, `--hw-radius-s`, surface/fg).
  - Panel JS (before `refresh()`): change handler on `select#theme` —
    `light`/`dark` write the key and the `data-theme` attribute; `system`
    removes both (`localStorage.removeItem` + `delete ...dataset.theme`),
    handing control back to the media query. On load the select syncs to the
    stored value (whitelist-checked); the head script already themed the page
    pre-paint.
  - `build_panel_html` docstring documents the theme + DOM-safety contract.
- `handyman/references/workstation.md`
  - New `### Theme` subsection under Panel Design Guidelines (between
    "Design tokens" and "Interaction contract"): the layered selector
    listing, single-sourced `_DARK_TOKENS`, versioned key `hw-theme:1` with
    whitelist semantics, anti-flash placement, DOM-safety (value assigned as
    a `data-*` attribute only, never interpreted as markup), theme-color
    metas derived from the stylesheet, and the static export inheriting the
    selectors toggle-free (§8). Heading "Theme" also pre-satisfies the Plan K
    reference check.

## Decisions

1. **Concatenation over f-string for `_HTML_STYLE`** — interpolating
   `_DARK_TOKENS` via `+` avoids doubling every `{}` in the CSS.
2. **`data-hw-token="--hw-bg"` on the theme-color metas** — keeps the W15
   no-stray-hex invariant literally true (the hex is annotated with the
   token it mirrors) instead of weakening the test with an exemption; the
   values themselves are regex-extracted from the stylesheet (single
   source).
3. **Anti-flash script as an IIFE** — zero global bindings leak into the
   main panel script's scope; three body lines per the spec.
4. **`color-scheme` follows the manual override** — `dark` inside
   `_DARK_TOKENS`, `light` under `[data-theme="light"]`, so native widgets
   (select, checkbox, dialog) match the forced theme, not just the tokens.
5. **`nav label + label` reset** — with two labels in the flex nav, both
   would otherwise get `margin-left: auto` and split the free space,
   stranding the pause control mid-bar.

## Test Additions

- `tests/test_workstation.sh` — new **W22**
  ("theme: layered dark selectors, hw-theme:1, anti-flash before <style>"):
  - panel contains `:root[data-theme="dark"]`, the original
    `@media (prefers-color-scheme: dark)`, and
    `:root:not([data-theme="light"])`;
  - panel contains `hw-theme:1`, `select id="theme"` and the three
    whitelist options;
  - exactly two `name="theme-color" media=` metas;
  - positional grep: first line matching `hw-theme:1` (the head script) is
    strictly before the first `<style>` line;
  - static `moc --html` export keeps both `[data-theme]` selectors
    (inheritance via shared `_HTML_STYLE`) and does **not** ship the toggle.
- W15 (no stray hex / no px radius literals) passes unchanged on both pages.

## Verifier Tail

```
==> lint
    lint: OK
==> build
    build: OK
==> test
    test: OK
VERIFIER: all gates passed
==> preflight: stability report complete (read-only; exit 0)
EXIT=0
```

Workstation suite: `Summary: 22 run, 22 passed, 0 failed`.

Note: the orchestrator prompt carried unresolved `undefined` placeholders
(feature name, scope, changes); the feature was identified from
`.handyman/feature_list.json` (id 87, the only `in_progress`) and
`progress/current.md`, and implemented per §6.4 / Plan G of the spec.
