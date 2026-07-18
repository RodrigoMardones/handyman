---
feature: toolbox_draft_relay
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_draft_relay]
---

# Implementation Plan + Report: toolbox_draft_relay

## Contexto

Feature #25. Depende de #24 (`toolbox_llm_providers`, done). Diseño:
`docs/analisis-peticiones-llm-toolbox.md` §4. El observador es GET-only por
contrato (405 a todo lo demas); este endpoint es el UNICO cambio deliberado de
ese contrato y NO escribe disco: el draft siempre pasa por el humano.

## Plan

### 1. `src/toolbox_draft.ts` (nuevo) — pure + unit-testable

Funciones que viven fuera del servidor HTTP para poder testearlas con un
provider fake sin levantar el server:

- `buildDraftSystem(assetsDir)` — lee `feature-request.template.md` (estable:
  CORE/Opcional + 2 ejemplos por arquetipo + regla gate-verde-ultima-bala +
  contrato: solo name/title/description/acceptance van a feature_list.json via
  `node dist/feature.js add`). Memoizado por assetsDir.
- `harnessDraftContext(hroot, root, prompt, k=5)` — contexto volatil:
  - cola de features (id/name/status/depends_on) via `readFeatures(workspace)`.
  - top-k BM25 de candidatos a duplicado: MiniSearch (Node) sobre los docs del
    harness destino (features + backlog + progress + docs), query = prompt.
    Devuelve `[{name, kind, score}]`.
  - skills/agents discovery: `harness.config.json` config.discovery.
- `composeUserPrompt(ctx, userPrompt)` — arma el mensaje de usuario volatil.
- `relayDraft({system, userPrompt, draft, onDelta, onResult, onError})` —
  ejecuta el `draft()` (metodo del provider, inyectable para tests), parsea el
  resultado en `{archetype, draft_md, possible_duplicates}` y emite callbacks.
  NO conoce HTTP: el handler traduce los callbacks a eventos SSE.

Arquetipo: el modelo debe declarar `[Research]` o `[Implementation]`; el relay
extrae esa marca del draft para el evento final.

### 2. `src/toolbox_serve.ts` (edit) — handler POST /api/draft

- Reestructurar el router: `POST /api/draft` se atiende ANTES del guard
  `req.method !== "GET"` (todo lo demas sigue 405).
- Validaciones (400 JSON):
  - `root` registrado en el registry.
  - `provider` presente y disponible (`providers` ya construidos al arrancar).
- Flujo SSE: `Content-Type: text/event-stream`; `event: delta` por cada chunk;
  al final `event: result` con `{archetype, draft_md, possible_duplicates}`;
  `event: error {code,message}` si el provider lanza `LlmError`.
- Sin writes de disco; ningun otro metodo/ruta nueva.

### 3. `tests/test_toolbox_draft.js` (nuevo) — provider fake

Sin red. Cubre:
- `buildDraftSystem` incluye CORE/Opcional, ambos ejemplos y la bala del gate.
- `detectDuplicates` (BM25) rankea el candidato obvio sobre el irrelevante.
- `composeUserPrompt` incluye features + skills del harness.
- `relayDraft` con `draft()` fake: emite deltas, evento final con archetype +
  draft_md + possible_duplicates, y `event: error` si `draft()` lanza LlmError.

### 4. `tests/test_toolbox_serve.sh` (edit) — black-box

- `POST /api/draft` con root NO registrado -> 400.
- (El flujo happy-path con provider fake queda cubierto en la suite .js.)

### 5. `references/toolbox.md` + `tests/run_tests.sh`

Documentar `/api/draft` (read-only salvo relay de texto) y cablear la suite.

## Design Notes

- MiniSearch se importa ESM (`import("minisearch")` -> `.default`); ya es dep.
- El system estable es cacheable (prompt caching del vendor); el contexto
  volatil va al final (regla prompt-caching del analisis).
- Error mapping ya existe en `toolbox_llm.ts` (LlmError.code); el relay solo lo
  traduce a `event: error`.
- Seam de testeo: `relayDraft` acepta `draft` como argumento, no lee providers
  globales -> la suite .js pasa un `draft` fake determinista.

## Test Output

```text
toolBox draft suite (test_toolbox_draft.js): Summary: 23 run, 23 passed, 0 failed
toolBox observer suite (test_toolbox_serve.sh): Summary: 26 run, 26 passed, 0 failed
  (nuevos) PASS POST /api/draft rejects an unregistered root with 400
           PASS POST /api/draft rejects a malformed body with 400
./init.sh: INIT_EXIT 0 — VERIFIER: all gates passed
bash tests/run_tests.sh: RUN_EXIT 0 — ALL SUITES PASSED
```

## Acceptance mapping

- `POST /api/draft` valida root contra el registry y provider contra los
  disponibles; responde SSE con deltas (`event: delta`) y un evento final
  `event: result {archetype, draft_md, possible_duplicates}` —
  `handleDraftRequest` en `toolbox_serve.ts`, probado por el happy-path del
  relay (T5) y el 400 de root no registrado.
- El prompt incluye plantilla Nucleo/Opcional, 2 ejemplos por arquetipo, gate
  verde como ultima bala, y contexto del harness (features, top-k BM25,
  skills discovery) — `composeSystem` + `buildDraftContext` +
  `composeUserPrompt`; cubierto por T1-T3.
- Fallo del proveedor -> `event: error` SSE con codigo mapeado
  (`insufficient_balance` etc.); ningun otro metodo/ruta de escritura se
  agrega (todo lo demas sigue 405) — `relayDraft` onError (T6) + guard GET.
- Tests con provider fake: prompt construido, SSE bien formado, root no
  registrado -> 400; cableados en `run_tests.sh` — `test_toolbox_draft.js`
  (23) + `test_toolbox_serve.sh` (2 casos nuevos).

