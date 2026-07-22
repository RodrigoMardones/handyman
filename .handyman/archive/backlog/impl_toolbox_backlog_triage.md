---
type: Implementation Log
feature: toolbox_backlog_triage
id: 32
role: implementer
date: 2026-07-19
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_backlog_triage (feature 32)

Primera feature de la capa LLM (item 2.3 de
`docs/analisis-tareas-llm-toolbox.md`). `POST /api/triage` clasifica los
`backlog/*.md` de un harness registrado y devuelve, junto al reporte del
modelo, la **deuda de evidencia** calculada en el server.

La feature carga ademas la decision **D-B** (ver `docs/architecture.md`): es
la que fija el patron para 33/34/35.

## Piezas

- `packages/toolbox-core/src/triage.ts` (nuevo, exportado por `index.ts` y por
  el subpath `./triage`):
  - `listBacklogDocs(workspace)`: `backlog/*.md` clasificados por prefijo
    (`impl_`/`review_`/`explore_`/`other`), con el nombre de feature
    recuperado del filename y el excerpt acotado a `TRIAGE_EXCERPT_CHARS`
    (800). Sin `backlog/` devuelve `[]`, no tira.
  - `computeEvidenceDebt(workspace)`: features en `done` sin
    `review_<name>.md`. **Se calcula de disco + `feature_list.json`, el
    modelo nunca la ve ni la infiere** (§6: el LLM no decide estado). Es el
    hueco que `validate_harness` no cubre.
  - `composeTriageSystem` / `composeTriagePrompt`: el system exige JSON puro,
    un entry por documento, `duplicado_de` solo ante solape real, y prohibe
    explicitamente proponer fusiones ("un humano decide con mv/git").
  - `parseTriageReport(raw)`: extraccion tolerante — JSON pelado, en fence
    ```` ```json ````, o envuelto en prosa. Entradas sin `id` usable se
    descartan; basura devuelve `[]` en vez de tirar (la deuda de evidencia
    sigue valiendo aunque el modelo conteste mal).
  - `relayTriage(...)`: misma forma que `relaySummary` (HTTP-agnostica,
    inyecta `draft()`, nunca tira: `LlmError` -> `onError`).
- `apps/web/lib/relayTarget.ts` (nuevo, **decision D-B**): el prelude que
  comparten los cuatro relays nuevos — body con `readJsonObject` (cap 256 KB),
  root registrado (`isRegisteredRoot`: el registry sigue siendo la allowlist),
  provider, y modelo barato (`resolveSummaryModel`). Devuelve `Response` en el
  rechazo, asi que **toda 400 ocurre antes de cualquier llamada al LLM**.
  Los tres relays viejos NO lo usan a proposito: divergen en cada eje y sus
  cuerpos de 400 son contrato fijado byte a byte por `test_web_relays.sh`
  (TWL2) y el oraculo.
- `apps/web/app/api/triage/route.ts`: POST + `force-dynamic`, arma el contexto
  y retransmite por el framing SSE compartido. No escribe disco.
- `handyman/src/toolbox_triage.ts`: shim de re-export para que la suite unitaria
  importe desde `handyman/dist` como las demas.

## Verificacion

- `tests/test_toolbox_triage.js` (nuevo, 10 casos, sin red ni server): la
  clasificacion, el bound del excerpt, el workspace sin `backlog/`, la deuda de
  evidencia contra un fixture con un `done` deliberadamente sin review, las
  tres formas de JSON que un modelo emite, la basura, y el relay en camino
  feliz y con `LlmError`.
- `tests/test_web_triage.sh` (nuevo, 7 casos, estructural): route handler
  nativo, uso del prelude D-B, deuda calculada en server, la regla
  anti-auto-merge en el prompt, read-only, y el framing SSE compartido.
- `tests/test_toolbox_serve.sh` (oraculo, +3 casos): la ruta **si** entra al
  contrato negro-caja del observador, asi que se prueba de punta a punta contra
  el mock LLM local — SSE `delta`+`result`, `report` parseado (el mock responde
  **en fence** a proposito, para fijar que `parseTriageReport` lo sobrevive),
  `evidence_debt` como array, y las 400 de root/provider.
- Ambas suites nuevas cableadas en `tests/run_tests.sh`.

## Notas para el reviewer

- El fixture del oraculo no tiene ninguna feature `done` sin review (su unica
  `done` es `alpha`, que si tiene `review_alpha.md`), asi que ahi solo se
  asserta la **forma** de `evidence_debt`. El calculo real se prueba en la
  suite unitaria con su propio fixture. Se evito tocar el fixture del oraculo a
  proposito: lo comparten ~30 casos.
- `evidence_debt` no se cachea: es lectura barata de disco y cambia con cada
  cierre de feature.
