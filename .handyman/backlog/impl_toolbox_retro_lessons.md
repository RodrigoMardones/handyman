---
type: Implementation Log
feature: toolbox_retro_lessons
id: 35
role: implementer
date: 2026-07-19
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_retro_lessons (feature 35)

Item 2.6 de `docs/analisis-tareas-llm-toolbox.md` y cierre de la tanda.
`POST /api/retro` mina `progress/history.md` + el backlog de las features ya
cerradas y propone patrones / anti-patrones como **sugerencias** para
`docs/conventions.md`. Nunca escribe ese archivo.

## Piezas

- `packages/toolbox-core/src/retro.ts` (nuevo, subpath `./retro`):
  - `readRetroCorpus(workspace)`: historia + los `backlog/*.md` **solo de
    features en `done`**. El trabajo abierto no es una leccion todavia, asi que
    se filtra contra `readFeatures`; sin `backlog/` devuelve la historia igual.
  - `composeRetroSystem()`: 3-5 patrones, cada uno con >= `RETRO_MIN_EVIDENCE`
    (2) features distintas citadas por nombre, "un patron con una sola feature
    es una anecdota: DESCARTALO", y prohibicion explicita de proponer editar
    `docs/conventions.md`.
  - `parseRetroPatterns(raw)`: extraccion tolerante (JSON pelado / en fence /
    envuelto en prosa) **y la barra de evidencia aplicada de verdad**: dedupea
    `features`, descarta lo que no llegue a 2 o venga sin titulo, normaliza
    `tipo`, corta en `RETRO_MAX_PATTERNS` (5) y **cuenta** todo lo descartado.
  - `relayRetro(...)`: misma forma que los demas; el `result` lleva
    `patterns`, `discarded` y `model`.
- `apps/web/app/api/retro/route.ts`: POST + `force-dynamic`, prelude D-B, sin
  escritura de disco.
- `handyman/src/toolbox_retro.ts`: shim de re-export.

## La decision que importa

**La regla anti-generalizacion se aplica en el server, no se pide y ya.** El
acceptance solo exigia que el system prompt la pidiera; pedirsela a un modelo y
confiar no es una garantia. `parseRetroPatterns` descarta los patrones sin
soporte pase lo que pase. Y como una respuesta flaca no debe parecer una
historia limpia, `discarded` viaja en el resultado: nada se cae en silencio.

## Verificacion

- `tests/test_toolbox_retro.js` (nuevo, 12 casos, sin red ni server): el corpus
  restringido a cerradas (la feature `gamma` pendiente NO entra), workspace sin
  backlog, las reglas del system prompt, el prompt llevando el material, las
  tres formas de JSON, **el descarte del patron de una sola feature contado en
  `discarded`**, el dedupe, el default de `tipo`, el cap en 5 con su overflow
  contado, la basura, y el relay en camino feliz y con `LlmError`.
- `tests/test_web_retro.sh` (nuevo, 6 casos, estructural): route handler,
  prelude D-B, corpus restringido a cerradas, la barra aplicada al parsear,
  read-only y el framing SSE.
- `tests/test_toolbox_serve.sh` (oraculo, +3 casos): el mock devuelve **dos**
  patrones, uno respaldado por 2 features y una anecdota respaldada por 1; se
  asserta de punta a punta que vuelve 1 patron con `features.length >= 2` y
  `discarded === 1`. Mas las 400 de root/provider, y un caso final que verifica
  que **ningun** relay de la tanda creo `docs/conventions.md` en el fixture.
- Ambas suites cableadas en `tests/run_tests.sh`.
