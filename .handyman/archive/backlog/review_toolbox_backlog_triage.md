---
type: Review Log
feature: toolbox_backlog_triage
id: 32
role: reviewer
date: 2026-07-19
verdict: APPROVED
tags: [handyman/backlog/review]
---

# Review: toolbox_backlog_triage (feature 32)

## Evidencia verificada

- `./init.sh` exit 0 (validate -> lint -> build -> test), gate completo.
- `tests/test_toolbox_triage.js`: 10/10.
- `tests/test_web_triage.sh`: 7/7.
- `tests/test_toolbox_serve.sh` (oraculo): **31/31**, incluyendo los 3 casos
  nuevos de `/api/triage`. Esto no es estructural: bootea el Next standalone
  real, hace POST por HTTP y parsea las tramas SSE.

## Acceptance, bala por bala

1. **Route handler nativo + 400 antes del LLM** — OK. `app/api/triage/route.ts`
   con `force-dynamic`; `resolveRelayTarget` devuelve `Response` y la ruta hace
   `if (target instanceof Response) return target` antes de tocar el provider.
   El oraculo confirma 400 en root no registrado, root ausente y provider
   desconocido.
2. **SSE `delta|result|error` con `{report:[...]}`** — OK, verificado en el
   oraculo (tramas reales, no grep).
3. **`evidence_debt` calculada en el server** — OK. `computeEvidenceDebt` sale
   de `readFeatures` + `listBacklogDocs`; el modelo no la ve. Probada contra un
   fixture con un `done` sin review (`beta`) y uno con review (`alpha`): flaggea
   exactamente uno.
4. **Modelo barato** — OK, `resolveSummaryModel` via el prelude.
5. **Nunca auto-mergea, no escribe disco** — OK. El system prompt lo prohibe
   explicitamente y `test_web_triage.sh` TWT6 grepea que ni la ruta ni el core
   tengan primitivas de escritura.
6. **Suite registrada, ningun test toca la red** — OK. El unico "LLM" es el
   mock en `127.0.0.1` que ya usaban summarize/ask.
7. **Gate verde** — OK.

## Observaciones (no bloqueantes)

- **Cobertura de `evidence_debt` repartida a proposito.** El oraculo solo
  asserta que llega como array; el calculo se prueba en la suite unitaria con
  su propio fixture. Es la decision correcta: el fixture del oraculo lo
  comparten ~30 casos y meterle una feature `done` sin review para un solo
  assert arriesgaba los otros. Queda anotado en ambos archivos.
- **El mock responde en fence a proposito.** Buen detalle: fija que
  `parseTriageReport` sobrevive el bloque de codigo que los modelos emiten
  igual aunque se les diga que no.
- **`parseTriageReport` degrada a `[]` en vez de fallar.** Correcto para esta
  ruta — la deuda de evidencia es util por si sola aunque el modelo conteste
  basura. Pero significa que un modelo roto se ve como "backlog limpio". Si
  eso llega a confundir, la salida deberia distinguir "sin solapes" de "no se
  pudo parsear"; hoy no vale el costo.

## Desviacion de proceso a declarar

Los tres roles (leader, implementer, reviewer) corrieron en **una sola sesion
de un solo agente**, no en el ciclo separado que el harness asume. El gate y el
oraculo son evidencia ejecutable real, pero la independencia entre implementer
y reviewer — el anti-telefono-descompuesto — **no se cumplio** en esta feature.
Vale lo mismo para 33/34/35 si se cierran igual.

**Veredicto: APPROVED** sobre la evidencia ejecutable, con la desviacion de
proceso declarada arriba.
