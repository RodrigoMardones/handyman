---
feature: toolbox_a11y_live
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/backlog/impl]
---

# Impl: toolbox_a11y_live (feature 22, Plan D)

Research base: [[explore_toolbox_a11y_live]] (por qué se necesita, ajustes de
spec, convergencia con la capa LLM).

## Cambios

### `handyman/src/toolbox_serve.ts`

- **Dos live regions estáticas en `panelHtml()`**, antes de `#root` y fuera
  del árbol React: presentes y vacías desde el primer byte, y los re-renders
  nunca las recrean (regiones recreadas son poco fiables entre lectores).
  - Polite: `id="live-polite" class="visually-hidden" role="status"
    aria-live="polite"`.
  - Assertive: `id="live-assertive" class="visually-hidden" role="alert"`
    **sin** atributo aria-live explícito (el combo duplica anuncios en
    VoiceOver/iOS — ver explore report). Son las únicas superficies live.
- CSS statusline: `.is-live` (`--hw-ok`) / `.is-down` (`--hw-danger`) —
  color ADEMÁS del texto, nunca solo.
- El guard `@media (prefers-reduced-motion: reduce)` ya existía global en
  `HTML_STYLE` (anula animation/transition/scroll-behavior); se cubre con
  test para que quede sellado en el contrato. No hay auto-scroll ni
  animaciones en el panel hoy; el guard protege lo futuro (feature 23).

### `handyman/assets/toolbox_panel.js`

- Módulo `announce` (cola + debounce 1500ms): `announce.polite()` encola y
  colapsa ráfagas en UN anuncio ("3 feature(s) updated in handyman (3
  updates)"); `announce.assertive()` escribe inmediato. Punto único de
  anuncio, reutilizable por el relay LLM futuro (convergencia doc LLM §3).
- `diffSummary(prev, next)`: diff por harness de estados de features por
  nombre → "N feature(s) updated in X"; harness nuevo → "harness X
  registered"; cambio fuera de las listas → "fleet state updated".
- `App`: `refresh(sseEvent)` solo anuncia cuando lo dispara SSE (la carga
  inicial no es un cambio); `source.onopen`/`onerror` rastrean conexión con
  `connRef` y anuncian pérdida/recuperación en la región assertive
  ("live updates disconnected — retrying" / "live updates reconnected");
  el statusline gana clase de estado (texto + color).
- Empty states accionables: fleet ("register one with: node dist/toolbox.js
  register PATH"), queue ("add one with: scripts/feature.py add"), timeline
  ("close a feature ... to record the first"), search ("try a shorter
  term"), metrics ("the harness state could not be read").

### `tests/test_toolbox_serve.sh` (+4 casos, TS1c)

1. Exactamente dos regiones estáticas, vacías, ANTES de `#root`; exactamente
   una ocurrencia de aria-live en toda la página servida (asset inline
   incluido) y ninguna `aria-live="assertive"`.
2. El guard prefers-reduced-motion llega en el CSS servido.
3. El asset trae announcer, debounce, diffSummary y anuncios de conexión.
4. Los empty states son accionables.

## Evidencia

- `tests/test_toolbox_serve.sh`: **21 run, 21 passed** (17 previos + 4 nuevos).
- Simulación node con DOM stub: 3 anuncios rápidos → región vacía hasta el
  debounce → un solo texto colapsado; assertive inmediato; diff correcto
  (cambios, harness nuevo, fallback, primera carga sin anuncio).
- `./init.sh` con los archivos de esta feature: **verde** (exit 0) cuando se
  aísla el WIP ajeno (ver blocker).

## Blocker de cierre (ajeno a esta feature)

El working tree trae un bump **previo y sin commitear** a `2.0.1-alpha` en
`handyman/SKILL.md` + `handyman/package.json` (con vis-network, rama
feat/toolbox-ui-observer). El parser semver del harness rechaza el sufijo
pre-release → fallan las suites de version/upgrade y `./init.sh` sale 1.
Probado por bisección: con esos 2 archivos stasheados, init.sh sale 0 CON
todos los cambios de la feature 22 aplicados. Resolver ese WIP (aceptar
pre-release en `core/version.ts` como feature propia, o revertir el stamp)
y entonces cerrar con `node handyman/dist/feature.js done toolbox_a11y_live`.
