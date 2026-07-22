---
type: Review Log
feature: toolbox_next_read_api
id: 44
role: reviewer
date: 2026-07-18
verdict: APPROVED
tags: [handyman/backlog/review]
---

# Review: toolbox_next_read_api (feature 44)

Contraste de [[impl_toolbox_next_read_api]] contra la acceptance,
`CHECKPOINTS.md` y los docs del workspace.

## Acceptance, punto por punto

1. **Seis handlers con paridad** - existen (TWA1), force-dynamic (TWA2), y
   los bodies de error son los strings exactos del observer (TWA3:
   allowlist md 400/404, files 400, providers shape + copilot future via
   providersInfo compartido, graph 404 unknown/no-export + rewrite
   same-origin, vendor 404). Evidencia black-box: corrida dual 42/48 con
   estos casos pasando servidos nativamente. OK.
2. **Helpers compartidos sin duplicar** - `toolbox_assets.ts` es el unico
   hogar de vendorFiles/packageRoot/graphFile (TWA5 asserta ausencia en el
   serve); el serve los consume y el oraculo default paso 48/48 sin editar
   aserciones (byte-equivalencia del refactor). OK.
3. **Strangler + headers** - proxy.ts roba los 4 pathnames y los prefijos
   /graph/ y /vendor/ (TWA4); `lib/respond.ts` fija los 4 headers
   byte-identicos (CSP same-origin + no-store incluidos). OK.
4. **Oraculo dual + default** - dual TOOLBOX_BASE_URL -> Next: 42/48, los 6
   fallos identicos al carve-out documentado de GET /; default Node 48/48.
   docs/verification.md actualizado con el parrafo de la feature. OK.
5. **Gates** - ./init.sh exit 0 (22 suites OK). OK.

## CHECKPOINTS

- C1/C2: estado coherente, solo la 44 in_progress durante la sesion.
- C3: cero dependencias nuevas; capas respetadas (handlers delgados sobre
  core + assets compartidos; nada de logica duplicada).
- C4: suite estructural nueva (6 casos) + oraculo como red black-box;
  verifier >0 tests, todo verde.
- C5: cierre completado junto a este review.

## Riesgos señalados (no bloqueantes)

- Micro-divergencia aceptada y documentada: metodos no-GET sobre rutas
  nativas devuelven el 405 de Next (status identico, body distinto al del
  observer); el oraculo asserta solo el status.
- El caso CSP del oraculo sigue atado a GET / (carve-out heredado de la
  landing); se resolvera cuando la 49/50 redefinan la raiz.

**Veredicto: APPROVED** - acceptance cumplida, oraculo default intacto y
evidencia dual real.
