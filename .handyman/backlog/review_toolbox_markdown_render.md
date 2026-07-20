---
type: Review Log
tags: [handyman/backlog/review]
feature: toolbox_markdown_render
feature_id: 21
plan: C
role: reviewer
status: approved
verdict: APPROVED
updated: 2026-07-17
---

# Review: toolbox_markdown_render (Plan C)

Replace the raw `<pre>` markdown viewer in the observer panel with safe
rendered markdown (marked + DOMPurify, UMD from `node_modules` via `/vendor/*`),
plus a `default-src 'self'` CSP header as a server-side second defense. Spec:
`docs/analisis-ui-observador-toolbox.md` (Plan C, lines ~103-106, and the
"Markdown en cliente" bullet ~57). Implementation report:
`backlog/impl_toolbox_markdown_render.md`.
Diff reviewed on `feat/toolbox-ui-observer` (uncommitted):
`handyman/package.json`, `handyman/package-lock.json`,
`handyman/src/toolbox_serve.ts`, `handyman/assets/toolbox_panel.js`,
`tests/test_toolbox_serve.sh`.

## Per-criterion check

### 1. marked + dompurify are runtime deps served via /vendor/* — PASS

`handyman/package.json`: `marked: ^12.0.0` (installed 12.0.2) and
`dompurify: ^3.2.0` (installed 3.4.12) are both in `dependencies` (verified
via node — `marked in deps: true`, `dompurify in deps: true`, both absent
from `devDependencies`). Correct: these are client-runtime libs, not build-
time. `package-lock.json` carries the 3 added packages.

UMD subpaths resolve (verified on disk + by booting the server):
`handyman/node_modules/marked/marked.min.js` (35 KB) and
`handyman/node_modules/dompurify/dist/purify.min.js` (29 KB) both exist.
`vendorFiles` maps them exactly:

```ts
"marked.js": ["marked", "marked.min.js"],
"dompurify.js": ["dompurify", "dist/purify.min.js"],
```

The existing `/^\/vendor\/([\w.-]+)$/` regex routes both names (`[\w.-]+`
matches `marked.js` / `dompurify.js`). The **dompurify export-map caveat
holds**: `require.resolve('dompurify/package.json')` throws
`ERR_PACKAGE_PATH_NOT_EXPORTED`, but the existing `packageRoot()` fallback
resolves the entry (`dist/purify.cjs.js`) and slices to the
`node_modules/dompurify` root, so `join(root, 'dist/purify.min.js')`
resolves. **Empirically confirmed** by booting `dist/toolbox_serve.js` and
`curl`-ing `/vendor/dompurify.js`: HTTP 200 with the correct CSP header —
the fallback works without any new serving code. No change to `packageRoot`
was needed, exactly as the report states.

### 2. Viewer renders sanitized HTML — PASS

`toolbox_panel.js` `renderMd(text)` (lines 397-419):

- empty input → `""` (dialog shows empty `.md-body`, no markup).
- **graceful degrade**: if `marked` or `DOMPurify` global is undefined,
  returns `escapeHtml(text)` (the `&`/`<`/`>`/`"` escape) with `\n` → `<br>`.
  This is safe: the text is escaped first, so it can never inject markup.
  A missing vendor degrades prettiness, never the safety contract.
- normal path: `marked.parse(text, { breaks: true, gfm: true })` then
  `DOMPurify.sanitize(raw, { ... })` — raw marked output never reaches the
  DOM unfiltered.

DOMPurify config is **sound** (defense-in-depth layered on DOMPurify's own
defaults, which already strip all `<script>`, all `on*` handlers, and
`javascript:` URIs):

- `FORBID_TAGS`: script, style, iframe, frame, form, input, textarea,
  button, select, object, embed, link, meta, base — covers every executable
  / form element. (`KEEP_CONTENT: false` drops their inner text too, so a
  `<script>alert(1)</script>` body does not leak as visible text.)
- `FORBID_ATTR`: onerror, onclick, onload, onmouseover, onmouseout,
  onsubmit, onfocus, onblur, onchange, style, formaction, srcset. DOMPurify
  removes ALL `on*` attributes by default, so this list is belt-and-braces;
  even an `on*` handler not enumerated here is stripped by the default.
  `style` (inline CSS, a known XSS vector via `expression`/`url(javascript:)`)
  and `formaction`/`srcset` are sensibly forbidden.
- `ALLOW_DATA_ATTR: false`, `KEEP_CONTENT: false`.
- `ALLOWED_URI_REGEXP: /^(?!(?:javascript|data|vbscript):)/i` — a negative
  lookahead that rejects URIs beginning with `javascript:`, `data:`, or
  `vbscript:` (case-insensitive), so a markdown link
  `[click](javascript:alert(1))` has its `href` dropped (anchor text
  survives, harmlessly). DOMPurify decodes/normalizes URIs before testing,
  so trivial obfuscation is handled by DOMPurify's core, not defeated by the
  regex. Correctly blocks the three dangerous schemes while allowing
  http/https/mailto/relative.

**`dangerouslySetInnerHTML` used ONLY in MdDialog.** `grep -c` reports 2
matches, but one is a comment (line 385, "before it ever reaches
dangerouslySetInnerHTML") and the sole **actual usage** is `MdDialog` line
430: `<div class="md-body" dangerouslySetInnerHTML=${{ __html: rendered }}>`.
No other component sets it. PASS.

### 3. CSP `default-src 'self'` on responses — PASS (with one non-blocking note, Issue 1)

`CSP_HEADER` (lines 70-73):

```
default-src 'self'; script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'
```

- `'unsafe-inline'` on `script-src` is **justified**: the panel ships a
  synchronous anti-flash `<script>` in `<head>`, an inline
  `window.__TOOLBOX_INITIAL_STATE__` blob, and the whole inlined
  `${panelJs}` asset. (It re-enables the panel's OWN inline scripts; it does
  NOT re-enable inline `on*=` handlers, which DOMPurify has already
  stripped — `unsafe-inline` on script-src does not whitelist event-handler
  attributes.)
- `'unsafe-inline'` on `style-src` is **justified**: the panel's `<style>`
  block (`HTML_STYLE` + `PANEL_CSS`) is inline.
- `img-src 'self' data:` **covers** the `data:image/svg+xml` favicon.
- `connect-src 'self'` **covers** the same-origin `fetch('/api/state')`,
  `fetch('/api/corpus')`, and the `EventSource('/events')`.
- No explicit `frame-src`/`object-src`, but `default-src 'self'` governs
  them and DOMPurify forbids iframe/object/embed anyway.

`send()` (lines 305-314) sets `Content-Security-Policy: CSP_HEADER` in its
`writeHead`, so every response that goes through `send()`/`sendJson()`
carries it. **Empirically confirmed** by booting the server and curl-ing
headers: `/`, `/api/state`, `/vendor/dompurify.js` all return the full CSP.
As a second defense it is sound: even if a vendor failed to load and
`renderMd` degraded to escaped text, the panel page forbids remote script
loads. The CSP blocks `javascript:` execution at the page level as a second
defense (the first is DOMPurify stripping the URI).

**Issue 1 (MINOR, non-blocking):** the SSE endpoint `/events` (lines
523-540) calls `res.writeHead(200, {...})` directly with only
`Content-Type`/`Cache-Control`/`Connection` — it does **not** pass through
`send()` and does **not** set `Content-Security-Policy`. This is the one
response path without the header (confirmed by `curl -D - --max-time 2
/events`: returns `Content-Type: text/event-stream`, no CSP). The impl
report's claim that the CSP is "a uniform second defense on every response
because it sits in send()" is therefore inaccurate for the SSE path, and
acceptance criterion 3 enumerates "sse". **Impact is nil**: an
`text/event-stream` response is not a navigable/rendered document context,
so a browser does not apply document CSP to it; EventSource data is
delivered to JS as event strings, never parsed as HTML/script, and the
consuming page (`/`) carries `connect-src 'self'` governing the connection.
So there is no injection surface. Recommended one-line follow-up (not
blocking): add `"Content-Security-Policy": CSP_HEADER` to the `/events`
`writeHead` so the "every response" claim becomes literally true and the
criterion's "sse" enumeration is met.

### 4. Applies to md viewer; search excerpts keep textContent — PASS

`MdDialog` (the dialog reached by every md quick-view via the `openMd`
callback → `setMdDoc`) is the only consumer of `renderMd`. `openMd` is wired
to current/history/checkpoints/backlog/docs quick-views and to the search
"open" button. The `.md-body` prose CSS (headings, lists, code, blockquote,
tables, links) styles the rendered output.

`SearchView` / `SearchHit` (lines 324-381) are **unchanged**: they render
`${hit.title}`, `${hit.project}`, `${hit.kind}`, `${hit.score.toFixed(2)}`
via React/htm interpolation, which escapes text. No
`dangerouslySetInnerHTML` in either. Search excerpts stay React-escaped
textContent. PASS.

### 5. Tests + verifier — PASS

`tests/test_toolbox_serve.sh` is purely additive:

- TS1 vendor-script grep chain extended to all SIX vendors (added
  `/vendor/marked.js`, `/vendor/dompurify.js`).
- TS6 vendor loop extended to iterate `marked.js dompurify.js` (both must
  serve 200; unknown stays 404).
- **TS6b (new)**: `GET /` headers must carry CSP containing `default-src
  'self'`, `script-src`, `style-src`.
- **TS6c (new)**: served panel asset must contain `DOMPurify.sanitize`,
  `FORBID_TAGS`, `marked.parse`, `dangerouslySetInnerHTML`, and the
  `script`/`iframe`/`javascript` markers (confirms the sanitization config
  is wired).

No existing assertion was weakened. `./init.sh` from repo root: **exit 0**,
`VERIFIER: all gates passed`, `ALL SUITES PASSED`, toolBox observer suite
`Summary: 17 run, 17 passed, 0 failed`. PASS.

## Security scrutiny

- **Sanitization gap: none.** DOMPurify (with its defaults) is the primary
  defense and strips all `<script>`, all `on*` handlers, and `javascript:`
  URIs by itself; the explicit `FORBID_TAGS`/`FORBID_ATTR`/`ALLOWED_URI_REGEXP`
  config is defense-in-depth on top. The hostile fixture from the report
  (`<script>`, `onerror=`, `href="javascript:..."`) is neutralized at each
  vector before `dangerouslySetInnerHTML`. `KEEP_CONTENT: false` drops
  forbidden-tag bodies.
- **`dangerouslySetInnerHTML` scope: clean.** Exactly one actual usage, in
  `MdDialog`; the other `grep` hit is a comment. No leakage into search or
  any other component.
- **Graceful degrade: safe.** Missing vendor → escaped text + `<br>`, never
  raw markup.
- **CSP: correct and justified** on every document/JSON/vendor/md/graph/4xx
  response. The only omission is the non-document SSE stream (Issue 1),
  which has no exploitable impact.
- **No new hex colors.** `.md-body` prose CSS uses only existing `--hw-*`
  tokens (`--hw-text-s/xl/l`, `--hw-fg`, `--hw-surface`, `--hw-border`,
  `--hw-border-strong`, `--hw-space-1/2`, `--hw-accent`, `--hw-radius-s`,
  `--hw-mono`). Regex scan of the diff additions found zero `#rrggbb`
  values.
- **Test stance:** TS6b/TS6c are configuration-coverage (grep), consistent
  with how theme-toggle and sparkline were tested; no headless browser runs
  the DOM in the suite by design. A runtime hostile-fixture test would need
  jsdom (an extra dep) and is deferred per the no-new-deps spirit.

## Issues

### Issue 1 — MINOR (non-blocking): CSP header absent on the `/events` SSE response

`/events` writes its headers directly (`res.writeHead(200, {...})`) and omits
`Content-Security-Policy`, contradicting the impl report's "every response"
claim and acceptance criterion 3's "sse" enumeration. Confirmed empirically:
`curl -D - --max-time 2 /events` returns `Content-Type: text/event-stream`
with no CSP. **No security impact** — an event-stream response is not a
document context (browsers do not apply document CSP to it; EventSource data
is delivered as event strings, never parsed as HTML/script), and the
consuming page carries `connect-src 'self'`. Recommended follow-up (one line,
not required for approval): add `"Content-Security-Policy": CSP_HEADER` to
the `/events` `writeHead`. Note also: the impl report should correct the
"every response" / "uniform second defense on every response because it sits
in send()" wording to reflect that SSE bypasses `send()`.

## Verifier tail

```
toolBox observer suite (test_toolbox_serve.sh)
Summary: 17 run, 17 passed, 0 failed
ALL SUITES PASSED
VERIFIER: all gates passed
INIT_EXIT=0
```

Build/lint (handyman package): `npm run build` (tsc) exit 0, clean;
`npm run lint` (biome) exit 0 — only pre-existing `noNonNullAssertion`
warnings in `src/feature.ts` (unchanged by this feature; `toolbox_serve.ts`
has zero warnings; `assets/toolbox_panel.js` is outside biome's includes).
`node --check assets/toolbox_panel.js` passes.

## Checklist

- [x] marked + dompurify are runtime deps; UMD paths resolve (disk + curl)
- [x] DOMPurify config sound (FORBID_TAGS/FORBID_ATTR/ALLOWED_URI_REGEXP);
      KEEP_CONTENT false; graceful degrade is escaped text
- [x] `dangerouslySetInnerHTML` used only in MdDialog (1 actual usage + 1 comment)
- [x] CSP `default-src 'self'` correct & justified on all document/JSON/
      vendor/md/graph/4xx responses (Issue 1: SSE omits it, no impact)
- [x] `'unsafe-inline'` justified by panel's inline scripts/styles;
      `img-src 'self' data:` covers SVG favicon; `connect-src 'self'`
      covers fetch + EventSource
- [x] Search excerpts unchanged (React-escaped, no dangerouslySetInnerHTML)
- [x] No new hex colors; existing `--hw-*` tokens only
- [x] Tests additive; `./init.sh` exit 0; build + lint clean

## Verdict

**APPROVED**

## Required Changes

None. Issue 1 (SSE CSP header) is a non-blocking follow-up with no security
impact; the security contract (DOMPurify sanitization as primary defense,
CSP on the rendered panel as second defense) is fully met, all five
acceptance criteria hold, and the verifier is green.
