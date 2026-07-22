---
type: Implementation Log
feature: new_proposal_ux_ui_handyman_workstation_2
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/backlog/impl]
---

# Implementación: feature 85 — segunda propuesta UX/UI del workstation

## Qué se escribió

`docs/analisis-ux-ui-workstation-2.md` — investigación y plan de trabajo en
español, espejo exacto del formato de la primera pasada
(`docs/analisis-ux-ui-workstation.md`): título con emoji, blockquote con la
pregunta rectora, secciones numeradas 1–9 (objetivo, evidencia con tablas
file:line, gap, restricciones, literatura consultada, decisiones resueltas,
plan de trabajo, trabajo futuro, riesgos) y footnote de cierre citando la
feature 85. El plan de ejecución continúa la serie con letras **F–K** (seis
features independientes, cada una con gate `./init.sh` verde, archivos y tests
deterministas), con orden sugerido F → G → H → I → J → K y su rationale.

## Fuentes leídas

- `.handyman/backlog/explore_workstation_ui_state_2.md` (mapa de evidencia,
  base de todas las afirmaciones sobre el estado actual).
- `docs/analisis-ux-ui-workstation.md` (plantilla de formato; features 77–84
  ya entregadas, nada se re-propone).
- Código verificado directamente: `handyman/scripts/fleet.py` (tokens
  l.718–751, badges l.767–774, favicon l.782–784, página estática l.824–848) y
  `handyman/scripts/workstation.py` (_PANEL_STYLE l.257–326, head/appbar/nav
  l.334–355, secciones l.357–377, diálogo l.689–732, refresh l.971–986, _send
  l.1009–1015, do_GET l.1028–1039). Greps confirmaron los gaps: cero `<main>`,
  `scope=`, `<caption>`, `aria-labelledby`, `prefers-reduced-motion`.
- Skills citadas en "Literatura consultada": accessibility (WCAG 2.2),
  performance, core-web-vitals, web-quality-audit, best-practices,
  frontend-design, vercel-react-best-practices (veredicto explícito: mayormente
  N/A — sin React ni framework; se extrajeron 3 principios framework-agnósticos),
  ponytail (`.agents/skills/ponytail/SKILL.md`), y las referencias canónicas
  `handyman/references/workstation.md` y `workflow.md`. La skill seo se declaró
  excluida en una línea (localhost, sin superficie de búsqueda).

## Decisiones tomadas al escribir

1. **Paleta concreta calculada, no estimada**: se escribió un script de
   contraste (fórmula de luminancia relativa WCAG 2.x, en scratchpad) y se
   iteraron los valores hasta que **todos** los pares texto-superficie pasaran
   AA ≥ 4.5:1 en light y dark (peor par: danger sobre su tinte light, 4.80:1).
   Dos ajustes salieron del cálculo: `--hw-ok` light bajó a `#156C2C` (el
   candidato inicial daba 4.46 sobre el tinte) y nació `--hw-border-strong`
   (el borde hairline actual da 1.55/1.75:1, bajo el 3:1 no-textual de 1.4.11
   para delimitar controles).
2. **Tintes de badge vía `color-mix` al 15 %** en vez de 8 tokens hex nuevos
   (escalera ponytail: plataforma nativa); como la interpolación sRGB es
   determinista, los colores efectivos y sus ratios quedaron calculados e
   incluidos en la auditoría.
3. **Vecindad accent/warn en familia ámbar**: asumida y documentada como
   decisión (contextos disjuntos: enlaces/foco vs badges; nunca color-solo).
4. **Escala tipográfica de 5 pasos** (0.75/0.875/1/1.25/1.5 rem) mapeada a los
   cinco niveles de jerarquía reales del panel; justificación: saltos ≥ 2 px.
5. **Letras F–K** continuando A–E de la primera pasada, para que ambos
   documentos coexistan sin ambigüedad al intake de features.
6. La decisión operativa del shell cacheable se documentó como **refinamiento**
   de la restricción "autocontenido" (assets por el mismo handler = mismo
   origen; externo sigue siendo "fuera del servidor"); `GET /` y `/api/state`
   conservan `no-store` (token y estado).
7. Payload medido en vivo para anclar el presupuesto: `GET /` actual =
   30 588 bytes (9 207 gzip); caps propuestos con margen ~2×.

## Verificación

`./init.sh` desde la raíz del proyecto: **exit 0** — todas las suites verdes
(158 doc-structure, 14 init, 12 update, 21 feature, 7 backlog, 5 index,
10 upgrade, 18 discovery, 7 evals, 8 preflight, 6 metrics, 23 fleet,
21 workstation). Ningún archivo de producto se modificó: la entrega es solo el
documento de investigación más este reporte.
