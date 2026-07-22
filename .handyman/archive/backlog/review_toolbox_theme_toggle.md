---
type: Review Log
tags: [handyman/backlog/review]
feature: toolbox_theme_toggle
feature_id: 20
plan: B
role: reviewer
status: approved
verdict: APPROVED
updated: 2026-07-17
---

# Review: toolbox_theme_toggle (Plan B)

Light/dark/system theme control for the React toolBox panel, layered over the
existing `--hw-*` tokens. Spec: `docs/analisis-ui-observador-toolbox.md`
(Plan B §3 + "Theme toggle 2026" bullet in §2, legacy §6.4 contract).
Implementation report: `backlog/impl_toolbox_theme_toggle.md`.
Diff reviewed on `feat/toolbox-ui-observer` (uncommitted):
`handyman/src/toolbox_serve.ts`, `handyman/assets/toolbox_panel.js`,
`tests/test_toolbox_serve.sh`.

## Per-criterion check

### 1. Synchronous anti-flash inline script in `panelHtml()` head — PASS

`toolbox_serve.ts` `panelHtml()`: `<script>` placed after `${FAVICON_LINK}`
and **before** `<style>${HTML_STYLE}${PANEL_CSS}</style>` and every body
script. Synchronous (no `defer`/`async`/`type=module`). Reads
`localStorage.getItem("hw-theme:1")`; strict-equality whitelist — only the
literals `"light"`/`"dark"` reach `document.documentElement.dataset.theme`;
anything else (missing key, corrupt value, hostile markup) is ignored and the
attribute stays absent (system mode). Entire body wrapped in `try/catch`, so
disabled/denied storage cannot break the page. `var` avoids TDZ.

**Injection surface: clean.** The script block is a static portion of the
template literal — no `${}` interpolation inside it; the only dynamic value
in `panelHtml()` head/body (`initialState`) is elsewhere and `<`-escaped. The
stored value is only ever assigned through the `dataset` API (attribute-value
semantics, never parsed as HTML) and only after the whitelist. No CSP header
is set by the server (verified by grep), so the inline script is not blocked.

### 2. 3-state control, aria-pressed, system semantics, listener gating — PASS

`toolbox_panel.js` `ThemeToggle`: three buttons (`light`/`dark`/`system`)
inside `role="group"` `aria-label="color theme"`; `aria-pressed=${mode === m}`
— React renders `aria-pressed="false"` on inactive buttons (correct ARIA
toggle semantics, attribute kept), true only on the active one.

- `applyTheme("system")` → `localStorage.removeItem(THEME_KEY)` (deletes the
  key per the doc's "borrar la clave" contract) + `delete
  document.documentElement.dataset.theme` — the media query takes over
  immediately. Explicit modes `setItem` + set the attribute. Storage calls
  try/catch-wrapped.
- **Listener leak: none.** The `useEffect` keyed on `[mode]` returns
  `undefined` before `addEventListener` unless `mode === "system"`; its
  cleanup `removeEventListener`s on every mode switch and on unmount. React
  runs cleanup before each re-run, so repeated toggles in/out of system
  cannot stack listeners; in explicit modes the listener does not exist.
- Handler is a defensive `delete dataset.theme` (in system mode the
  attribute is already absent); repaint is the media query's job. Acceptable.

**Unexpected localStorage value:** `storedTheme()` normalizes anything not
exactly `"light"`/`"dark"` to `"system"` (try/catch → `"system"` too), so the
control and the anti-flash script agree. The stale garbage key itself lingers
until the user picks a mode — harmless, both readers normalize (note only).

### 3. Persistence + tokens-only, composition with existing CSS — PASS

Explicit modes persist via `setItem`; on reload the head script re-applies
before first paint and `useState(storedTheme)` initializes the control to the
same value — no hydration flash. Composition against `toolbox.ts` ~1017-1071
verified:

- explicit **light under dark OS**: `:root[data-theme="light"]` sets
  `color-scheme: light` and the dark media block is scoped
  `:root:not([data-theme="light"])` → dark tokens excluded → base light
  tokens win. Correct.
- explicit **dark under light OS**: `:root[data-theme="dark"]` applies
  `DARK_TOKENS`. Correct.
- **system**: no attribute → `@media (prefers-color-scheme: dark)` applies
  dark tokens and tracks OS changes both ways natively (CSS media queries
  are live); the JS listener is belt-and-braces per the doc.

**No new hex colors:** regex scan of all diff additions found zero
`#rrggbb`-style values; the new `nav .theme-toggle` CSS uses only existing
tokens (`--hw-surface`, `--hw-fg`, `--hw-border-strong`, `--hw-accent`,
`--hw-space-1/2`, `--hw-radius-s`, `--hw-text-xs` — all present in both the
light and dark token blocks). Active state styled via
`[aria-pressed="true"]`, so visual and accessible state cannot diverge.

### 4. Tests: new assertions, existing untouched, suite green — PASS (after re-review)

- Diff to `tests/test_toolbox_serve.sh` is purely additive (TS1b block);
  no existing assertion edited. PASS.
- `./init.sh` from repo root: **exit 0**, `VERIFIER: all gates passed`,
  toolBox suite `Summary: 15 run, 15 passed, 0 failed`. PASS.
- Second new case ("3-state theme control") greps real markers
  (`hw-theme:1`, `aria-pressed`, `prefers-color-scheme: dark`,
  `removeItem`) in the panel asset; deleting the toggle kills it. PASS.
- **First new case was vacuous — see Issue 1**; fixed and re-verified in
  the re-review section below.

## Issues

### Issue 1 — MEDIUM (was blocking; RESOLVED in re-review): anti-flash test case could not fail

`tests/test_toolbox_serve.sh`, case "panel <head> ships the synchronous
anti-flash theme script":

```sh
if printf '%s' "$BODY" | grep -q 'hw-theme:1' \
  && printf '%s' "$BODY" | grep -q 'dataset.theme'; then
```

`panelHtml()` inlines the panel asset verbatim into the body
(`<script>${panelJs}</script>`), and that asset independently contains both
markers (`hw-theme:1` via `THEME_KEY`, `dataset.theme` 3 times in
`applyTheme`/the matchMedia handler — verified by grep). So this case passes
**even if the head anti-flash script is deleted entirely**: it asserts
nothing about the head, only that the panel JS exists — which the sibling
case already covers.

The legacy review of this exact contract
(`backlog/review_workstation_theme_toggle.md`, Lens 3) identified this exact
trap and required a **positional assertion** — first `hw-theme:1` match must
land before the first `<style>` — and mutation-verified it (mutation A:
script moved after `<style>` → suite fails). That guard was lost in the
port, despite the impl report's own instruction to check the legacy review
feedback was preserved.

**Required change:** make the case positional, e.g. capture
`THEME_LINE="$(printf '%s\n' "$BODY" | grep -n 'hw-theme:1' | head -1 | cut -d: -f1)"`
and `STYLE_LINE` for `<style>`, fail on empty capture or
`THEME_LINE -ge STYLE_LINE`. (Because the inlined panel JS also carries the
marker after `<style>`, the positional form is self-protecting exactly as in
the legacy suite.) No product-code change needed.

### Issue 2 — MINOR (non-blocking): asset greps target the source file

The second TS1b case greps `$PANEL` (the file at
`handyman/assets/toolbox_panel.js`) rather than served output. This is the
suite's established pattern (the pre-existing sparkline case does the same),
the served asset is read from that exact path, and the asset is additionally
inlined into `$BODY` — so drift risk is negligible. Note only; no change
required.

### Issue 3 — NOTE (non-blocking): stale garbage key lingers

A corrupt `hw-theme:1` value is normalized to system by both readers but is
only physically removed when the user next presses "system". Harmless by
design ("absence means system" is the contract); optionally `storedTheme()`
could purge non-whitelisted values, but this is not required by the spec.

## Verifier tail

```
Summary: 15 run, 15 passed, 0 failed   (test_toolbox_serve.sh)
VERIFIER: all gates passed
EXIT=0
```

## Checklist

- [x] Anti-flash script: synchronous, static (zero interpolation), whitelist,
      try/catch, before `<style>` — code verified
- [x] 3 states, aria-pressed correct, system = removeItem + delete attribute
- [x] matchMedia listener only in system mode; no stacking on toggles
- [x] Composition with `toolbox.ts` token selectors (light-under-dark-OS,
      dark-under-light-OS, system tracks both ways)
- [x] No new hex values; tokens only
- [x] Existing test assertions untouched; `./init.sh` exit 0
- [x] New anti-flash test assertion is meaningful (fixed in re-review;
      mutation independently replicated)

## Re-review (same day): Issue 1 fix verified

The implementer applied the required change (tests only; `git diff` confirms
`handyman/src/toolbox_serve.ts` and `handyman/assets/toolbox_panel.js` are
byte-identical to the previously reviewed versions).

1. **Positional assertion in place.** The case now captures
   `THEME_LINE` (first `hw-theme:1` match) and `STYLE_LINE` (first `<style>`
   match) from the served `/` body and fails on empty captures or
   `THEME_LINE -ge STYLE_LINE` — exactly the legacy W22 pattern.
2. **No longer vacuous — independently replicated, not taken from the impl
   report.** Booted `dist/toolbox_serve.js` against a scratch fixture and ran
   the assertion on the live body, then on the same body with the head
   anti-flash `<script>` block stripped:
   - real body: `theme=10 style=20` → PASS;
   - head script stripped: `theme=264 style=8` (first match falls to the
     body-inlined panel asset, after `<style>`) → **FAIL** — mutation killed;
   - for contrast, the old two-grep form still PASSed on the mutated body,
     confirming the original vacuity diagnosis and that the fix closes it.
3. **Existing assertions untouched.** The full test diff (base `08bfed1`)
   remains purely additive: the TS1b block only; every pre-existing case is
   byte-identical context.
4. **Verifier.** `./init.sh` from repo root: **exit 0**,
   `VERIFIER: all gates passed`, toolBox suite
   `Summary: 15 run, 15 passed, 0 failed` with both theme cases PASS.

Issues 2 and 3 remain non-blocking notes; no change required.

## Verdict

**APPROVED**

## Required Changes

None (Issue 1 resolved and mutation-verified in re-review).
