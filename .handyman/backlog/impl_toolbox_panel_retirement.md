---
type: Implementation Log
feature: 49
role: implementer
status: implemented
updated: 2026-07-18
tags: [handyman/backlog/impl]
---

# Implementation report: toolbox_panel_retirement (#49)

## Summary

Fase de cierre del panel UMD legacy. Con la paridad visual alcanzada en
apps/web (features 39-48, cubiertas por `tests/test_web_*.sh`), se borra el
panel React sin build (`assets/toolbox_panel.js`), las constantes
`panelHtml`/`PANEL_CSS`/`PANEL_JS_PATH` de `toolbox_serve.ts`, los seis
vendors UMD (`react`/`react-dom`/`htm`/`marked`/`dompurify`/`minisearch`)
del `vendorFiles` de `toolbox_assets.ts` y las seis deps equivalentes de
`handyman/package.json`. Queda solo `/vendor/vis-network.js` (renderer de
graphify, rewrite same-origin de unpkg).

Decision **D6** registrada: la app unificada sirve `/` = landing de apps/web
(`app/page.tsx`, feature `toolbox_next_landing`, cubierta por
`tests/test_web_landing.sh`). Durante el strangler el server Node sigue vivo
y su `GET /` responde un placeholder HTML minimo (CSP-safe, same-origin, sin
panel ni UMDs) que apunta a apps/web; feature 50 (`toolbox_serve_decommission`)
eliminara el server Node y dejara un unico proceso Next standalone via
`node dist/toolbox.js serve`.

El oraculo `tests/test_toolbox_serve.sh` baja de 48 a **27 casos** (cambio
deliberado, caso a caso y documentado): 21 casos retirados (17 que
grep-eaban `$PANEL` + 4 que assertaban HTML especifico del panel en `GET /`),
cada uno con un puntero a su equivalente migrado en `tests/test_web_*.sh`;
1 caso re-apuntado (`GET /` -> placeholder contract); 1 caso re-apuntado
(vendors -> solo vis-network); 1 caso mantenido intacto (CSP); 24 casos
intactos.

## Files changed (file-by-file)

- **`handyman/src/toolbox_serve.ts`** — se elimina la funcion `panelHtml`,
  la constante `PANEL_CSS`, la constante `PANEL_JS_PATH` y la lectura del
  asset (drops `readFileSync` del import de `node:fs`, drops `FAVICON_LINK`/
  `HTML_STYLE` del import de `./toolbox.js`; `buildState` se conserva, lo
  usa `/api/state` + el digest de summary). `GET /` sirve ahora la constante
  `PANEL_RETIRED_HTML` (placeholder CSP-safe via el helper `send()`, hereda
  `CSP_HEADER`/`Cache-Control`/`X-Content-Type-Options`). El doc-comment del
  modulo se actualiza para registrar el retiro y la decision D6. El archivo
  baja de 1033 a 768 lineas.
- **`handyman/src/toolbox_assets.ts`** — `vendorFiles` se reduce a una sola
  entrada (`vis-network.js`); el comentario explica el retiro de los seis
  UMDs del panel y por que vis-network se queda (graphify graph renderer).
- **`handyman/assets/toolbox_panel.js`** — **DELETED**.
- **`handyman/package.json`** — se remueven `dompurify`, `htm`, `marked`,
  `minisearch`, `react`, `react-dom` de `dependencies`. Quedan
  `@handyman/toolbox-core` (workspace), `ajv`, `vis-network`. `pnpm install`
  confirma "Packages: -6". (marked/dompurify/minisearch ya viven en
  `apps/web`/`packages/toolbox-core` con sus propias declaraciones; grep
  confirma cero imports de los seis en `handyman/src/**/*.ts`.)
- **`tests/test_toolbox_serve.sh`** — oraculo re-apuntado (ver seccion
  "Oracle re-pointing" abajo). Se elimina la variable `$PANEL`. Casos:
  48 -> 27.
- **`.handyman/docs/verification.md`** — nueva seccion "Panel retirado desde
  toolbox_panel_retirement (feature 49, decision D6)" con el recuento nuevo
  (27), el mapeo caso-a-caso a `tests/test_web_*.sh`, y el estado dual
  (Node 27/27, Next 25/27 con carve-out reducido de `GET /` = 2 casos).
- **`.handyman/docs/architecture.md`** — Principio 1 (Observador) y
  Principio 2 (Politica de dependencias) actualizados: ya no referencian
  `assets/toolbox_panel.js` ni los UMDs como dependencias actuales; senalan
  el retiro y que solo queda `vis-network`.

## Oracle re-pointing (caso a caso)

Casos retirados (21) con puntero al equivalente migrado en
`tests/test_web_*.sh`:

Panel-asset grep (17, todas vivian en `$PANEL`):
- `panel asset is valid JS (node --check)` -> apps/web build (next build)
- `panel asset ships the sparkline + fmt helpers` -> test_web_fleet.sh (renderFleetHtml)
- `panel asset ships the 3-state theme control` -> test_web_timeline_search.sh (theme keeps hw-theme:1)
- `panel asset queues SSE summaries + announces connection changes` -> test_web_intake_ask.sh (FleetSummaryClient) + test_web_timeline_search.sh (announce)
- `empty states are actionable hints` -> test_web_fleet.sh / test_web_harness.sh
- `shortcuts ride a single document keydown listener` -> test_web_timeline_search.sh (shortcut interpreter) + test_web_intake_ask.sh (exactly ONE document.addEventListener('keydown'))
- `panel asset renders sanitized markdown (DOMPurify + FORBID + marked)` -> test_web_intake_ask.sh (lib/md.ts FORBID consts + marked/dompurify deps)
- `panel asset ships the fleet Summarize control` -> test_web_intake_ask.sh (fleet summary files + FleetSummaryClient POSTs /api/summarize)
- `panel asset ships the #/ask view` -> test_web_intake_ask.sh (ask view files + AskClient)
- `panel asset ships the #/intake route/nav/palette` -> test_web_intake_ask.sh (intake view files)
- `panel intake posts to /api/draft + parses SSE` -> test_web_relays.sh (draft route) + test_web_intake.sh
- `panel intake fetches /api/providers + /api/state` -> test_web_intake_ask.sh (IntakeClient wires)
- `panel intake renders the draft sanitized + editable` -> test_web_intake_ask.sh (renderIntakePreviewHtml + renderSanitized)
- `panel intake copy button clipboard + fallback` -> apps/web IntakeClient (D1 cero-deps)
- `panel intake announces a provider error` -> test_web_timeline_search.sh (announce)
- `panel asset ships file-tag picker + Submit` -> test_web_intake.sh (submitIntake action) + test_web_intake_ask.sh (IntakeClient)
- `panel intake announces submit success/failure` -> test_web_timeline_search.sh (announce)

GET `/` especificos del panel (4):
- `panel <head> ships the synchronous anti-flash theme script` -> test_web_timeline_search.sh (layout injects the anti-flash snippet)
- `panel ships exactly two static live regions, empty, before #root` -> test_web_timeline_search.sh (ToolboxShell renders both static live regions)
- `served panel carries the prefers-reduced-motion guard` -> apps/web globals.css (structural)
- `served panel ships the command palette dialog` -> test_web_timeline_search.sh (palette builds view/harness/doc actions)

Casos re-apuntados (2):
- `GET / returns the React panel with root div and the six vendor scripts`
  -> `GET / serves the retirement placeholder (no panel, no UMD vendors,
  same-origin only)` (asserta 'Handyman ToolBox Observer' + 'moved to the
  unified Next.js app' + referencia a /vendor/vis-network.js + niega
  id="root" + niega los seis /vendor/*.js + niega src="http(s)://).
- `vendor libs (...) serve from node_modules`
  -> `vendor lib vis-network.js serves from node_modules; retired UMDs 404`
  (vis-network 200; los seis retirados ahora 404; unknown sigue 404).

Caso mantenido intacto (1, golpea `GET /`):
- `server responses carry Content-Security-Policy default-src 'self'` —
  sigue pasando porque el placeholder se sirve via `send()` y hereda
  `CSP_HEADER`.

Casos intactos (24): state (2), corpus, md (2), providers, graph, draft (2),
summarize (3), ask (3), files (2), intake (4), SSE, security, boot.

## Verification

- `cd handyman && npm run typecheck` -> exit 0 (sin referencias colgantes).
- `cd handyman && npm run build` -> exit 0 (`dist/` reconstruido).
- `pnpm install` -> "Packages: -6" (lockfile refrescado).
- `bash tests/test_toolbox_serve.sh` (default, server Node) -> **27 run, 27
  passed, 0 failed**.
- `bash tests/run_tests.sh` -> **ALL SUITES PASSED** (todas las suites
  test_*.sh verdes, incluidas test_web_*.sh que cubren los equivalentes
  migrados).
- `./init.sh` -> **status: ok, exit 0** (compuerta de cierre).
- Dual-run `TOOLBOX_BASE_URL` -> Next standalone (puerto 3210, upstream Node
  8765, fixture + mock LLM compartidos): **25/27**. Los 2 fallos son el
  carve-out reducido de `GET /` (placeholder + CSP): contra Next `/` es la
  landing con su propio CSP, asi que diverge a proposito durante el
  strangler. Desaparece en feature 50 (unico proceso Next). El fallo de
  `/api/state` que aparecio en el primer intento del dual-run era un bug de
  mi harness de prueba (doble registro del fixture en el HANDYMAN_ROOT
  compartido); corregido con un fixture fresco, el caso pasa.

## Notes / risks

- El placeholder de `GET /` es intencionalmente minimal y CSP-safe; NO es la
  UI final (esa es apps/web). Feature 50 eliminara el server Node por
  completo.
- El carve-out de `GET /` baja de 6 fallos (pre-49) a 2 (post-49); ambos
  casos son contratos del server Node que no aplican a la landing de Next.
- Las deps retiradas de handyman viven ahora en apps/web (ESM, sus propias
  versiones) y packages/toolbox-core (minisearch Node-side para buildCorpus).
- No se toco `proxy.ts` (el forward del strangler sigue hasta feature 50),
  `toolbox_llm.ts`/`toolbox_draft|ask|summary.ts`, ni ningun CLI.
