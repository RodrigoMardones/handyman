---
type: Review Log
feature: toolbox_acceptance_from_diff
id: 33
role: reviewer
date: 2026-07-19
verdict: APPROVED
tags: [handyman/backlog/review]
---

# Review: toolbox_acceptance_from_diff (feature 33)

## Evidencia verificada

- `./init.sh` exit 0 (gate completo).
- `tests/test_toolbox_acceptance.js`: 10/10.
- `tests/test_web_acceptance.sh`: 9/9.
- `tests/test_toolbox_serve.sh` (oraculo): **37/37**, con los 3 casos nuevos.
- Sin regresion en las suites de la vista tocada: `test_web_intake.sh` 5/5,
  `test_web_intake_ask.sh` 19/19.

## Acceptance, bala por bala

1. **Route handler nativo, `source='diff'|'spec'`, 400 antes del LLM** — OK.
   Prelude D-B + guards de `source` y `spec`. Confirmado por HTTP.
2. **SSE con la lista de acceptance** — OK, tramas reales en ambas fuentes.
3. **Verbos observables, prohibicion de lo vago, gate como ultima bala** — OK,
   y mejor de lo pedido: ademas de estar en el prompt, **se verifica**.
4. **Toggle en /intake reusando selectores y render seguro** — OK. TWA8 fija
   que no aparecio un segundo camino de streaming ni de render.
5. **Diff dentro del root registrado, sin escribir disco** — OK.
6. **Suite registrada, ningun test toca la red** — OK.
7. **Gate verde** — OK.

## Lo que se reviso con mas cuidado

- **`lastBulletIsGreenGate` podia ser teatro.** Se verifico que no lo es: el
  caso negativo importante — el gate presente pero **no en la ultima
  posicion** — esta cubierto (unitaria T3), que es justo el error que un modelo
  comete. Tambien cubre `-`/`*`/`+`/numeradas y rechaza prosa sin balas.
- **Reutilizacion de `readFeatureDiff` (feature 34).** Correcta: misma
  propiedad de seguridad (execFile, sin shell, cwd validado) sin re-derivarla.
  Es la primera evidencia de que el patron D-B esta pagando.
- **La spec no abre superficie de lectura.** TWA3 grepea que la ruta no llame
  `readFileSync`/`resolveMd`/`readText`. Correcto: era el riesgo real de esta
  feature y se evito por diseno, no por cuidado.
- **UI:** el textarea deshabilitado en modo diff evita la trampa de que el
  usuario escriba algo que el server ignora en silencio. `canDraft` se ajusto
  en consecuencia. Sin estado nuevo mas alla de `mode`.

## Observaciones (no bloqueantes)

- `gate_last` se muestra pero no bloquea nada — es lo correcto hoy. Si en el
  futuro el intake quisiera **rechazar** un draft sin gate, el chequeo ya esta
  y solo habria que cablearlo; no se hizo porque nadie lo pidio.
- El modo `acceptance-diff` toma `git diff HEAD` del root **entero**, no de una
  feature concreta: si hay trabajo de varias features mezclado en el arbol, el
  material sera mas amplio que la feature en curso. Es aceptable dado que el
  harness trabaja una feature a la vez, pero conviene saberlo.

## Desviacion de proceso

Igual que en 32 y 34: los tres roles corrieron en **una sola sesion de un solo
agente**. Evidencia ejecutable real; independencia implementer/reviewer, no.

**Veredicto: APPROVED** sobre la evidencia ejecutable, con la desviacion
declarada.
