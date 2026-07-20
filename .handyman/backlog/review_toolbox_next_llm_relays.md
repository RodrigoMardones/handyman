---
type: Review Log
feature: toolbox_next_llm_relays
id: 45
role: reviewer
date: 2026-07-18
verdict: APPROVED
tags: [handyman/backlog/review]
---

# Review: toolbox_next_llm_relays (feature 45)

Contraste de [[impl_toolbox_next_llm_relays]] contra la acceptance,
`CHECKPOINTS.md` y los docs del workspace.

## Acceptance, punto por punto

1. **Framing y 400 identicos** - los tres POST existen (TWL1), las
   validaciones llevan los strings exactos del observer y disparan antes de
   cualquier LLM (TWL2); `lib/relay.ts` fija el framing
   `event: X\ndata: json\n\n` y los 5 headers del relay + el cap 256 KB
   (TWL3). Evidencia black-box: corrida dual con los casos de draft (400s)
   pasando nativos. OK.
2. **Cache-hit contra Next** - dual-run: primer summarize delta+result
   cached:false; segundo POST cached:true con mismo hash y `GET /v1/calls`
   del fake compartido == 1 (la SummaryCache es la del runtime singleton,
   TWL4). OK.
3. **Ask con citas** - dual-run: answer con `[fuente: backlog:impl_alpha.md]`
   y fragments {ref,kind,title,score}; refs 1:1 con /api/md (mismo
   buildCorpus del core). OK.
4. **resolveSummaryModel compartido** - vive en el core (precedencia
   intacta), el serve la importa via shim y NO conserva copia local (TWL5);
   summarize y ask de Next la consumen. test_toolbox_llm/draft intactos. OK.
5. **Oraculo dual + default + docs** - dual 42/48 (mismos 6 fallos =
   carve-out GET /); default Node 48/48 sin editar aserciones;
   `docs/verification.md` actualizado (incluye el mapa de lo que queda
   proxeado: intake y el panel). OK.
6. **Gates** - `./init.sh` exit 0 (23 suites OK). OK.

## CHECKPOINTS

- C1/C2: estado coherente; solo la 45 in_progress durante la sesion.
- C3: cero dependencias nuevas; el patron respeta las capas (handlers
  delgados -> core relays HTTP-agnosticos; nada de logica LLM duplicada).
- C4: suite estructural nueva (6 casos) + los casos SSE/cache del oraculo
  como red black-box; verifier >0 tests, todo verde.
- C5: cierre completado junto a este review.

## Riesgos señalados (no bloqueantes)

- `relayResponse` inicia el stream en `start()` sin abort-hook del request:
  si el cliente corta a mitad de un draft largo, el provider sigue hasta
  terminar (mismo comportamiento efectivo que el observer Node, que tampoco
  cancela el fetch al provider en `close`). Paridad, no regresion.
- Los 400 se emiten tras leer el body completo (cap 256 KB), igual que el
  observer.

**Veredicto: APPROVED** - acceptance cumplida con evidencia dual real y el
oraculo default intacto.
