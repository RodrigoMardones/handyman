---
type: Implementation Log
feature: toolbox_acceptance_from_diff
id: 33
role: implementer
date: 2026-07-19
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_acceptance_from_diff (feature 33)

Item 2.4 de `docs/analisis-tareas-llm-toolbox.md`. `POST /api/acceptance`
redacta criterios de aceptacion observables desde el diff de trabajo
(`source='diff'`) o desde una spec/issue cruda (`source='spec'`). Tercera
feature sobre el patron D-B; la unica de la tanda que ademas toca UI.

## Piezas

- `packages/toolbox-core/src/acceptance.ts` (nuevo, subpath `./acceptance`):
  - `composeAcceptanceSystem()`: exige verbos observables (corre, exit 0,
    grepea, devuelve, responde 400), **prohibe por nombre** las frases vagas
    ("deberia funcionar", "es robusto", "mejora la experiencia"), obliga a
    nombrar el artefacto concreto, y fija el gate verde como ULTIMA bala.
  - `composeAcceptancePrompt(source, content, truncated)`: encuadre distinto
    por fuente, y declara explicitamente material vacio o truncado.
  - `lastBulletIsGreenGate(md)`: **verificacion determinista** de que la ultima
    bala nombra el gate. Tolerante con el estilo de bala (`-`/`*`/`+`/numerada)
    y con la puntuacion, estricta con que el comando sea real.
  - `relayAcceptance(...)`: misma forma que los otros relays; el `result` lleva
    `acceptance_md`, `source`, `gate_last` y `diff_truncated`.
- `apps/web/app/api/acceptance/route.ts`: POST + `force-dynamic`, prelude D-B +
  guard propio de `source` y de `spec` vacia. Para `source='diff'` **reusa
  `readFeatureDiff` de la feature 34** (execFile, sin shell, cwd = root ya
  validado) — cero duplicacion.
- UI (`components/IntakeClient.tsx` + `app/intake/page.tsx`): un selector
  **plano de 3 estados** — `intake` / `aceptacion (desde el diff)` /
  `aceptacion (desde una spec)`. Reusa los selectores de harness/proveedor, el
  `streamSseOverPost` que ya existia y el mismo panel de preview; solo cambian
  el endpoint y el body. El textarea se re-etiqueta a "Spec" y se deshabilita
  en modo diff (ahi el material es el diff, no lo que escriba el usuario).
  El readout muestra `gate verde: ultima bala ✓ / ✗`.
- `handyman/src/toolbox_acceptance.ts`: shim de re-export.

## Dos decisiones que vale la pena declarar

1. **La spec viaja en el body, no como path.** Aceptar un nombre de archivo
   habria significado una segunda allowlist de lectura del workspace al lado de
   la de `/api/md`, sin ganancia: el cliente ya tiene el documento abierto. Se
   acota a `ACCEPTANCE_SPEC_MAX_CHARS` (60k) dentro del cap de 256 KB del relay.
2. **El cumplimiento del gate se CHEQUEA, no se confia ni se censura.** Que el
   prompt lo pida no es evidencia. `lastBulletIsGreenGate` lo verifica en el
   server y el resultado reporta `gate_last`; si el modelo no cumplio, la
   respuesta **igual se devuelve** marcada en falso. Censurar o reintentar
   daria falsa confianza, y §6 dice que el LLM redacta, no decide.

## Verificacion

- `tests/test_toolbox_acceptance.js` (nuevo, 10 casos, sin red ni server):
  las reglas del system prompt, el encuadre por fuente, material vacio y
  truncado, `lastBulletIsGreenGate` en los 4 estilos de bala y con el gate
  **fuera** de la ultima posicion, los negativos, y el relay reportando
  `gate_last` true y false y mapeando `LlmError`.
- `tests/test_web_acceptance.sh` (nuevo, 9 casos, estructural): route handler,
  prelude + guards, la spec sin lectura de archivos, las reglas del prompt, el
  chequeo server-side del gate, read-only, el toggle cableado, la reutilizacion
  del streaming/preview existentes, y el framing SSE.
- `tests/test_toolbox_serve.sh` (oraculo, +3 casos): `source=spec` con
  `gate_last=true` de punta a punta, `source=diff` sin campo `spec`, y 400 en
  source invalida y spec vacia.
- Sin regresion en `test_web_intake.sh` (5/5) ni `test_web_intake_ask.sh`
  (19/19), que son los que cubren la vista tocada.
- Ambas suites cableadas en `tests/run_tests.sh`.
