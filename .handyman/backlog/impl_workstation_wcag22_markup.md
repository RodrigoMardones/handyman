---
feature: workstation_wcag22_markup
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/backlog/impl, handyman/role/implementer, handyman/feature/workstation_wcag22_markup]
---

# Implementation Report: workstation_wcag22_markup

Plan H of `docs/analisis-ux-ui-workstation-2.md` (§7, evidence §2.2): the
WCAG 2.2 pass over markup and focus — landmarks, per-view headings with
managed focus, dialog and form aria associations, described tables, motion
preference and target size. Markup and behavior only; `/api/state` shape,
the 5 POST endpoints, the write path (feature.py argv) and `SKILL.md` are
untouched.

## Files Changed

- `handyman/scripts/workstation.py`
  - **`<main>` landmark**: the three routed `<section>`s now sit inside
    `<main>` (1.3.1 / 2.4.1); header, nav, statusline and footer stay
    outside as their own landmarks.
  - **Wordmark demoted**: the appbar `<h1>` is now
    `<p class="wordmark">` — same look via
    `.wordmark { font-size: var(--hw-text-xl); font-weight: 700; margin: 0 }`
    (replaces the old `header.appbar h1` rule) — so each view owns the
    document's only `<h1>` (2.4.6).
  - **Per-view `<h1>`s with focus management**: `#view-fleet` and
    `#view-timeline` carry static `<h1 id="h1-fleet|h1-timeline"
    tabindex="-1">` (the old eyebrow `<h2>`s they replace); `#view-harness`
    carries `<h1 id="h1-harness" class="pagetitle" tabindex="-1">` whose
    textContent `renderHarness` sets to the harness name (the old
    `p.pagetitle` append is gone; the class stays live on the h1 and
    `.pagetitle` keeps only its margin — the shared `h1` rule supplies the
    xl size, so all three view titles match). New JS: `VIEW_H1` map,
    `viewTitle(r)`, and `focusView()` — every `hashchange` re-renders, then
    focuses the active view's h1 and sets
    `document.title = "<view> · Handyman Workstation"` (2.4.3, 4.1.3);
    `render()` also sets the title so first paint and deep links are named.
    Focus is only moved on hashchange, never on the 7s poll re-render.
  - **Dialog aria + focus return**: `<dialog id="dlg"
    aria-labelledby="dlg-title" aria-describedby="dlg-help">`; `openForm`
    gives the `<h3>` `id="dlg-title"` and the `.dlghelp` paragraph
    `id="dlg-help"` (`form.replaceChildren()` removes the previous pair, so
    the ids stay unique). `actionButton` passes itself as the trigger;
    `openForm` records it in `dlgOpener` and a single `close` listener
    returns focus to it on every close path (Cancel, Esc, successful
    submit), skipping openers a refresh re-render has detached.
  - **Field help + validity to AT**: `labeled()` now gives the help
    `<small>` an id derived from the field name (`help-<name>`, unique per
    rebuilt form) and points the control at it via `aria-describedby`
    (3.3.2). Two form-level listeners surface native validation: `invalid`
    (captured — it does not bubble) sets `aria-invalid="true"` on the
    blocked control; `input` removes it as soon as `validity.valid` holds.
  - **Panel table described**: `<caption class="visually-hidden">` plus
    `scope="col"` on all 8 headers (the four `.num` headers keep
    `class` first: `<th class="num" scope="col">`).
  - **Target size (2.5.8)**: `button { min-height: var(--hw-space-4) }` —
    2rem = 32px, above the 24px floor, from an existing token (Plan H adds
    no tokens).
  - `build_panel_html` docstring documents the whole a11y contract; all new
    DOM writes remain `textContent`/`setAttribute`-with-static-ids — no
    harness string ever becomes markup (gate W011 intact).
- `handyman/scripts/fleet.py`
  - `_HTML_STYLE` (shared by both pages) gains the `.visually-hidden`
    utility (clip-path pattern) and the `@media (prefers-reduced-motion:
    reduce)` block neutralizing animation/transition durations and smooth
    scrolling (2.3.3). Token-free rules: the W15 no-stray-hex and
    no-px-radius invariants hold untouched.
  - `build_fleet_html`: content wrapped in `<main>`; the table gains
    `<caption class="visually-hidden">` and `scope="col"` on all 9 headers.
    Still zero scripts/URLs (FL23's self-contained contract green).

## Decisions

- **`<main>` on the static page too**: Plan H names `build_panel_html`, but
  the test contract greps both served pages and the landmark costs one tag
  on the export — both pages now answer the same structural greps.
- **W20 grep relaxed by one character**: its exact literal
  `<th class="num">` predates Plan H, which mandates `scope="col"` on those
  same cells. The pattern is now `<th class="num"` (trailing `>` dropped,
  attribute order keeps `class` first), preserving the assertion's intent
  (right-aligned num headers) — annotated in the test.
- **Focus only on hashchange**: `render()` runs on every poll; moving focus
  there would steal it every 7s. Title updates are idempotent and safe in
  `render()`; `heading.focus()` lives only in the `hashchange` listener.
- **Focus return skips detached openers**: after a successful submit the
  triggering button is re-created by the post-action refresh; the close
  listener checks `isConnected` instead of focusing a dead node. Re-focusing
  the re-rendered equivalent is render-diffing work (Plan K territory).
- **No new tokens**: 2.5.8 is met with `--hw-space-4` (32px ≥ 24px); the
  Plan F token set is closed.
- `handyman/references/workstation.md` already states (from Plan F)
  "`--hw-text-xl` for the view `h1` / wordmark" — the doc and this change
  agree; Plan H lists no reference edits.

## Test Additions (`tests/test_workstation.sh`)

- **W23** ("a11y: main landmark, captions+scope, per-view h1 focus, dialog
  and field aria"), fixture mirroring W15/W22 (server + `moc --html`):
  - both pages: `<main>`, `scope="col"`, `<caption class="visually-hidden"`,
    `.visually-hidden` utility, `prefers-reduced-motion`;
  - panel-only: `<p class="wordmark">`, **no** attribute-less `<h1>` left,
    the three `id="h1-*" ... tabindex="-1"` headings, `heading.focus()`,
    `document.title` plus the `· Handyman Workstation` title template,
    `aria-labelledby="dlg-title"`, `aria-describedby="dlg-help"`,
    `dlgOpener` (focus return), `setAttribute("aria-describedby"`,
    `setAttribute("aria-invalid"` **and** `removeAttribute("aria-invalid")`
    (set on error, cleared on fix), `min-height: var(--hw-space-4)`.
- **W20**: pattern `<th class="num">` → `<th class="num"` (see Decisions).
- Suite: 23 run, 23 passed. Generated panel JS also validated with
  `node --check` during development (not part of the suite).

## Verifier

`./init.sh` → exit 0.

```
    tools: OK
    files: OK
    state: OK
    validate: OK
    lint: OK
    build: OK
  177 run, 177 passed, 0 failed
    test: OK
VERIFIER: all gates passed
```
