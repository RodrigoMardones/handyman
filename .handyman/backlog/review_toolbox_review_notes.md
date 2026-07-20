---
type: Review Log
feature: toolbox_review_notes
id: 34
role: reviewer
date: 2026-07-19
verdict: APPROVED
tags: [handyman/backlog/review]
---

# Review: toolbox_review_notes (feature 34)

## Evidencia verificada

- `./init.sh` exit 0 (gate completo).
- `tests/test_toolbox_review_notes.js`: 10/10.
- `tests/test_web_review_notes.sh`: 7/7.
- `tests/test_toolbox_serve.sh` (oraculo): **34/34**, con los 3 casos nuevos
  de `/api/review-notes` contra el server real.

## Acceptance, bala por bala

1. **Route handler nativo, 400 antes del LLM** — OK. Prelude D-B + los dos
   guards propios (`feature is required`, `invalid feature name`), todos antes
   de tocar el provider. Confirmado por HTTP en el oraculo.
2. **SSE con checklist desde impl_ + diff** — OK, tramas reales verificadas.
3. **Output marcado como borrador, preguntas y no veredicto ni patch** — OK a
   nivel de prompt (unitaria T5 + TWR5). Ver la salvedad abajo.
4. **No escribe disco; el reviewer firma sobre evidencia real** — OK, TWR6
   grepea ausencia de primitivas de escritura en ruta y core.
5. **Suite registrada, ningun test toca la red** — OK.
6. **Gate verde** — OK.

## Lo que se reviso con mas cuidado

- **La superficie nueva de esta feature es ejecutar `git`.** Es el unico relay
  que lanza un subproceso. Verificado: `execFileSync` (no `execSync`, no
  `shell: true`), argv literal `["diff","HEAD"]`, cwd = root ya validado
  contra el registry, y **ningun campo del body llega a argv**. El unico campo
  libre (`feature`) se usa para un path join y esta acotado por regex antes.
  El oraculo prueba el rechazo de `../../etc/passwd`. Sin hallazgos.
- **Fallo de git = diff vacio, no excepcion.** Correcto y probado en dos
  niveles (unitaria T3 y el caso end-to-end, cuyo fixture no es repo git).
- **Truncacion declarada.** `diff_truncated` viaja en el `result`, asi que el
  reviewer no confunde "no habia nada" con "no lo miro entero". Buen detalle.

## Observacion honesta (no bloqueante)

El assert "el checklist no contiene veredicto" corre sobre una respuesta del
mock que fue escrita sin esos tokens: **no prueba** que un modelo real se
abstenga. Lo unico fijable de verdad es que el system prompt lo prohibe, y eso
si esta cubierto. El implementer decidio no agregar un filtro server-side que
censure el output; coincido: censurar daria falsa confianza y el contrato real
es que la firma del reviewer se apoya en el verifier y el diff. Queda anotado
en el impl report para que no se re-descubra.

## Desviacion de proceso

Igual que en la 32: leader, implementer y reviewer corrieron en **una sola
sesion de un solo agente**. El gate y el oraculo son evidencia ejecutable real,
pero la independencia implementer/reviewer no se cumplio.

**Veredicto: APPROVED** sobre la evidencia ejecutable, con la desviacion
declarada.
