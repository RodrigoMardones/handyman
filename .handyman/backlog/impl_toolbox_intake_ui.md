---
type: Implementation Log
feature: toolbox_intake_ui
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_intake_ui]
---

# Implementation Report: toolbox_intake_ui

Vista de intake en el panel del observador (Plan A de
`docs/analisis-peticiones-llm-toolbox.md` §5). El observador sigue siendo
100% read-only: la vista consume el SSE de `POST /api/draft`, renderiza el
draft de forma sanitizada y editable, y ofrece un botón "copy". No toca disco.

## Files Changed

- `handyman/assets/toolbox_panel.js`
  - `IntakeView`: selectores de harness (desde `state.harnesses`) y provider
    (desde `GET /api/providers`, filtrando `available`), textarea de prompt,
    botón Draft/cancel, draft editable + preview sanitizado + botón copy.
  - `streamDraftSse(body, handlers, signal)`: lee el body del `fetch POST
    /api/draft` como stream y parsea los frames SSE (`event:`/`data:` separados
    por línea en blanco), repartiendo `delta`/`result`/`error`. Las 400 de
    validación (JSON, no SSE) se mapean a `onError`. Soporta `AbortController`.
  - `parseSseFrame(frame)`: parser de un frame SSE (CRLF/LF, JSON data).
  - `copyToClipboard(text)`: `navigator.clipboard.writeText` con fallback a
    textarea oculta + `document.execCommand("copy")`.
  - Router: añadida la rama `#/intake` -> `IntakeView`; link de nav "intake";
    `VIEW_ACTIONS` + tecla `i` (g-then-i); help shortcut actualizado.
- `handyman/src/toolbox_serve.ts`
  - `PANEL_CSS`: estilos mínimos para `.intake-form`, `.field`, `.intake-prompt`,
    `.intake-draft`, `.intake-edit`, `.muted` (reutiliza tokens existentes).
- `tests/test_toolbox_serve.sh`
  - Sección TS7c (6 casos estructurales): ruta/nav/palette, cliente
    SSE-over-POST, selectores providers/state, render sanitizado + editable,
    clipboard API + fallback, anuncio assertive en error.

## Design Notes

- **Read-only preservado.** La vista no añade rutas de escritura; sólo
  consume el único POST existente (`/api/draft`, que tampoco escribe disco) y
  `GET /api/providers` + `/api/state`. Cum Plan A: el humano copia el draft a
  `feature-request.md`.
- **SSE sobre POST sin EventSource.** `EventSource` no soporta POST, así que
  el cliente lee `res.body.getReader()` y parsea frames manualmente,
  espejando el `sse()` writer del servidor. Esto reusa el patrón SSE ya
  existente (`/events`) y el render sanitizado (`renderMd` + DOMPurify) ya
  cargado como vendor.
- **Editabilidad sin pelear con el stream.** El textarea del draft es
  `readOnly` mientras llega el stream; al recibir `result` se prefieren sus
  `draft_md` canónicos (coinciden con archetype/dedup parseados) y el campo
  queda editable para que el humano ajuste antes de copiar.
- **Errores accesibles.** `event: error` y las 400 se anuncian en la live
  region assertiva existente (`announce.assertive`), igual que la pérdida de
  conexión SSE (Plan D). El copy se anuncia en la polite.
- **Cancelación.** `AbortController` permite cancelar un draft en vuelo y se
  aborta al desmontar la vista (navegar fuera).
- **Sin dependencias nuevas.** Reusa marked + DOMPurify + React + htm ya
  cargados como vendors UMD. Cumple la política de dependencias mínimas.

## Test Output

```text
$ ./init.sh  -> INIT_EXIT=0
toolBox observer suite (test_toolbox_serve.sh)
  ...
  PASS panel asset ships the #/intake route, nav link and palette action
  PASS panel intake posts to /api/draft and parses the SSE stream
  PASS panel intake fetches /api/providers and /api/state for the selectors
  PASS panel intake renders the draft sanitized and keeps it editable
  PASS panel intake copy button uses the clipboard API with a fallback
  PASS panel intake announces a provider error in the assertive region
  ...
Summary: 32 run, 32 passed, 0 failed
-> suite OK
ALL SUITES PASSED
```

Runtime smoke (dogfood registry): `GET /api/providers` ->
`{"providers":[{"id":"zai","available":true,"model":"glm-5.2"},...]}`; el HTML
servido en `/` contiene `IntakeView`/`streamDraftSse`/`copyToClipboard`/`#/intake`.
`node --check handyman/assets/toolbox_panel.js` OK.
