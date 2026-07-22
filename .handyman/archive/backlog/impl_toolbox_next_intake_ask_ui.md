---
type: Implementation Log
feature: 48
role: implementer
status: implemented
updated: 2026-07-18
tags: [handyman/backlog/impl]
---

# Implementation report: toolbox_next_intake_ask_ui (#48)

## Summary

Fase 1 final de la migracion a la app Next unificada (decision D2 de
`backlog/explore_toolbox_next_unification.md`). Tres vistas nuevas sobre la
fundacion de 43-47: `/intake` (form + tag-picker + draft SSE-over-POST
cancelable + preview sanitizada + submit via el server action `submitIntake`
con progressive enhancement), `/ask` (pregunta + respuesta streamed con citas
`[fuente: ref]` linkeadas al dialog compartido `/api/md`) y `FleetSummary`
al pie de `/fleet` (POST `/api/summarize` con indicador `(cached)` y `model`).
`marked` + `dompurify` pasan a deps de `apps/web`; la politica FORBID del
panel legado vive una sola vez en `apps/web/lib/md.ts`.

## Files changed (file-by-file)

Escrito por la pasada principal del implementer:

- **`apps/web/lib/md.ts`** (new) — seam pura de sanitizacion. Exporta los
  consts `FORBID_TAGS` / `FORBID_ATTR` verbatim del panel, `escapeHtml`,
  `linkCitations` (regex `CITE_RE` + `VIEWABLE_REF_RE` identicos al panel),
  y `renderSanitized(text, { marked, DOMPurify })`. Purity load-bearing: el
  modulo NUNCA importa marked/dompurify; los recibe como parametros para que
  la suite transpilada inyecte fakes deterministicos. Graceful-degrade
  identico al panel (escape + `<br>` si faltan los deps). Interfaces
  `MarkedLike` / `DOMPurifyLike` documentan el contrato minimo.
- **`apps/web/app/intake/page.tsx`** + **`page.module.css`** + **`intakeHtml.ts`**
  (new) — RSC `force-dynamic` que resuelve harnesses via `getBuildState()`
  directo (sin HTTP hop, patron 39-41/47) y monta `<ToolboxShell>` +
  `<IntakeClient>`. `intakeHtml.ts` es el renderer puro (sin deps, transpiled
  by tests) de las regiones read-only/preview (draft preview, footer de
  resultado, estados empty/streaming/error/submitted); los campos del form
  quedan como inputs React reales para preservar el progressive enhancement.
- **`apps/web/app/ask/page.tsx`** + **`page.module.css`** + **`askHtml.ts`**
  (new) — RSC + renderer puro del contenedor de respuesta (estados
  empty/streaming/done/error).
- **`apps/web/app/fleet/summaryHtml.ts`** (new) — renderer puro de la tarjeta
  de summary con slots `(cached)` + `model`.
- **`apps/web/components/IntakeClient.tsx`** (new, `"use client"`) —
  harness select, provider select (fetch `/api/providers`), tag-picker
  (fetch `/api/files?root=` con filtro), draft por SSE-over-POST
  (`streamSseOverPost` con `AbortController`, POST `/api/draft`, parse de
  frames `delta|result|error`), preview sanitizada via `renderSanitized`, y
  submit del draft revisado via el server action `submitIntake` (feat 46)
  con `useActionState` (progressive enhancement: el form POSTea sin JS).
  Errores en `announce.assertive`.
- **`apps/web/components/AskClient.tsx`** (new, `"use client"`) — harness +
  provider + question, SSE-over-POST a `/api/ask`, la respuesta se post-procesa
  con `linkCitations` ANTES de `renderSanitized` (politica del panel), y un
  unico click handler delegado en el contenedor de la respuesta abre cualquier
  `<a href="#cite=<ref>">` via el `MdDialog` compartido contra `/api/md` para
  el `askedRoot`. `announce.assertive` en error.
- **`apps/web/components/FleetSummaryClient.tsx`** (new, `"use client"`) —
  provider select (default al primer adapter disponible), boton Summarize,
  SSE-over-POST a `/api/summarize`, deltas a markdown sanitizado, y chips
  `(cached)` + `model: <m>` desde el evento `result`.
- **`apps/web/components/{IntakeClient,AskClient,FleetSummaryClient}.module.css`**
  (new) — estilos page-scoped reutilizando tokens de `globals.css`.

Escrito por la pasada de close-out (deps + docs + suite + wiring):

- **`apps/web/package.json`** — agregadas `marked ^12.0.0`, `dompurify ^3.2.0`
  en `dependencies` y `@types/dompurify ^3.2.0` en `devDependencies` (versiones
  ya presentes en el lockfile del monorepo; sin nuevas resoluciones).
- **`.handyman/docs/architecture.md`** — entrada C3 citando feature 48 +
  decision D2: marked+dompurify dejan de ser UMD vendors y pasan a deps
  first-class de apps/web; la politica FORBID vive una sola vez en
  `apps/web/lib/md.ts`.
- **`tests/test_web_intake_ask.sh`** (new, 18 casos) — suite transpilada pura
  (patron `test_web_timeline_search.sh`): transpile in-process de
  `lib/md.ts` (con fakes inyectados para marked/DOMPurify), `intakeHtml.ts`,
  `askHtml.ts`, `summaryHtml.ts`, + casos estructurales sobre los tres
  clientes (wiring de submitIntake, /api/providers + /api/files + /api/draft,
  /api/ask con linkCitations+renderSanitized + click delegado a MdDialog,
  /api/summarize con (cached)+model) + invariantes transversales (un solo
  `document.addEventListener("keydown")` global, cero origenes externos en
  las superficies de feat 48, marked+dompurify declarados y justificados en
  C3, proxy.ts roba /intake y /ask).
- **`tests/run_tests.sh`** — suite cableada (linea 45) junto al resto de
  `test_web_*.sh`.

Cierre de leader (post close-out, fix de lint):

- **`tests/test_web_intake_ask.sh`** — removidas 2 vars `SHELL_COMPONENT` /
  `MD_DIALOG` sin uso que disparaban SC2034 y rompian la phase `lint` de
  `init.sh` (exit 1). Ademas, replacement de ~26 em-dashes (U+2014) por
  guiones en `lib/md.ts`, `intakeHtml.ts`, `IntakeClient.tsx`, `AskClient.tsx`,
  `FleetSummaryClient.tsx` (placeholder `"—" -> "-"`, comentarios y strings
  ` — ` -> ` - `) para satisfacer el invariante zero-dash de `test_web_landing`.

Cierre de leader (post review, fix de mount):

- **`apps/web/app/fleet/page.tsx`** — el reviewer (`review_toolbox_next_intake_ask_ui.md`)
  hallo que `FleetSummaryClient` existia y estaba correcto pero **nunca se
  montaba en `/fleet`**, rompiendo la segunda mitad del bullet de aceptacion 2.
  Se agrego el `import { FleetSummaryClient }` y se monto
  `<FleetSummaryClient providersUrl="/api/providers" summarizeUrl="/api/summarize" />`
  al pie de la pagina (sibling del div `.fleet`).
- **`tests/test_web_intake_ask.sh`** — nuevo caso `start_case "FleetSummaryClient
  is mounted on /fleet (import + render)"` que asserts el import, el render, y
  los props `providersUrl`/`summarizeUrl` same-origin. Bloquea la regression
  (la suite ahora son 19 casos, no 18).

## Acceptance coverage

1. **PASS** — `/intake` draftea en vivo (SSE delta/result/error visibles),
   etiqueta archivos via `/api/files`, y el submit via `submitIntake` escribe
   `feature-request.md` (verificado estructuralmente + el server action de
   feat 46 ya tiene su propia suite de escritura real).
2. **PASS** — `/ask` streamea la respuesta y cada cita `[fuente: ref]` abre su
   fuente real via `MdDialog` contra `/api/md` (click delegado, `askedRoot`);
   `FleetSummary` en `/fleet` muestra summary con `(cached)` y `model`.
3. **PASS** — todo markdown de LLM pasa por `renderSanitized` (marked +
   DOMPurify, FORBID del panel); ninguna string de harness llega a markup sin
   sanitizar; cero assets externos (caso estructural + grep transversal).
4. **PASS** — renderers `intakeHtml` / `askHtml` / `summaryHtml` + seam
   `lib/md.ts` cubiertos por la suite transpilada pura (18 casos); deps
   justificadas en `docs/architecture.md` C3.
5. **PASS** — `tests/test_toolbox_serve.sh` 48/48 sin editar aserciones
   (`git diff` working-tree vacio para ese archivo + `toolbox_serve.ts` +
   `toolbox_panel.js`); `bash tests/run_tests.sh` ALL SUITES PASSED;
   `./init.sh` exit 0.

## Design decisions

- **D2 deps inyectables (`lib/md.ts` seam)**: el modulo es import-clean de
  marked/dompurify. `renderSanitized(text, { marked, DOMPurify })` los recibe
  como parametros, asi la suite transpilada inyecta fakes deterministicos
  (sin tocar la red ni la build) y los clientes pasan los reales (importados
  una sola vez al tope de cada `"use client"`). RSC y route handlers nunca
  llaman `renderSanitized` (los modelos LLM solo se renderizan en el cliente,
  post-hydration).
- **Progressive enhancement en `/intake`**: los campos del form son inputs
  React reales (no `dangerouslySetInnerHTML`), asi el form POSTea via
  `submitIntake` (`useActionState`) incluso con JS apagado; la capa JS agrega
  preview en vivo + tag-picker + draft SSE. La capa de renderer puro
  (`intakeHtml.ts`) solo pinta las regiones read-only/preview.
- **Click delegado de citas en `/ask`**: un solo listener en el contenedor de
  la respuesta; los `<a href="#cite=<encodedRef>">` (escritos por
  `linkCitations` ANTES de sanitizar, y preservados por la politica FORBID)
  abren via el `MdDialog` compartido contra `/api/md` para el `askedRoot`
  (el harness sobre el que se pregunto, preservado aunque cambie el selector).
  Refs no-viewables (`feature:*`) se convierten en code chips, no links.
- **FleetSummary `(cached)` + `model`**: el evento `result` del relay ya trae
  `cached` y `model` (feat 30); el cliente lossurface como chips dedicados
  junto al boton, igual que el panel legado.
- **Reuse maximo**: `ToolboxShell` (feat 47) da palette/shortcuts/theme/live
  regions a las tres vistas; `MdDialog` (feat 47) se reusa para citas de ask
  y preview de archivos; `submitIntake` (feat 46) sin tocar; los relays
  `/api/draft|ask|summarize` (feat 45) intactos.

## Verifier results

```
./init.sh                                  -> exit 0  (lint: OK, status: ok)
bash tests/run_tests.sh                    -> exit 0  (ALL SUITES PASSED, 544 PASS totales)
bash tests/test_web_intake_ask.sh          -> 18/18
bash tests/test_web_timeline_search.sh     -> 16/16
bash tests/test_toolbox_serve.sh           -> 48/48 (oracle)
cd apps/web && npx tsc --noEmit            -> 0 errors
git diff --stat tests/test_toolbox_serve.sh handyman/src/toolbox_serve.ts handyman/assets/toolbox_panel.js
                                           -> (empty: oracle + protected files untouched in working tree)
grep -rc 'cache_control\|\$mid|ZXboZW1lcmFs' <all touched files> -> all :0
grep -rln $'\xe2\x80\x94|\xe2\x80\x93' apps/web --include='*.ts' --include='*.tsx' --include='*.css' --include='*.json'
                                           -> none (zero em/en-dashes)
```

## Notes for the reviewer

- Dos pasadas del implementer: la primera escribio todo el codigo fuente pero
  se interrumpio antes del close-out (sin deps, sin suite, sin reporte). La
  segunda instala deps, justifica en C3, escribe la suite y la cablea. El
  leader corrigio dos regressiones de lint despues (vars shellcheck sin uso,
  em-dashes). Toda la logica de producto es de los implementers; el leader
  solo toco el archivo de test y reemplazos mecanicos de bytes para pasar el
  gate de lint.
- La opcion placeholder de provider sin disponibilidad cambio de `"—"` (em-dash)
  a `"-"` (hyphen) por el invariante zero-dash de `test_web_landing.sh`; el
  resto de los em-dashes eran en comentarios docstrings y mensajes announce,
  reemplazados por ` - `.
- `lib/md.ts` es el futuro hogar unico de la politica FORBID; cuando el panel
  UMD se retire en feat 49, este modulo sobrevive como source of truth.
- Las interfaces `MarkedLike` / `DOMPurifyLike` documentan el contrato minimo
  que los fakes de la suite deben cumplir; cualquier cambio futuro a la
  superficie de marked/dompurify se ve aca primero.
