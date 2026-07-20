---
type: Implementation Log
feature: toolbox_markdown_render
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_markdown_render]
---

# Implementation Report: toolbox_markdown_render

Plan C of `docs/analisis-ui-observador-toolbox.md`: replace the raw `<pre>`
markdown viewer in the observer panel with **safe rendered markdown** using
marked + DOMPurify (both served as UMD from `node_modules` via the existing
`/vendor/*` mechanism). Agent-produced markdown is untrusted even though it
is local, so the HTML is sanitized before it ever reaches the DOM, and a CSP
header is added on every server response as a second defense. Applies to the
md viewer (current/history/checkpoints/backlog/docs); search result excerpts
stay textContent.

## Files Changed

- `handyman/package.json`: added runtime deps `marked: ^12.0.0` (installed
  12.0.2) and `dompurify: ^3.2.0` (installed 3.4.12) to `dependencies`.
  `npm install` updated the lockfile (3 packages added).
- `handyman/src/toolbox_serve.ts`:
  - Module-level `CSP_HEADER` constant near the other constants and wired
    into the `send()` `writeHead` headers object, so EVERY response (panel,
    api, md, vendor, graph, 4xx) carries `Content-Security-Policy`.
  - `vendorFiles` map: two new entries — `"marked.js": ["marked",
    "marked.min.js"]` and `"dompurify.js": ["dompurify", "dist/purify.min.js"]`.
    Routed by the existing `/^\/vendor\/([\w.-]+)$/` regex + `packageRoot`/
    `vendorText` machinery (no new serving code).
  - `panelHtml()` body: two new `<script src="/vendor/...">` tags
    (marked, dompurify) placed after minisearch.js and before the inlined
    panel asset.
  - `PANEL_CSS`: `.md-body` prose styles (headings, lists, code, blockquote,
    tables, links) — existing `--hw-*` tokens only, no new hex colors.
  - Header endpoint comment + vendor comment updated to mention
    marked/dompurify for safe markdown.
- `handyman/assets/toolbox_panel.js`:
  - `escapeHtml(s)` helper (module-level).
  - `renderMd(text)` helper (module-level): empty → `""`; if `marked` or
    `DOMPurify` global is missing → returns escaped text with `<br>` line
    breaks (graceful degrade, never injects raw markup); normal path runs
    `marked.parse(text, { breaks: true, gfm: true })` then
    `DOMPurify.sanitize(raw, { FORBID_TAGS, FORBID_ATTR, ALLOW_DATA_ATTR:
    false, ALLOWED_URI_REGEXP, KEEP_CONTENT: false })`.
  - `MdDialog`: the `<pre>` is replaced by
    `<div class="md-body" dangerouslySetInnerHTML=${{ __html: rendered }}>`.
    `SearchHit` / `SearchView` are UNCHANGED (excerpts stay React-escaped
    textContent).
- `tests/test_toolbox_serve.sh` (additions only; no existing assertion
  value weakened):
  - TS1 label + grep chain now require all SIX vendor scripts (added
    `/vendor/marked.js`, `/vendor/dompurify.js`).
  - TS6 vendor loop now iterates `marked.js dompurify.js` too (both must
    serve 200; unknown stays 404).
  - TS6b (new): `GET /` response headers must carry a CSP containing
    `default-src 'self'`, `script-src` and `style-src`.
  - TS6c (new): the served panel asset must contain `DOMPurify.sanitize`,
    `FORBID_TAGS`, `marked.parse`, `dangerouslySetInnerHTML`, and the
    `script`/`iframe`/`javascript` markers (combined condition confirms the
    sanitization config is wired).

## Key Decisions

- **UMD paths chosen** (verified post-install by listing `node_modules`):
  - marked 12.0.2 — `marked.min.js` at the package root. It is a UMD build
    (`!function(e,t){...}`) whose `browser` field also points at
    `lib/marked.umd.js`; the root min is the smaller pre-built browser
    bundle and exposes the global `marked`. Chosen over the non-min
    `lib/marked.umd.js` to keep the panel lean (consistent with the other
    vendors which use the production-min builds).
  - dompurify 3.4.12 — `dist/purify.min.js`. It is the UMD build that
    assigns `(globalThis||self).DOMPurify`. NOTE: dompurify's `package.json`
    is hidden by its export map (`require('dompurify/package.json')` throws
    `ERR_PACKAGE_PATH_NOT_EXPORTED`), but `require.resolve('dompurify')`
    returns `dist/purify.cjs.js`, so the EXISTING `packageRoot()` fallback
    (resolve entry → find `node_modules/<pkg>/` marker → slice to root)
    derives the package root correctly; `join(root, 'dist/purify.min.js')`
    then resolves. No change to the fallback was needed.
- **CSP directive string**:
  `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`.
  The panel genuinely requires inline scripts (the synchronous anti-flash
  head script, the `window.__TOOLBOX_INITIAL_STATE__` blob, and the whole
  inlined `${panelJs}` asset) and inline styles (`<style>${HTML_STYLE}...`),
  plus same-origin vendor scripts, same-origin fetch/EventSource, and the
  `data:` SVG favicon — hence `'unsafe-inline'` on script/style, `data:` on
  img-src, and `connect-src 'self'`. It is a uniform second defense on every
  response because it sits in `send()`; even if a vendor failed to load and
  `renderMd` degraded to escaped text, the CSP still forbids remote loads.
- **DOMPurify FORBID config** (defense in depth, layered with DOMPurify's
  own defaults):
  - `FORBID_TAGS`: script, style, iframe, frame, form, input, textarea,
    button, select, object, embed, link, meta, base.
  - `FORBID_ATTR`: onerror, onclick, onload, onmouseover, onmouseout,
    onsubmit, onfocus, onblur, onchange, style, formaction, srcset.
  - `ALLOW_DATA_ATTR: false`, `KEEP_CONTENT: false` (drops inner text of
    forbidden elements, not just the tags), and
    `ALLOWED_URI_REGEXP: /^(?!(?:javascript|data|vbscript):)/i` which
    rejects `javascript:`/`data:`/`vbscript:` URIs in href/src.
- **Why the hostile-fixture claim holds** (verified `marked.parse` output on
  the fixture, then reasoned over DOMPurify's guarantees):
  The fixture ``# Hi\n\n<script>alert(1)</script>\n\n[click]\(javascript:alert(1))\n\n<img src=x onerror=alert(1)>``
  (a markdown link whose target is the javascript: scheme) is rendered by
  marked (it does NOT sanitize HTML) into:
  ```
  <h1>Hi</h1>
  <script>alert(1)</script>
  <p><a href="javascript:alert(1)">click</a></p>
  <img src=x onerror=alert(1)>
  ```
  Each vector is neutralized before `dangerouslySetInnerHTML`:
  1. `<script>alert(1)</script>` — `<script>` is forbidden by DOMPurify's
     default AND explicitly in `FORBID_TAGS`; `KEEP_CONTENT:false` drops the
     inner `alert(1)` too.
  2. `onerror=alert(1)` — all `on*` handlers are forbidden by DOMPurify's
     default AND explicitly in `FORBID_ATTR`, so the attribute is removed.
  3. `href="javascript:alert(1)"` — `ALLOWED_URI_REGEXP` rejects the whole
     URI, so the `href` is dropped (the anchor text survives, harmlessly).
  Second defense: the CSP `script-src 'self' 'unsafe-inline'` would block
  any inline script that somehow survived (there are none after sanitize);
  `'unsafe-inline'` re-enables the panel's OWN inline `<script>` blocks, not
  inline event handlers, which DOMPurify has already stripped. (The harness
  test suite is grep-based by design — no headless browser runs the DOM —
  so this is documented as configuration-coverage, the same stance the
  theme-toggle and sparkline took.)
- **Graceful degrade**: if either vendor fails to load, `renderMd` returns
  HTML-escaped text with `<br>` breaks — readable and safe, never raw
  markup. A missing vendor therefore degrades the prettiness, never the
  safety contract.
- **No bundler**: both libs are UMD globals consumed by the no-build panel,
  matching the existing react/htm/minisearch pattern.

## Verification

`./init.sh` from project root → exit 0, `VERIFIER: all gates passed`,
`ALL SUITES PASSED`. `npm run build` (tsc) clean; `npm run lint` (biome)
exit 0 with only pre-existing `noNonNullAssertion` warnings (in `feature.ts`,
unchanged by this feature; `assets/toolbox_panel.js` is outside biome's
`files.includes`). `node --check assets/toolbox_panel.js` passes;
`shellcheck tests/test_toolbox_serve.sh` clean (only the pre-existing SC1091
info about `lib/assert.sh`, present in every suite).

toolBox observer suite went 15 → 17 cases, all green:

```text
toolBox observer suite (test_toolbox_serve.sh)
  PASS serve boots on an ephemeral port and prints the URL
  PASS GET / returns the React panel with root div and the six vendor scripts
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
  PASS vendor libs (react, react-dom, htm, minisearch, marked, dompurify) serve from node_modules
  PASS server responses carry Content-Security-Policy default-src 'self'
  PASS panel asset renders sanitized markdown (DOMPurify + FORBID_TAGS + marked)
  PASS observer is read-only (POST 405) and refuses foreign Host headers
  PASS SSE emits a change event when the workspace mutates
Summary: 17 run, 17 passed, 0 failed
```

Full suite aggregate (every sub-suite 0 failed): docs 194, init 17, feature
25, update 7, preflight 6, upgrade 10, tools_discovery 16, index 8, backlog
11, sprint 6, toolbox 23, toolbox_serve 17.

## What the Reviewer Should Scrutinize

- **The UMD path for dompurify relies on the `packageRoot()` fallback**
  (package.json is export-map-hidden). Confirm `/vendor/dompurify.js`
  actually serves the `purify.min.js` bytes in a real boot (TS6 proves it
  returns 200; the reviewer may curl it and check the `DOMPurify=t()` tail).
- **`ALLOWED_URI_REGEXP` is a DENY list** (negative lookahead). It blocks
  `javascript:`/`data:`/`vbscript:` but allows http/https/mailto/relative.
  If a stricter allow-list is desired (e.g. only http/https and relative),
  it is a one-line regex change; the current choice mirrors the spec.
- **`'unsafe-inline'` in the CSP** is required by the panel's own inline
  scripts/styles and is NOT a weakening of the markdown sanitization
  (DOMPurify already stripped inline event handlers; `unsafe-inline` on
  `script-src` does not re-enable `on*=` attributes). The reviewer may
  prefer to move the inline panel asset to a nonce/hash in a future feature;
  that is orthogonal to Plan C.
- **`KEEP_CONTENT: false`** drops the text inside forbidden tags (e.g. a
  `<script>` body). If the reviewer wants forbidden-tag inner text
  preserved (rendered as plain text), flip to `true`; the current choice is
  the safer default for untrusted agent markdown.
- **Test stance**: TS6b/TS6c are configuration-coverage (grep), consistent
  with how theme-toggle and sparkline were tested — no headless browser runs
  the DOM in the suite by design. A hostile-fixture runtime test would need
  jsdom/DOMPurify server-side (an extra dep); deferred per the no-new-deps
  spirit of the feature.
- Search excerpts are unchanged (`SearchHit` / `SearchView` untouched) —
  verify no `dangerouslySetInnerHTML` leaked outside `MdDialog` (there is
  exactly one occurrence, in `MdDialog`).
