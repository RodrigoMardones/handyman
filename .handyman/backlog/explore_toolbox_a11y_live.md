---
type: Explore Report
topic: toolbox_a11y_live
role: explorer
updated: 2026-07-17
tags: [handyman/backlog/explore]
---

# Explore: ¿necesitamos toolbox_a11y_live y cómo mejorarla?

## Pregunta

¿Se justifica la feature 22 (`toolbox_a11y_live`, Plan D del análisis de UI)?
¿Cómo mejorarla? ¿Converge con
[analisis-peticiones-llm-toolbox.md](../../docs/analisis-peticiones-llm-toolbox.md)?

## Veredicto: sí se necesita, con 3 ajustes de especificación

### Evidencia del gap (estado actual del panel)

Auditado `handyman/assets/toolbox_panel.js` (497 líneas) y el CSS de
`handyman/src/toolbox_serve.ts`:

1. **Cero live regions.** El `statusline` es un `<span>` cuyo texto cambia
   ("connecting…" → "live · HH:MM" → "reconnecting…") sin ningún rol ARIA:
   un usuario de lector de pantalla no recibe **ninguna** notificación de
   updates SSE ni de pérdida de conexión. Es un fallo directo de WCAG 2.2
   SC 4.1.3 *Status Messages* (nivel AA) en la funcionalidad central del
   observador (ser "live").
2. **El panel ya invierte en a11y** (aria-pressed en el theme toggle,
   role=img + aria-label en el sparkline, scope=col, dialog nativo con
   showModal y devolución de foco nativa). La feature completa un patrón ya
   adoptado, no introduce uno ajeno.
3. **Empty states**: existen vía el componente `Empty`, pero varios son
   secos ("no harnesses registered", "no matches", "no dated closures yet",
   "no features in feature_list.json"); solo el del grafo ya es accionable.
4. **No hay animaciones ni auto-scroll hoy** — el criterio 3 de aceptación
   (prefers-reduced-motion) es actualmente vacuo. Ver ajuste (b).

### Investigación web (julio 2026)

- **Las live regions siguen siendo el mecanismo correcto.** La alternativa
  moderna `ariaNotify()` NO es baseline: solo Firefox 150+ la soporta de
  serie; Edge la tiene experimental; sin soporte estable en Chrome/Safari
  (MDN, oidaisdes.org 2026). No usarla ahora; anotarla como enhancement
  progresivo futuro.
- **Pitfall confirmado**: combinar `role="alert"` con `aria-live="assertive"`
  explícito produce **doble anuncio en VoiceOver/iOS** (accesify.io, A11Y
  Collective). `role="alert"` ya implica assertive → la región assertive debe
  llevar SOLO `role="alert"`. La aceptación de la feature ya lo permite tal
  como está redactada (pide `role=alert`, no exige el atributo explícito).
- **Debounce/cola confirmado como best practice**: anunciar cada evento SSE
  degrada el lector y el rendimiento; regiones vacías al cargar, presentes
  desde el primer render (esperar ~2s si se inyectan tarde — nosotros las
  rendereamos desde el inicio, así que no aplica la espera).

### Ajustes de especificación (dentro de la aceptación existente)

a. **Región assertive = `role="alert"` sin `aria-live` explícito** (evita el
   doble anuncio VoiceOver). Polite = `role="status"` + `aria-live="polite"`
   (el atributo explícito aquí sí es el combo recomendado por compat).
b. **prefers-reduced-motion como guard global de CSS** en `PANEL_CSS`
   (`@media (prefers-reduced-motion: reduce)` que anula animation/transition/
   smooth-scroll): hoy no hay motion que apagar, pero el guard hace el
   criterio real, es testeable por grep en el HTML servido, y cubre de golpe
   la feature 23 (command palette) y cualquier motion futuro.
c. **El anunciador como módulo reutilizable** (`announce.polite(msg)` /
   `announce.assertive(msg)` con cola + debounce único): es el punto de
   convergencia con la capa LLM (ver abajo). El resumen debounced se computa
   con un diff barato de `status_counts`/`session` entre el estado anterior y
   el nuevo ("handyman: 2 feature(s) updated"), con fallback genérico
   ("fleet state updated") si el diff no identifica nada.

## Convergencia con analisis-peticiones-llm-toolbox.md: fuerte y explícita

1. El doc LLM (§3) ya especifica: *"mapear fallo del proveedor →
   `event: error` SSE → **live region assertive** en la UI (plan D del
   análisis de UI)"*. La región assertive de esta feature ES la superficie de
   error que la futura capa LLM consumirá — la feature 22 es prerequisito de
   infraestructura, no un extra cosmético.
2. Misma filosofía anti-ruido: el doc LLM prohíbe llamadas LLM automáticas
   por evento SSE ("todo LLM es pull o batch"); esta feature prohíbe anunciar
   por evento (cola + debounce). Es el mismo principio aplicado a dos capas.
3. El caso estrella "Ask your fleet" streamea deltas por SSE: esos deltas NO
   deben tocar live regions (serían anuncios por token); el módulo announce
   con cola da el punto único donde anunciar solo el final ("answer ready").

## Fuera de alcance (YAGNI)

- `ariaNotify()`: no baseline, revisar cuando llegue a Chrome/Safari.
- Anuncios por harness granulares más allá del diff de counts.
- Toasts visuales: las live regions de esta feature son sr-only; la UI visual
  ya comunica por el statusline (que gana texto+color, nunca solo color).

## Fuentes

- MDN: Element.ariaNotify / Document.ariaNotify (soporte Firefox 150+)
- oidaisdes.org — "How good is Browser Support for the ARIA Notify API?" (2026)
- A11Y Collective — "The Complete Guide to ARIA Live Regions"
- accesify.io — "Accessible Notifications & Alerts — Using ARIA Live Regions
  Effectively" (pitfall role=alert + aria-live=assertive en VoiceOver/iOS)
- uxpin.com — "ARIA Live Regions for Dynamic Content" (debounce)
- WCAG 2.2 SC 4.1.3 Status Messages (AA)
