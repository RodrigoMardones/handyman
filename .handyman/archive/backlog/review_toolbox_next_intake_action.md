---
type: Review Log
feature: toolbox_next_intake_action
id: 46
role: reviewer
date: 2026-07-18
verdict: APPROVED
tags: [handyman/backlog/review]
---

# Review: toolbox_next_intake_action (feature 46)

Contraste de [[impl_toolbox_next_intake_action]] contra la acceptance,
`CHECKPOINTS.md` y los docs del workspace.

## Acceptance, punto por punto

1. **Core unificado** - `writeIntake` con el orden de validacion exacto del
   observer (asertado en T7: root -> empty -> registry) + footer capado, e
   `intakeHttp` byte-identico (T7 mapea 200/422/400 con los strings
   exactos); toolbox_serve delega y ya no contiene writeFileSync (TWI3). OK.
2. **Route handler nativo con paridad** - POST force-dynamic con cap
   INTAKE_MAX_BYTES y el mismo mapeo compartido; evidencia black-box en la
   corrida dual (4 casos nativos, incluida la escritura real). OK.
3. **Server action** - `"use server"` + submitIntake sobre la misma funcion
   via runtime singleton, mismo cap (TWI2); typecheck verde. Cero
   duplicacion de la logica de escritura. OK.
4. **Strangler + tests** - proxy roba /api/intake (TWI5); T7 en
   test_toolbox_state.js (20/20) + test_web_intake.sh (5/5) cableadas
   (24 suites). OK.
5. **Oraculo default + dual documentada** - default Node 48/48 sin editar
   aserciones; dual 42/48 (solo el carve-out de GET /) con intake nativo;
   docs/verification.md actualizado. OK.
6. **Gates** - `./init.sh` exit 0 (24 suites OK). OK.

## CHECKPOINTS

- C1/C2: estado coherente; solo la 46 in_progress.
- C3: cero dependencias nuevas; el patron respeta el principio "una sola
  escritura, allowlisted" y lo concentra en un modulo del core; los server
  actions quedan confinados a la mutacion de UI (decision documentada en el
  plan y en verification.md).
- C4: unit (T7) + estructural (5 casos) + oraculo como red; verifier >0
  tests, todo verde.
- C5: cierre completado junto a este review.

## Riesgos señalados (no bloqueantes)

- El action no tiene consumidor UI hasta la 48; su contrato (mensajes
  espejo del HTTP) queda fijado por la suite estructural para que la UI no
  derive un vocabulario propio.
- El cap del action se comprueba sobre draftMd (el payload dominante),
  mientras el HTTP capea el body completo; equivalente en la practica y
  documentado en el impl report.

**Veredicto: APPROVED** - acceptance cumplida con evidencia dual real, el
oraculo default intacto y la escritura unificada sin duplicacion.
