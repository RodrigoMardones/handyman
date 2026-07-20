---
type: Implementation Log
feature: web_exp_revision
status: implemented
role: implementer
updated: 2026-07-20
tags: [handyman/role/implementer, handyman/feature/web_exp_revision]
---

# Implementation Report: web_exp_revision (69)

Alcance acordado en entrevista con el operador: eliminar la landing de
marketing de `/` (no entregaba valor formal en un observer localhost),
redirigir a `/fleet`, y dejar las mejoras UX como informe nombrado
(`backlog/explore_web_ux_mejoras.md`), no construidas.

## Files Changed

- `apps/web/app/page.tsx` — la landing de 550 lineas se reemplazo por un
  `redirect("/fleet")` de `next/navigation` (307 en GET de documento).
- `apps/web/app/page.module.css`, `apps/web/components/ScrollReveal.tsx`,
  `apps/web/components/ScrollReveal.module.css` — eliminados; ScrollReveal
  solo lo usaba la landing.
- `apps/web/app/layout.tsx` — el docstring del strangler ya no narra que
  `/` es la landing; describe el redirect.
- `packages/toolbox-core/src/state.ts` — `HTML_CSP_HEADER` eliminado: sin
  las fotos picsum de la landing no hay concesion `img-src` que derivar;
  las paginas llevan el mismo `CSP_HEADER` que las APIs (la propia doc de
  la constante anticipaba este colapso).
- `apps/web/next.config.ts` — `headers()` aplica `CSP_HEADER`.
- `tests/test_web_landing.sh` — eliminado entero (era estructural sobre la
  landing + scan de em-dashes del tasteskill).
- `tests/run_tests.sh` — ya no invoca la suite eliminada.
- `tests/test_toolbox_serve.sh` — TS1 aserta ahora 307/308 + `Location`
  `/fleet` y conserva el contrato estructural de seguridad (sin vendors
  UMD, sin `id="root"`, sin scripts externos) contra el body seguido con
  `curl -sL`. TS6b prueba `/timeline` y `/fleet` (ya no `/`, que es
  redirect) mas `/api/state`, y aserta que ninguna superficie lleva
  `picsum`.
- `tests/test_web_fleet.sh` — comentario stale que apuntaba a
  `test_web_landing.sh`.
- `.handyman/docs/architecture.md` — `GET /` descrito como redirect.
- `.handyman/docs/verification.md` — addendum de la feature 69 bajo la
  historia de la feature 50 (los dos casos mutados y la suite eliminada),
  sin reescribir la historia.

## Design Notes

- Via perezosa: redirect en vez de mover la vista fleet a `/` (habria
  tocado nav, palette y todos los tests que esperan `/fleet`).
- La CSP quedo MAS estricta que antes (una superficie menos y sin origen
  de imagen externo): el colapso a una sola constante elimina la pareja
  de aserciones bidireccionales que existia solo para vigilar el
  `.replace`.
- El informe UX con las mejoras nombradas (N1, N2, J1-J3, A1, A2) vive en
  `backlog/explore_web_ux_mejoras.md` con prioridad sugerida.

## Verification

- `./init.sh` (shellcheck -> lint -> build -> tests) debe salir 0; el
  redirect y la CSP quedan pinneados por TS1/TS6b de
  `test_toolbox_serve.sh` contra el standalone real.
