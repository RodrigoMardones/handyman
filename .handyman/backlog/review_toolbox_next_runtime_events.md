---
type: Review Log
feature: toolbox_next_runtime_events
id: 43
role: reviewer
date: 2026-07-18
verdict: APPROVED
tags: [handyman/backlog/review]
---

# Review: toolbox_next_runtime_events (feature 43)

Contraste de [[impl_toolbox_next_runtime_events]] contra la acceptance,
`CHECKPOINTS.md` y los docs del workspace.

## Acceptance, punto por punto

1. **Route handlers nativos con paridad** - `app/events/route.ts` y
   `app/api/state/route.ts` existen, force-dynamic, runtime nodejs. Evidencia
   dual-run: `/api/state` con los 4 headers exactos y JSON IDENTICO
   (normalizado `generated_at`); `/events` emitio `retry: 2000` + frame
   `{"type":"change"}` ante un append real al workspace, a traves del puerto
   Next. OK.
2. **Singleton HMR-safe** - `lib/runtime.ts` en `globalThis` con providers,
   SummaryCache, hub; arma watchers una vez (guard por key de targets),
   re-arma al cambiar el registry (asertado en TWR3 con fakes);
   `instrumentation.ts` con guard `NEXT_RUNTIME === "nodejs"`. OK.
3. **Paginas por llamada directa + Live same-origin** - `getBuildState()`
   (loader runtime) en ambas paginas, force-dynamic, cero fetch al upstream
   (asertado en TWR4); Live components con `/events`, `/api/state`,
   `/api/md` relativos; suites web verifican ademas cero assets externos
   (invariante preexistente intacto). OK.
4. **Tests actualizados + hub cubierto** - TWF6/TWH7 reescritos al contrato
   same-origin con la justificacion en el propio caso (cambio deliberado,
   permitido: son las suites de apps/web, no el oraculo);
   `test_web_runtime.sh` nuevo con 7 casos incluyendo el comportamiento
   completo del hub transpilado puro. OK.
5. **Oraculo default intacto + corrida dual documentada** - default Node
   48/48 sin editar aserciones (dentro de `./init.sh` verde); corrida
   `TOOLBOX_BASE_URL` -> Next 42/48 con los 6 fallos exactamente iguales al
   carve-out documentado de `GET /`; `docs/verification.md` gano la seccion
   de la feature con la nota tecnica del loader. OK.
6. **Gates** - `./init.sh` exit 0, 21 suites OK. OK.

## CHECKPOINTS

- C1/C2: workspace y estado coherentes; solo la 43 in_progress durante la
  sesion.
- C3: arquitectura respetada; cero dependencias nuevas (el loader usa
  node:fs/path/url); el workaround del bundler esta documentado en codigo,
  impl report y verification.md.
- C4: tests cubren lo cambiado (7 casos nuevos + 2 suites actualizadas + el
  oraculo como red); verifier con >0 tests, todo verde.
- C5: cierre completado junto a este review (history/current).

## Riesgos señalados (no bloqueantes)

- `new Function` para el import nativo es un escape deliberado del bundler;
  esta contenido en un solo modulo con comentario y sin input externo (el
  specifier se construye de cwd/env local). Aceptable para una herramienta
  localhost.
- El walk-up de raiz depende de que el standalone viva dentro del repo
  (cierto para esta herramienta local); `TOOLBOX_REPO_ROOT` cubre el resto y
  el wrapper de la feature 50 lo fijara siempre.

**Veredicto: APPROVED** - acceptance cumplida con verifier verde y evidencia
dual-run real.
