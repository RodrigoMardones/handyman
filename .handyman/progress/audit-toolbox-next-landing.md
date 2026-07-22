---
type: Doc
title: audit-toolbox-next-landing
updated: 2026-07-18
tags: [handyman/docs/current]
---

# Auditoria: landing de handyman toolBox en Next.js (feature toolbox_next_landing)

Registro de las auditorias que exige la feature 40 (tasteskill v2,
`design-taste-frontend/SKILL.md`) para `apps/web/app/page.tsx`. El Pre-Flight
Check completo (seccion 14 de la skill, una casilla por linea con su
justificacion) vive como bloque de comentario al tope de `page.tsx`; este
documento resume las dos auditorias que la feature pide explicitamente en el
repositorio: Section-Layout-Repetition y disciplina del hero. Ambas: PASS.

## Auditoria: Section-Layout-Repetition (seccion 4.7 y 9.C de la skill)

La pagina tiene 9 secciones (`grep -c "<section" apps/web/app/page.tsx` = 9,
por encima del minimo de 8). Cada una usa una familia de layout distinta; no
hay dos secciones que repitan la misma familia, muy por encima del minimo de
4 familias distintas que pide la aceptacion de la feature.

| # | Seccion | Familia de layout | Por que es distinta de las demas |
|---|---------|--------------------|-----------------------------------|
| 1 | Hero | Asymmetric Split Hero | Texto a la izquierda, foto a la derecha, sin centrar (DESIGN_VARIANCE 7 > 4 evita el sesgo centrado de la seccion 4.3). |
| 2 | Metrics | Franja de metricas dividida por hairlines | Fila unica, sin cards, separadores `border-left` (no `border-top`+`border-bottom` en cada fila). |
| 3 | Capabilities | Bento grid asimetrico | `grid-template-areas` con 1 celda grande 2x2, 4 celdas estandar y 1 banda de ancho completo; 6 items, 6 celdas, cero celdas vacias. |
| 4 | Manifesto | Cita editorial a ancho completo | Tipografia grande centrada, sin imagen ni card, la antitesis del bento anterior. |
| 5 | Pipeline | Riel de pasos conectados | 4 nodos con marcador circular hueco unidos por una linea, distinto de cualquier grid o card. |
| 6 | Security | Featured spec tiles 2x2 | Alternativa a tabla de specs (seccion 4.9): 4 tiles con numeral grande + una frase, no una lista con hairline por fila. |
| 7 | Architecture | Panel de codigo a una columna | `<pre><code>` con el arbol real del monorepo, columna centrada, sin grid. |
| 8 | Providers | Cards en scroll horizontal con snap | `overflow-x:auto` + `scroll-snap-type`, la alternativa de la seccion 4.9 para listas de mas de 4 items, en vez de una lista vertical. |
| 9 | CTA | Banda centrada con caja de comandos | Texto centrado + bloque de comandos reales, sin grid ni imagen. |

**Zigzag Alternation Cap:** solo el hero usa el patron imagen-junto-a-texto;
ninguna otra seccion lo repite, asi que el limite de 2 consecutivas nunca se
acerca a violarse.

**Bento cell count:** 6 capacidades reales (fleet view, ask, summary, draft,
providers, strangler migration) mapean a exactamente 6 areas del grid, sin
celdas vacias al medio ni al final.

Veredicto: **PASS**.

## Auditoria: disciplina del hero (seccion 4.7 de la skill)

| Regla | Medicion | Resultado |
|-------|----------|-----------|
| Headline maximo 2 lineas en desktop | "Your agent fleet, streamed live to the browser.", 8 palabras, ~47 caracteres, en una columna de `max-width: 37rem` a `clamp(2.1rem, 4.4vw, 3.1rem)` | PASS |
| Subtext maximo 20 palabras y 4 lineas | Exactamente 20 palabras contadas a mano ("handyman toolBox streams ... Local only, read only.") | PASS |
| CTA visible sin hacer scroll | Fila de CTAs (`.ctaRow`) queda dentro del bloque `.heroText`, sin `min-height` forzado a 100dvh que empuje contenido fuera de la vista | PASS |
| Padding superior del hero <= `pt-24` (6rem/96px) | `padding-top: clamp(2.5rem, 6vw, 5.5rem)`, techo real 5.5rem (88px) | PASS |
| Escala de fuente planeada junto a la imagen | Headline de 8 palabras con `text-6xl`/`text-7xl` evitado a proposito; se uso el rango `clamp(2.1rem,4.4vw,3.1rem)` recomendado para titulares de mas de 5 palabras | PASS |
| Stack maximo 4 elementos de texto | Exactamente 3: headline, subtext, una fila de CTAs (1 primario + 1 secundario). Sin eyebrow, sin brand strip, sin tagline bajo los CTAs, sin franja de trust logos dentro del hero | PASS |
| Sin "Used by" dentro del hero | La pagina no tiene franja de logos de clientes en absoluto (herramienta open source, sin logos inventados que violarian la seccion 9.D) | PASS |
| Sin version label / beta / invite-only | Ninguno presente | PASS |
| Sin decoration strip al fondo del hero | El hero termina en la fila de CTAs | PASS |
| Sin scroll cue | No hay flecha ni texto "scroll" | PASS |
| Viewport stability | El hero no usa `100vh`/`h-screen` ni `100dvh`; la altura sigue al contenido, asi que el bug de salto de Safari movil (seccion 3.E) no aplica | PASS |

Veredicto: **PASS**.

## Referencias

- Pre-Flight Check completo (62 casillas, todas PASS): comentario al tope de
  `apps/web/app/page.tsx`.
- Reporte de implementacion:
  [[../backlog/impl_toolbox_next_landing]].
- Skill fuente: `design-taste-frontend/SKILL.md` (secciones 4.7, 9.C, 14).
