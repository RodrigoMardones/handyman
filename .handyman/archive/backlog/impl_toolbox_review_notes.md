---
type: Implementation Log
feature: toolbox_review_notes
id: 34
role: implementer
date: 2026-07-19
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_review_notes (feature 34)

Item 2.5 de `docs/analisis-tareas-llm-toolbox.md`. `POST /api/review-notes`
arma un **checklist semilla** para el reviewer a partir de
`backlog/impl_<feature>.md` + el diff de trabajo. Segunda feature sobre el
patron D-B que fijo la 32.

## Piezas

- `packages/toolbox-core/src/reviewNotes.ts` (nuevo, subpath `./review-notes`):
  - `readImplReport(workspace, feature)`: el reporte del implementer, `null` si
    no existe (el prompt lo declara en vez de inventarlo).
  - `readFeatureDiff(root, maxChars)`: `git diff HEAD` (staged + unstaged) con
    `execFileSync` — **nunca shell**, cwd en el root ya validado por el
    registry, y ningun campo del request llega a argv. Fuera de un repo git, o
    si git falla, degrada a diff vacio en vez de tirar. Trunca a
    `REVIEW_DIFF_MAX_CHARS` (60k) y **lo declara** con `diff_truncated`, para
    que el reviewer sepa que quedo sin mirar.
  - `composeReviewNotesSystem()`: las barandas duras — salida marcada como
    BORRADOR, preguntas y no conclusiones, **prohibido** emitir veredicto
    (`APPROVED` / `CHANGES_REQUESTED` / equivalentes en prosa), prohibido
    proponer patch, y "no hay evidencia suficiente para X" explicito en vez de
    suponer.
  - `composeReviewNotesPrompt(...)` y `relayReviewNotes(...)`, misma forma que
    `relaySummary`/`relayTriage`.
- `apps/web/app/api/review-notes/route.ts`: POST + `force-dynamic`, reusa
  `resolveRelayTarget` (prelude D-B) y agrega su propio campo `feature`, con
  `FEATURE_NAME = /^[A-Za-z0-9_-]+$/` **antes** de cualquier join de path —
  el nombre entra en `backlog/impl_<feature>.md`, asi que no puede salirse del
  directorio. No escribe disco.
- `handyman/src/toolbox_review_notes.ts`: shim de re-export para la suite.

## Verificacion

- `tests/test_toolbox_review_notes.js` (nuevo, 10 casos, sin red ni server):
  reporte presente/ausente, un `git diff HEAD` real contra un repo temporal,
  la degradacion fuera de un repo, la truncacion con su flag, las barandas del
  system prompt, el prompt declarando lo que falta, y el relay en camino feliz
  y con `LlmError`.
- `tests/test_web_review_notes.sh` (nuevo, 7 casos, estructural): route handler
  nativo, prelude D-B + guard de `feature`, el regex antes del path join,
  `execFile` sin shell, la regla no-veredicto/no-patch, read-only y el framing
  SSE.
- `tests/test_toolbox_serve.sh` (oraculo, +3 casos): SSE `delta`+`result` con
  el checklist, ausencia de token de veredicto, `diff_truncated`, y 400 en
  feature ausente, **feature con traversal (`../../etc/passwd`)** y root no
  registrado.
- Ambas suites cableadas en `tests/run_tests.sh`.

## Notas para el reviewer

- El harness de fixtures del oraculo **no es un repo git** a proposito: asi el
  caso end-to-end ejercita la degradacion documentada (diff vacio, sin throw) y
  igual devuelve checklist desde el reporte del implementer solo.
- El assert de "no contiene veredicto" corre sobre la respuesta del mock, que
  esta escrita sin esos tokens. Es por definicion debil como prueba de que **un
  modelo real** no los emitira: lo que de verdad se puede fijar es que el
  system prompt lo prohibe (cubierto en la suite unitaria T5 y en TWR5). No hay
  guard server-side que censure el output, y no se agrego uno: censurar texto
  del modelo daria falsa confianza y el contrato real es que el reviewer firma
  sobre el verifier y el diff, no sobre esto.
