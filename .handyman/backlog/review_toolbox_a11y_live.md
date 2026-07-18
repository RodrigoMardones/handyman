---
feature: toolbox_a11y_live
status: approved
role: reviewer
updated: 2026-07-17
tags: [handyman/backlog/review]
---

# Review: toolbox_a11y_live (feature 22, Plan D)

Contra [[impl_toolbox_a11y_live]], `docs/architecture.md`, `docs/conventions.md`
y CHECKPOINTS.md.

## Aceptación, criterio por criterio

1. **Dos live regions persistentes desde el primer render, vacías, únicas** —
   CUMPLE. Estáticas en `panelHtml()` antes de `#root` (mejor que "primer
   render React": existen antes de cargar cualquier script). El test TS1c
   verifica posición, vacuidad, y que `aria-live` aparece exactamente 1 vez en
   toda la página servida (asset inline incluido). La región assertive lleva
   `role="alert"` solo — desviación deliberada y documentada del texto de la
   descripción (evita doble anuncio VoiceOver/iOS, ver explore report); la
   redacción de la aceptación lo permite.
2. **SSE encolado con resumen debounced polite; conexión assertive como
   texto+color** — CUMPLE. `announce` (cola, 1500ms) + `diffSummary`; solo
   los refresh disparados por SSE anuncian; onopen/onerror con transiciones
   de estado (sin anuncio en el primer connect). Statusline: texto siempre
   ("live · HH:MM" / "reconnecting…") + clase de color `is-live`/`is-down`.
   Verificado en runtime con simulación node (debounce colapsa 3 → 1,
   assertive inmediato, diff correcto).
3. **prefers-reduced-motion** — CUMPLE. Guard global ya existía en
   `HTML_STYLE` (anula animation/transition/scroll-behavior); ahora sellado
   por test. No existe auto-scroll ni animación JS que gatear.
4. **Empty states accionables** — CUMPLE (fleet/queue/timeline/search/metrics
   con comando o siguiente paso concreto).
5. **Test de markup en panel servido; init.sh exit 0** — CUMPLE con reserva.
   Suite toolbox 21/21 (4 casos nuevos TS1c). `./init.sh` sale 0 con los
   cambios de la feature; sale 1 SOLO por el WIP ajeno pre-existente
   (`2.0.1-alpha` en SKILL.md/package.json rompe el parser semver), probado
   por bisección con stash. El cierre queda gateado por ese WIP, no por esta
   implementación.

## Convenciones / arquitectura

- Sin dependencias nuevas (C3); tokens `--hw-*` existentes; asset del panel
  sin build step, coherente con la restricción sin-bundler.
- Tests black-box bash como oráculo de paridad, naming y estilo consistentes.
- Comentarios explican contratos no obvios (regiones fuera del árbol React,
  por qué role=alert sin atributo explícito, por qué solo SSE anuncia).

## Observaciones menores (no bloqueantes)

- El mensaje colapsado "…(N updates)" mezcla el último resumen con el conteo
  de ráfaga; aceptable como resumen, revisar redacción si algún día confunde.
- `diffSummary` no distingue harness eliminado (cae en "fleet state
  updated"); caso raro en un observador local, suficiente.

## Veredicto

**APPROVED** — cerrar (`feature.js done`) en cuanto el WIP del version bump
`2.0.1-alpha` se resuelva y `./init.sh` vuelva a exit 0 en el tree completo.
