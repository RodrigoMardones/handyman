# Análisis: mejoras de UI del observador toolBox e información del proyecto a exponer

> ¿Qué mejoras de interfaz convienen al observador web (`toolbox serve`) y qué
> información del proyecto que ya existe en disco debería exponer? Investigación
> en internet (julio 2026) + evidencia de los análisis UX legados recuperados de
> git (`analisis-ux-ui-workstation{,-2}.md`, commit `0111090`) + gaps del port
> actual. Complementa [analisis-observador-fleet-web.md](analisis-observador-fleet-web.md);
> la capa LLM se analiza en [analisis-peticiones-llm-toolbox.md](analisis-peticiones-llm-toolbox.md).

## 1. Evidencia: lo que el proyecto ya decidió y lo que el port dejó pendiente

1. **Los análisis UX legados ya resolvieron el sistema de diseño** (paleta v2
   "taller digital", tokens `--hw-*` WCAG-AA auditados, escala tipográfica de 5
   pasos, semántica warm/cool). El port a React conservó los tokens — cualquier
   mejora debe consumirlos, no añadir hex sueltos.
2. **Trabajo futuro que el legado dejó explícitamente diferido** (ux2 §8):
   rediseño de la página estática `moc --html`, theming white-label, i18n,
   **sparklines de throughput sobre metrics**, regresión visual con capturas.
3. **Gaps del port actual respecto al legado**:
   - El workstation tenía **toggle manual light/dark/system** (ux2 §6.4, con
     contrato anti-flash y storage versionado `hw-theme:1`); el panel React
     solo tiene `prefers-color-scheme` — no hay control manual.
   - El legado renderizaba fechas relativas con absoluta en `title` y un
     formatting layer (`fmt.*`); el panel actual muestra fechas crudas.
   - Vistas con hash routing existen, pero sin navegación por teclado ni
     command palette.
   - El markdown se muestra en `<pre>` crudo (sin render).
4. **Información del proyecto que ya se computa y el panel no muestra**:
   - `metrics.collect()`: **throughput por fecha** (lista para sparkline),
     **veredictos de review** (approved/changes_requested, approval rate),
     **cobertura** (done con reportes impl+review, faltantes).
   - `sprint` por feature (`YYYY-SPn`) — el kanban lo muestra por card pero no
     hay vista/filtro por sprint.
   - `docs/` de dominio (business/architecture/conventions/verification) — solo
     accesibles vía búsqueda, no como sección navegable.
   - `graphify-out/GRAPH_REPORT.md` (god nodes, conexiones sorprendentes) — el
     grafo se embebe pero el reporte no se expone.
   - `events.jsonl` (heartbeats) ya alimenta el timeline; no hay narrativa por
     rango ("qué pasó esta semana").

## 2. Evidencia: estado del arte 2026 (investigación en internet)

Convergencia de Grafana/Linear/Vercel/Datadog para dashboards data-densos:

- **Progressive disclosure**: primero "¿está todo bien?" (señales), drill-down
  después. Un dashboard = una pregunta (best practice oficial de Grafana).
- **Densidad alta dentro de cards, respiración entre bloques**; modo
  compact/comfortable barato con un token `--hw-density`.
- **Live indicators discretos**: punto + "updated Xs ago", nunca parpadeo de
  contenido; respetar `prefers-reduced-motion` incluso en el punto "live".
- **Micro-visualizaciones**: para sparklines, **SVG inline a mano** (un
  `<polyline>`, 0 KB, theme-aware vía `--hw-*`, `role="img"` + `aria-label`);
  uPlot (47.9 KB min, publica IIFE servible desde node_modules) solo si algún
  día hace falta zoom/miles de puntos. Chart.js/Recharts descartados (peso o
  ESM-only).
- **Markdown en cliente**: react-markdown es **ESM-only, inviable sin bundler**.
  El estándar es **marked + DOMPurify** (ambos con UMD en node_modules), con
  `FORBID_TAGS`/`FORBID_ATTR`, bloqueo de `javascript:` y CSP
  `default-src 'self'` como segunda defensa. El contenido de los agentes se
  trata como no confiable aunque sea local.
- **Theme toggle 2026**: tres estados (light/dark/system, "system" = borrar la
  clave de localStorage), script inline síncrono en `<head>` (anti-flash),
  `data-theme` en `<html>` como interruptor de tokens, listener de
  `matchMedia('(prefers-color-scheme: dark)')` activo solo en modo system.
  Coincide con el contrato que el legado ya había definido (§6.4).
- **A11y con SSE**: exactamente **dos live regions persistentes** creadas al
  cargar (polite con `role="status"`, assertive con `role="alert"`), vacías al
  inicio; **nunca anunciar cada evento** — encolar y resumir con debounce;
  `<dialog>` nativo con `showModal()` y devolución de foco.
- **Keyboard-first**: el patrón ⌘K es apuesta segura (GitHub intentó retirar su
  palette en 2025 y revirtió en 5 días). cmdk/kbar son ESM (no cargan sin
  bundler) → **palette hecho a mano** con `<dialog>` + un array de acciones +
  **MiniSearch como ranker** (ya está cargado en el cliente). Atajos: `⌘K`,
  `/` buscar, `j/k` moverse, `g`+letra ir a vista, `?` ayuda, `Esc`.

Fuentes completas en el informe de investigación (Grafana best practices,
925studios, uPlot, DOMPurify/cure53, Strapi/HackerOne sobre markdown seguro,
Aleksandr Hovhannisyan/whitep4nth3r sobre theme toggle, Sara Soueidan/A11Y
Collective sobre live regions, uxpatterns.dev/kbar/cmdk sobre palettes).

## 3. Planes

Ordenados por valor/esfuerzo; todos consumen tokens `--hw-*` existentes.

### Plan A — Información del proyecto en la vista de detalle (esfuerzo bajo)

Exponer lo que `metrics.collect()` ya calcula: strip de KPIs por harness
(approval rate, cobertura, cierres últimos 14 días) + **sparkline SVG a mano**
del throughput. Cierra el "trabajo futuro" que el legado dejó anotado. Incluye
sección "Docs" (business/architecture/conventions/verification) como botones de
quick-view, y fechas relativas con absoluta en `title` (port del `fmt.*` legado).

### Plan B — Theme toggle light/dark/system (esfuerzo bajo)

Port del contrato legado §6.4 al panel React: script inline anti-flash en el
`panelHtml()`, `data-theme` sobre los tokens ya existentes, control de 3 estados
en la nav (`aria-pressed`), clave `hw-theme:1`. El CSS ya soporta ambos
selectores — es solo la capa de control.

### Plan C — Markdown renderizado seguro (esfuerzo bajo-medio)

Sustituir el `<pre>` del visor por marked + DOMPurify (UMD desde node_modules,
mismo mecanismo `/vendor/*`), con la configuración de sanitización del informe y
CSP `default-src 'self'` en el servidor. Aplica al visor de current/history/
CHECKPOINTS/backlog/docs y a los resultados de búsqueda.

### Plan D — A11y live + estados vacíos (esfuerzo medio)

Dos live regions persistentes con cola y debounce ("3 features actualizadas en
handyman"), indicador SSE accesible (texto + color, nunca solo color),
`prefers-reduced-motion` consultado antes de animar/auto-scrollear, empty states
accionables ("sin proyectos — ejecuta handyman install").

### Plan E — Command palette + atajos (esfuerzo medio)

`<dialog>` + input + lista, rankeada con el índice MiniSearch ya cargado
(acciones: ir a proyecto/vista, abrir md, buscar). Atajos `⌘K`, `/`, `j/k`,
`g`+letra, `?`. Un solo listener `keydown` con guard de `event.target`.

### Plan F — Vista de sprint y narrativa (esfuerzo medio, después de A)

Filtro/agrupación por `sprint` en el kanban y en timeline; sección con los
highlights de `GRAPH_REPORT.md`. La "narrativa de la semana" con LLM se diseña
en [analisis-peticiones-llm-toolbox.md](analisis-peticiones-llm-toolbox.md).

Fuera de alcance (igual que en el legado): i18n, white-label, regresión visual
con browser automation, rediseño de la página estática.
