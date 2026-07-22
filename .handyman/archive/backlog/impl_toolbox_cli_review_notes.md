---
type: Implementation Log
feature: toolbox_cli_review_notes
id: 53
role: implementer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_cli_review_notes (feature 53)

`buildProviders` tenía un solo consumidor (`apps/web/lib/runtime.ts:62`) y
ningún subcomando de `toolbox.js` tocaba un modelo: la capa LLM era
inalcanzable sin arrancar un server web. Ahora es un comando.

## Piezas

- `packages/toolbox-core/src/reviewNotes.ts`:
  `composeReviewNotesRequest(root, feature) -> {system, prompt, diffTruncated}`.
  Es la respuesta a §4 del plan (ver abajo).
- `handyman/src/toolbox_review_notes_cli.ts` (nuevo): `reviewNotesMain(argv)`,
  async. Parser de flags, orden de validación, y las dos salidas (streaming a
  stdout / un objeto `--json`).
- `handyman/src/toolbox.ts`: `review-notes` en el USAGE, en el guard de
  ejecución directa (ruteado **antes** del `main()` síncrono, igual que
  `serve`), y un `case` en el dispatch que le dice a un llamador programático
  que use `reviewNotesMain` directamente.
- `apps/web/app/api/review-notes/route.ts`: pasa a consumir la composición
  compartida. Su comportamiento observable no cambia — lo confirma
  `test_web_review_notes.sh` (7/7) sin editar una aserción.
- `tests/lib/mock_openai.js` + `tests/test_toolbox_cli_llm.sh` (9 casos),
  registrada en `run_tests.sh` (30 suites).
- `.handyman/docs/verification.md`: párrafo de la feature.

## La trampa de diseño de §4: qué se extrajo y qué no

El plan advertía que un segundo consumidor haría D-B otra vez: dos sitios
haciendo «resolver root -> leer workspace -> componer -> relay». Se miró antes
de escribir el segundo consumidor, no en el séptimo.

**Se extrajo** la composición del contexto: resolver workspace, leer
`impl_<feature>.md`, leer el diff, componer system+prompt. Es exactamente la
parte donde una divergencia sería un bug silencioso — la ruta y el CLI
preguntándole al modelo cosas distintas sobre la misma feature.

**No se extrajo** el `runReviewNotes(root, feature, provider, model)` que el
plan proponía como forma natural. Al intentarlo se ve que no calza: la
selección de proveedor no es el mismo problema en los dos lados. La ruta la
resuelve desde un body HTTP contra el singleton `runtime.providers` y
devuelve `Response` 400 en cada rechazo; el CLI la resuelve desde argv contra
`buildProviders(process.env)` y devuelve exit codes. Meter ambas en el core
obligaría a inventar un tipo de error neutral que los dos tendrían que
volver a traducir — más acoplamiento, no menos. Lo que queda afuera de la
composición compartida es sólo el framing que cada uno legítimamente posee:
eventos SSE para la ruta, stdout para el CLI.

Esto satisface la bala 5 por la primera vía (comparten la composición), no
por la segunda (anotar por qué no se pudo).

## Contrato del subcomando

```
toolbox.js review-notes --root PATH --feature NAME [--provider ID] [--model M] [--json]
```

Orden de validación, **todo antes de llamar al modelo**: `--root` presente ->
root registrado (`isRegisteredRoot`) -> `--feature` presente -> nombre de
feature bien formado (`/^[A-Za-z0-9_-]+$/`, misma forma que acepta
`feature.js`) -> proveedor conocido. C7 de la suite lo prueba contando las
completions servidas por el mock: un rechazo no mueve el contador.

Sin `--json`, el checklist sale en streaming a stdout y un diff truncado
avisa por stderr. Con `--json`, stdout es exactamente un objeto con
`checklist_md`, `model` y `diff_truncated`, y los deltas se descartan para
que la salida sea parseable de una.

## Verificación

- `bash tests/test_toolbox_cli_llm.sh` -> 9/9, sin servidor y sin red.
- `bash tests/test_web_review_notes.sh` -> 7/7 sin tocar aserciones (el
  refactor de la ruta es transparente).
- `bash tests/run_tests.sh` -> ALL SUITES PASSED (30 suites).
- `./init.sh` -> exit 0.

## Notas

- **Colisión de roles**: mismo agente en los tres roles; ver
  [[review_harness_unblock_verbs]].
- `handyman/src/toolbox_review_notes.ts` **no** se tocó: es el shim de
  re-export que consume `tests/test_toolbox_review_notes.js`. El módulo nuevo
  usa el sufijo `_cli` justamente para no pisarlo.
- Con este verde queda contestada la pregunta que el plan dejó abierta: los
  otros cuatro relays (`triage`, `acceptance`, `retro`, `ask`) pueden seguir
  el mismo molde, y ahora hay un molde. No se hicieron: la feature pedía uno.
