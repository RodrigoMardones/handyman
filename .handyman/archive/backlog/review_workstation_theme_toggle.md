---
type: Review Log
tags: [handyman/backlog/review]
feature: workstation_theme_toggle
feature_id: 87
plan: G
role: reviewer
status: approved
verdict: APPROVED
updated: 2026-07-02
---

# Review: workstation_theme_toggle (Plan G)

Manual light/dark/system theme layered over `prefers-color-scheme`, no flash.
Spec: `docs/analisis-ux-ui-workstation-2.md` §6.4 + Plan G (§7).
Implementation report: `backlog/impl_workstation_theme_toggle.md`.

This review completes an earlier interrupted run. Two lenses had already
been executed and reported PASS before the interruption; this pass adds the
missing test-quality lens, the DOM-safety spot-check, and the environment
gates, then issues the verdict.

## Lens 1 — Spec compliance (prior run): PASS

Reported "fully implemented per spec" in the interrupted run: layered
selectors (`:root[data-theme="dark"]` + `@media (prefers-color-scheme:
dark) { :root:not([data-theme="light"]) }`), single-sourced `_DARK_TOKENS`,
versioned `hw-theme:1` key with whitelist semantics, anti-flash head
script, `select#theme` control, scheme-scoped theme-color metas derived
from the stylesheet, static fleet page inheriting selectors toggle-free.

## Lens 2 — Constraints / scope (prior run): PASS

Reported in the interrupted run: only expected files changed, existing
contracts preserved (W15 no-stray-hex holds via `data-hw-token`
annotation, no test weakened, no new dependencies).

## Lens 3 — Test quality (this run): PASS

W22 (`tests/test_workstation.sh` lines 657-706, "theme: layered dark
selectors, hw-theme:1, anti-flash before <style>") traced and
mutation-tested on a scratch copy under `/private/tmp` (repo untouched).

**Targets served output, not source.** `PANEL="$HTTP_BODY"` comes from
`http GET /` (curl against a live `workstation.py serve` on an ephemeral
port); `FLEETPAGE` is `cat "$FR/index.html"` after a real `fleet.py moc
--html` run. Every grep runs on those variables — none touch the `.py`
sources.

**Positional assertion is real.** `THEME_LINE` = first line matching
`hw-theme:1`, `STYLE_LINE` = first line matching `<style>`; fails on empty
capture or `THEME_LINE -ge STYLE_LINE`. Because the body panel script also
contains `hw-theme:1` (comment + localStorage calls), deleting or moving
the head script cannot pass vacuously — the first match then lands after
`<style>`.

**Static fleet page inheritance check exists** (lines 695-700): positive
greps for both `[data-theme]` selectors on the export, plus a negative
grep asserting `select id="theme"` is absent from the static page.

**Mutation results** (trimmed W22-only runner: suite helpers lines 1-84 +
case lines 657-708; baseline `1 run, 1 passed`, exit 0):

| Mutation (scratch copy) | Expected | Result |
|---|---|---|
| A: anti-flash `<script>` moved after `<style>` in `workstation.py` | FAIL | FAIL — "theme script not before first \<style\> (theme=185 style=10)", exit 1 |
| B: `:root[data-theme="dark"]` renamed to `:root.theme-dark` in `fleet.py` `_HTML_STYLE` | FAIL | FAIL — "fleet page inherits [data-theme] selectors", exit 1 (panel grep also fired; `_PANEL_STYLE = _HTML_STYLE + …` so both pages lost the selector, later WHY overwrites) |
| C: `select id="theme"` injected into the static fleet `<body>` in `fleet.py` | FAIL | FAIL — "fleet static page must not ship the toggle", exit 1 |

All three mutations killed. Also verified: exactly-two theme-color-meta
count uses `grep -c ... = 2` (0 or 1 metas would fail); the three
whitelist options are individually asserted.

Minor, non-blocking: when several greps fail, `WHY` reports only the last
failure (OK latches to "no" regardless) — a diagnostic quirk shared by
every case in this suite, not a correctness gap. Runtime localStorage
behavior is not simulated (curl-based suite, no browser); covered instead
by code inspection below and the documented contract in
`references/workstation.md` §Theme.

## DOM-safety spot-check (this run): PASS

`handyman/scripts/workstation.py`:

- Anti-flash IIFE (head, lines 358-361): `var t =
  localStorage.getItem("hw-theme:1"); if (t === "light" || t === "dark")
  document.documentElement.dataset.theme = t;` — strict-equality whitelist;
  the value is only ever assigned through the `dataset` API (attribute
  value semantics, never parsed as HTML). Any other stored value —
  including hostile markup — is ignored and the page stays on system.
- `select#theme` handler (lines 1021-1035): stored value whitelist-checked
  before syncing `themeControl.value`; on change, `choice` is
  whitelist-checked again — only literal `light`/`dark` reach
  `localStorage.setItem` and `dataset.theme`; anything else clears both
  (`removeItem` + `delete dataset.theme`). No `innerHTML`, `eval`,
  `document.write`, or attribute-injection sink anywhere in the path;
  grep confirms these are the only consumers of `hw-theme:1`.

## Environment gates (this run): PASS

- `./init.sh` from project root: **exit 0** — all suites green (docs 177,
  init 14, update 12, feature 21, backlog 7, index 5, upgrade 10,
  tools-discovery 18, evals 7, preflight 8, metrics 6, fleet 23,
  workstation **22/22** incl. W22). Advisory NOTEs only (frontmatter on
  two older backlog files, graphify staleness, trigger re-measure) — all
  pre-existing, none blocking.
- `git status`: exactly the expected set — `handyman/scripts/fleet.py`,
  `handyman/scripts/workstation.py`, `handyman/references/workstation.md`,
  `tests/test_workstation.sh` (feature 87), plus pre-existing Plan F
  `tests/test_docs.py` and untracked spec
  `docs/analisis-ux-ui-workstation-2.md`. Nothing unexpected.
- Diff additions carry no TODO/FIXME/console.log/debugger leftovers.

## Verifier tail

```
==> test
    test: OK
VERIFIER: all gates passed
==> preflight: stability report complete (read-only; exit 0)
EXIT=0
```

Workstation suite: `Summary: 22 run, 22 passed, 0 failed`.

## Checklist

- [x] Spec compliance (prior lens, PASS)
- [x] Constraints / scope (prior lens, PASS)
- [x] Tests meaningful and green (mutation-verified, this run)
- [x] DOM-safety of theme scripts (whitelist + data-attribute only)
- [x] Verifier exits 0
- [x] Working tree matches expected file set

## Verdict

**APPROVED**

## Required Changes

None.
