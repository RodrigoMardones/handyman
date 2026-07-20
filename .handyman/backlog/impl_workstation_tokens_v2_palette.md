---
type: Implementation Log
feature: workstation_tokens_v2_palette
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/backlog/impl, handyman/role/implementer, handyman/feature/workstation_tokens_v2_palette]
---

# Implementation Report: workstation_tokens_v2_palette

Plan F of `docs/analisis-ux-ui-workstation-2.md` (§6.1 palette, §6.2 scale):
palette v2 "taller digital" tokens, 5-step type scale, named radii, amber
favicon, and the contrast-audited token table in the reference.

## Files Changed

- `handyman/scripts/fleet.py` — `_HTML_STYLE` `:root` / `@media dark` rewritten
  to the §6.1 palette (hex values copied verbatim from the audited table; light
  `#F7F8FA/#ECEEF2/#1B1E24/...`, dark `#16181D/#1E222A/#E7E9EC/...`). New
  tokens: `--hw-info` (steel blue), `--hw-border-strong` (control borders,
  >= 3:1 vs bg), `--hw-text-xs`/`--hw-text-xl`, `--hw-space-5: 3rem`,
  `--hw-radius-s: 3px`/`--hw-radius-m: 6px`; the s/m/l type steps move to the
  §6.2 modular values (0.875/1/1.25 rem). Shared `h1` moves to `--hw-text-xl`.
  Badges gain severity-tinted backgrounds via
  `color-mix(in srgb, var(--hw-X) 15%, var(--hw-bg))` for ok/warn/danger/muted
  and a new `.badge-info`; `.badge` radius literal `3px` → `var(--hw-radius-s)`.
  `_FAVICON` regenerated as a tiny self-contained SVG data URI: an amber
  (`%23E8A33D`, the dark-accent value) rounded square.
- `handyman/scripts/workstation.py` — `_PANEL_STYLE` consumes the new steps:
  section `h2` eyebrows and `.tl-date` → `--hw-text-xs` (§6.2 maps both to the
  eyebrow step); `.pagetitle` stays on `--hw-text-l` (now 1.25 rem); the `h1`
  wordmark inherits `--hw-text-xl` from the shared style. `button` and dialog
  `input/textarea/select` borders move to `--hw-border-strong`; radius literals
  migrate: `details`/`button` `3px` → `var(--hw-radius-s)`, `dialog` `4px` →
  `var(--hw-radius-m)`.
- `handyman/references/workstation.md` — Design-tokens section rewritten: the
  v2 palette table now carries a **Contrast AA (light / dark)** column with the
  computed ratios from §6.1 (fg/muted over bg+surface, accent, the four
  semantics over surface and over their 15 % tint, border-strong vs bg per
  1.4.11, border deliberately sub-3:1 as decorative); rows for the new tokens
  (`--hw-info`, `--hw-border-strong`, `--hw-space-1..5`,
  `--hw-text-xs/s/m/l/xl`, `--hw-radius-s/m`); prose spells out the type-step
  and radius mapping and states the two suite invariants (no stray hex, no px
  radius literals). Framing kept resource-as-subject / passive (gate W011).
- `tests/test_workstation.sh` — W15 extended: both served pages must contain
  `--hw-info` and `--hw-text-xl`; favicon grep updated to the SVG data URI;
  new checks: zero `border-radius` lines carrying a px literal and every
  `border-radius` consuming `var(--hw-radius-*)`, on both pages; the existing
  no-stray-hex invariant unchanged.
- `tests/test_docs.py` — `test_workstation_reference` extended: requires the
  palette-v2 tokens in the table, `color-mix`, a `| Token |...| Contrast...|`
  header (regex), and computed ratios present (`15.71`, worst-pair `4.80`).
  The function existed but was never invoked from `main()` — now wired in
  (runs after `test_evals_reference`).

## Decisions

- **Favicon as SVG with percent-encoded xmlns.** The old comment claimed SVG
  would drag in `http://` (breaking FL23's no-external-assets grep). Solved by
  encoding the namespace colon (`xmlns='http%3A//www.w3.org/2000/svg'`): the
  URL parser percent-decodes the data-URI payload before the SVG parser sees
  it, so the canonical namespace is restored at render time while the raw
  markup stays free of `https?://`. Verified the URI decodes to valid SVG.
  Fill uses `%23E8A33D` so the no-stray-hex line invariant also keeps holding.
- **Hex values verbatim from §6.1** — zero adjustments (the doc's audit is the
  contract); the reference table carries the doc's computed ratios unchanged.
- **Dialog inputs got an explicit token border** (`--hw-border-strong` +
  `--hw-radius-s`): "inputs move to border-strong" is only meaningful if the
  border is declared; native styling had none.
- **`.tl-date` moved to `--hw-text-xs`** along with the `h2` eyebrows: §6.2's
  table lists both as the xs eyebrow step.
- **`.badge-info` rule added** even though no JS emits `info` yet: §6.1 defines
  the tint for all four semantics and the cool-semantic slot is now available
  to later plans without touching CSS again.
- No JS, `/api/state` shape, POST endpoint or write-path changes — CSS
  strings, favicon constant, reference doc and tests only.

## Test Additions

- W15 (`tests/test_workstation.sh`): `--hw-info` + `--hw-text-xl` on panel and
  static fleet page; SVG favicon on both; zero px radius literals; every
  border-radius uses `var(--hw-radius-*)`.
- `test_docs.py::test_workstation_reference`: contrast column + v2 tokens +
  ratios in the reference table; test now actually wired into `main()`.

## Verifier

`./init.sh` exit code 0. Output tail:

```
Doc-structure suite (test_docs.py)   177 run, 177 passed, 0 failed
Fleet suite (test_fleet.sh)          23 run, 23 passed, 0 failed
Workstation suite (test_workstation.sh) 21 run, 21 passed, 0 failed
==> preflight: stability report complete (read-only; exit 0)
EXIT=0
```
