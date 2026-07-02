# 🎛️ Investigación: UX/UI del workstation — marca, sistema de diseño y vistas por acción

> Documento de investigación y plan de trabajo. Responde a una pregunta concreta:
> **¿cómo convertir el panel del workstation (`scripts/workstation.py serve`) en una
> experiencia de usuario ordenada — con lineamientos de marca, un sistema UX/UI
> definido y separación de vistas/nomenclatura por acción — sin romper su modelo de
> seguridad ni su filosofía autocontenida?** Cada hallazgo se apoya en evidencia del
> repositorio. El scope del plan es `handyman/scripts/`, `handyman/references/` y
> `tests/`; `SKILL.md` no se toca (presupuesto de tokens, precedente features 36–37,
> 65 y 75).

---

## 1. El objetivo

El workstation (features 71–75) entregó la capa funcional completa: servidor local
seguro, `/api/state`, intake por `feature.py`, verifier bajo demanda. Pero la capa
de presentación se construyó por acumulación (el CSS del fleet + parches del panel)
y la petición lo diagnostica sin rodeos: *"en términos de diseño y usabilidad es un
desastre"*. Los tres dolores declarados:

1. **Sin lineamientos de marca**: ni colores ordenados, ni formatos, ni estilos.
2. **Sin UX/UI definido** bajo ningún lineamiento.
3. **Sin separación de vistas ni nomenclatura por acción disponible**: la
   información no está organizada en términos de calidad para el usuario.

La pregunta de fondo es de organización de la información y de contrato visual, no
de funcionalidad: los endpoints y la ruta de escritura determinista ya existen y no
se tocan.

## 2. Evidencia: el estado actual de la capa de presentación

### 2.1 "Sistema de diseño" real: dos bloques de CSS con literales sueltos

Todo el estilo vive en dos strings de Python encadenados:

| Fuente | Qué define | Síntoma |
|---|---|---|
| `fleet.py` `_HTML_STYLE` (l.713–732) | base compartida: body, tabla, `.meta`, `.drift`, `.error`, dark mode | 8 hex hard-coded (`#ffffff`, `#1a1a1a`, `#555`, `#d0d0d0`, `#16181d`, `#e6e6e6`, `#9aa0a6`, `#3a3f47`), cada uno repetido en su bloque dark |
| `workstation.py` `_PANEL_STYLE` (l.239–266) | añadidos del panel: `#statusline`, `details`, botones, `dialog`, `.formstatus`, `.muted` | suma `#777`, `#b00020`, `#ff8a80`, `rgba(0,0,0,0.35)` y **re-declara** los mismos grises del fleet (`#d0d0d0`, `#16181d`, `#e6e6e6`, `#3a3f47`, `#9aa0a6`) |

- **Cero variables CSS**: no existe un solo `--token`; cambiar "el gris de borde"
  exige cazar `#d0d0d0` en dos archivos y sus bloques dark.
- **Escala tipográfica ad hoc**: 0.82 / 0.85 / 0.88 / 0.9 / 1.05 / 1.4 rem — seis
  tamaños sin regla que los relacione.
- **Espaciado ad hoc**: ~10 valores (0.1, 0.15, 0.25, 0.3, 0.45, 0.55, 0.6, 0.7,
  1, 1.4, 1.6, 2 rem) sin escala.
- **Sin identidad**: título `<h1>Handyman Workstation</h1>` plano, sin favicon
  (`GET /favicon.ico` cae al 404 JSON de `do_GET`, l.665–676), sin wordmark ni
  versión visible del skill, sin relación visual declarada con la página estática
  del fleet (`moc --html`) más allá del import de CSS.
- **Estados semánticos sin codificación visual**: `BEHIND`/`OK` (drift), las
  señales de salud (`STALE_WIP`, `INVARIANT`, …) y los cuatro status se pintan
  como texto plano del mismo peso y color que todo lo demás. La etiqueta textual
  es una fortaleza (accesibilidad, nunca color-solo) pero hoy es la *única*
  codificación: no hay badge, peso ni color secundario que jerarquice.

### 2.2 UX sin contrato: feedback, formularios y strings de máquina

- **Vocabulario de máquina en pantalla**: los status se muestran como slugs crudos
  (`in_progress` con guion bajo, columnas de la tabla l.290–292 y colas
  `"[" + f.status + "]"` l.556); el agregado de flota es un dump estilo CLI
  `fleet: harnesses=2 unreadable=0 pending=…` (l.376–380); la sesión es un blob
  `feature (role, updated fecha)` (l.331–336); el timeline pega campos con
  espacios `fecha  proyecto  feature (feature N)` (l.589–591); las señales van
  `SIGLA: detalle` (l.577).
- **Feedback plano**: un único `#statusline` de una línea para el resultado de
  cualquier acción (`done: …`), error del formulario en una línea roja
  (`.formstatus`); solo el botón Verify tiene estado ocupado (`running...`);
  Block no pide confirmación pese a ser una transición de estado con razón.
- **Estados vacíos/carga inconsistentes**: `connecting…` (meta), fila
  `no harnesses registered`, opción `(no eligible features)`, ítem
  `no closures yet` — cuatro patrones distintos para el mismo concepto.
- **Formularios crípticos**: etiquetas con el formato incrustado entre paréntesis
  (`name (slug: a-z 0-9 _)`, l.460), sin validación en línea (el error del slug
  llega tras el round-trip al servidor), y nada explica la diferencia semántica
  entre las dos acciones de intake (§2.3).

### 2.3 Arquitectura de la información: una sola página, acciones sin mapa

- **Cuatro secciones apiladas** en un solo scroll: `Fleet` / `Queues` / `Health` /
  `Timeline` (l.288–304). La información de UN harness queda repartida entre las
  cuatro: su fila (Fleet), su `<details>` (Queues), su `<ul>` (Health) y sus
  líneas del Timeline. No existe vista por harness, ni navegación, ni estado en
  la URL (imposible enlazar "el detalle de phily-app").
- **Tabla de 11 columnas** (Project, Version, Drift, Pending, In progress, Done,
  Blocked, Session, Last closure, Verifier, Actions): mezcla identidad, carga de
  trabajo, actividad, operación y acciones en una sola fila.
- **Cinco botones por fila, siempre**: `Request / Add / Block / Unblock / Verify`
  (l.386–394) se pintan para todo harness sin mirar su estado; con cero features
  bloqueadas, Unblock abre un diálogo con `(no eligible features)`. La UI es
  acción-primero en lugar de estado-primero.
- **Nomenclatura desalineada del workflow**: el harness define 7 etapas con
  vocabulario estable (`workflow.md` — stability, intake, start, implementation,
  verification, review, closure) y una máquina de estados de 4 status, pero el
  panel inventa el suyo: "Request" y "Add" son ambos intake (uno escribe el
  borrador `feature-request.md`, el otro inyecta la entrada `pending` vía
  `feature.py add`) y nada en pantalla lo explica; "Verify" ejecuta la etapa que
  el workflow llama stability/verification. El usuario lee una jerga en la
  documentación y otra en el panel.

## 3. El gap, dolor por dolor

| Dolor de la petición | Gap técnico concreto |
|---|---|
| 1. Marca: colores, formatos, estilos | no hay tokens de diseño: ~11 valores de color × ~18 ocurrencias literales en 2 archivos, 6 tamaños tipográficos y ~10 espaciados sin escala, sin identidad (favicon/wordmark/versión), estados semánticos sin codificación visual |
| 2. UX/UI sin lineamiento | no hay contrato de interacción: feedback de una línea, sin busy/confirm consistentes, 4 patrones de estado vacío, strings de máquina (slugs, dumps `k=v`) renderizados a humanos, formularios sin validación en línea ni ayuda semántica |
| 3. Vistas y nomenclatura por acción | no hay arquitectura de información: 1 página-scroll con la información de cada harness fragmentada en 4 secciones, tabla de 11 columnas, 5 acciones siempre visibles sin elegibilidad, vocabulario del panel divorciado de las 7 etapas del workflow |

## 4. Restricciones: lo que el rediseño no puede romper

Heredadas del modelo de seguridad (`references/workstation.md`) y de la filosofía
del harness; funcionan como checklist de aceptación para cualquier plan:

- **Autocontenido**: una sola página servida por `GET /`, cero assets externos,
  cero CDN, cero build step (funciona offline; espejo del contrato del
  `moc --html`).
- **Render DOM-safe**: texto de archivos de harness solo vía
  `textContent`/`createElement` (gate W011 — el markup almacenado jamás se
  ejecuta). Cualquier capa de formato humaniza *strings*, nunca inyecta HTML.
- **Etiquetas textuales, nunca color-solo** (accesibilidad); dark mode vía
  `prefers-color-scheme`; `aria-live` en el statusline se conserva.
- **Sin framework JS ni dependencias**: vanilla + fetch + setInterval; el
  presupuesto de complejidad lo fija la escalera de ponytail (§5).
- **La ruta de escritura no cambia**: mutaciones solo vía `feature.py` argv,
  registro como allowlist, token de sesión, bind 127.0.0.1.
- **Tests deterministas** al estilo de la suite: servidor efímero (`--port 0`),
  `HANDYMAN_ROOT` temporal, aserciones estructurales (grep/JSON), sin capturas de
  pantalla ni browser automation.
- **Prosa resource-as-subject** en `references/` (gate W011,
  `test_w011_passive_framing`).

## 5. Literatura consultada

- **handyman** (`SKILL.md`, `references/workflow.md`, `references/workstation.md`):
  las 7 etapas y la máquina de 4 estados son el vocabulario canónico que la UI
  debe hablar (§2.3); el modelo de seguridad del panel es la restricción dura
  (§4); disk-is-source-of-truth implica que el panel formatea estado vivo, nunca
  lo duplica.
- **skill-creator**: disclosure progresiva — la guía pesada (lineamientos, tabla
  de tokens, glosario de nomenclatura) vive en `references/`, no en `SKILL.md`;
  los contratos se verifican con tests deterministas baratos; "explica el porqué"
  aplica también a los lineamientos (cada token/regla lleva su razón, no un MUST).
- **ponytail** (decisión de seniority): la escalera — plataforma nativa antes que
  dependencia. Variables CSS nativas antes que un design system externo; routing
  por `location.hash` antes que un router; `<dialog>`, `<details>`, `system-ui` se
  conservan. YAGNI explícito: nada de theming configurable, i18n ni multi-usuario
  en esta entrega. Y su límite: la accesibilidad nunca se simplifica.
- **mcp-builder**: naming accionable y descubrible — verbos orientados a la acción
  con prefijo/agrupación consistente y descripciones que digan el efecto (qué
  artefacto produce cada acción), errores accionables que guíen el siguiente paso.
  Es el patrón para renombrar y agrupar los botones del panel (§6, Plan D).

## 6. Decisiones resueltas (criterio: usabilidad + escalera ponytail)

1. **Tokens CSS nativos como lineamiento de marca, definidos una sola vez.** Las
   variables (`--hw-*`) se declaran en el `:root` de `_HTML_STYLE` (fleet.py, la
   base que ambas páginas ya comparten); `_PANEL_STYLE` solo consume. El dark mode
   pasa de duplicar reglas a re-asignar variables. Un framework CSS externo
   violaría §4 (autocontenido) y la escalera (rung 4: la plataforma lo cubre).
2. **El vocabulario de la UI es el del workflow.** No se inventa una tercera
   jerga: las acciones se nombran y agrupan por etapa (`intake` / `estado` /
   `verificación`) y los status se humanizan en una capa única de formato con las
   mismas cuatro palabras del contrato. La documentación y el panel quedan
   hablando el mismo idioma.
3. **Vistas por dominio de acción con routing nativo por hash.** Overview de
   flota (leer), detalle por harness (actuar), timeline (auditar): tres intents
   de usuario distintos → tres vistas, `location.hash` + un `render(route,
   state)` — cero dependencias, back/forward y enlaces profundos gratis.
4. **Estado-primero en las acciones**: solo se ofrecen las transiciones elegibles
   según el estado real (espejo de la máquina de estados que `feature.py` ya
   fuerza); lo no elegible no se pinta, en lugar de fallar después.

## 7. Plan de trabajo (A–E)

**Plan A — Tokens de diseño y marca mínima (fundación).** Extraer todos los
literales de color/espaciado/tipografía de `_HTML_STYLE` + `_PANEL_STYLE` a un
bloque único `:root` con variables nombradas por rol, no por valor: superficies
(`--hw-bg`, `--hw-surface`), texto (`--hw-fg`, `--hw-muted`), bordes
(`--hw-border`), semánticos (`--hw-ok`, `--hw-warn`, `--hw-danger`, `--hw-accent`)
y escalas (`--hw-space-1..4`, `--hw-text-s/m/l`, sustituyendo los 6 tamaños y ~10
espaciados por 3+4 pasos). Dark mode = re-asignación de variables en un solo
bloque `@media`. Identidad mínima: favicon SVG inline (data URI, autocontenido),
header compartido `Handyman · Workstation` / `Handyman · Fleet` con la versión del
skill que `/api/state` ya expone (`skill_version`). Badges textuales para estados
semánticos (status, drift, señales): mismo texto de hoy + fondo/peso desde tokens
(el texto sigue siendo la codificación primaria). Test determinista nuevo en
`tests/test_workstation.sh`: la página servida contiene `--hw-` y **ningún hex
literal fuera del bloque `:root`/`@media`** (grep estructural, sin screenshots).

**Plan B — Contrato de interacción (sistema UX).** Una capa de formato única en el
JS del panel (`fmt.*`): status humanizados (`in_progress` → `in progress`, misma
palabra del contrato sin slug), sesión/timeline/agregado como frases con plantilla
en vez de dumps `k=v`, fechas relativas ("hace 3 días") con la absoluta en
`title`. Contrato de feedback: todo botón que dispara un POST pasa a
busy/disabled hasta la respuesta (patrón que Verify ya implementa, generalizado);
resultado en el statusline con prefijo textual `ok:` / `error:`; los cuatro
estados vacíos convergen a un único patrón `empty(texto)`. Formularios: ayuda
por campo fuera del label (qué produce la acción y dónde queda el artefacto),
validación de slug en línea (`pattern` + mensaje antes del round-trip), y la
distinción Request/Add explicada en el propio diálogo. Todo sigue rindiendo por
`textContent` (§4).

**Plan C — Vistas por acción (arquitectura de la información).** Routing por hash
con tres vistas: `#/fleet` (overview: tabla adelgazada a identidad + carga +
sesión, ~7 columnas, sin botonera), `#/harness/<name>` (detalle: TODO lo de un
harness en un lugar — cola por status, señales de salud, timeline propio, borrador
`feature-request.md` presente/ausente, y las acciones contextualizadas por estado:
las transiciones no elegibles no se pintan), `#/timeline` (auditoría cross-flota).
Navegación: barra superior con las tres vistas + breadcrumb en detalle; el nombre
de proyecto en el overview enlaza al detalle (`href="#/harness/<name>"` — enlaces
profundos y back/forward nativos). `render()` se descompone en `renderRoute(route,
state)` sin framework; el refresh sigue siendo el mismo fetch de `/api/state`.
Tests: navegar por hash es estado del DOM, así que la suite verifica lo
determinista — el HTML servido contiene las tres rutas y los `href` de detalle;
`/api/state` no cambia de forma.

**Plan D — Nomenclatura por acción alineada al workflow.** Renombrar y agrupar la
botonera con el vocabulario de las etapas (`workflow.md`) y el efecto declarado
(mcp-builder): `Request` → **Draft request** (etapa intake; escribe
`feature-request.md`), `Add` → **Add pending feature** (etapa intake; entra por
`feature.py add` con gate verde automático), `Block`/`Unblock` se agrupan como
transiciones de estado (máquina de `feature.py`), `Verify` → **Run verifier**
(etapa verification; corre el `init.sh` del destino). En el detalle (Plan C) las
acciones se presentan agrupadas por etapa con subtítulo de una línea que nombra el
artefacto que producen. Glosario UI↔workflow↔artefacto como tabla en
`references/workstation.md`, espejo de la tabla de etapas de `workflow.md`.

**Plan E — Entrega: lineamientos en la referencia + tests.** Ampliar
`references/workstation.md` con la sección **Panel design guidelines**: tabla de
tokens (nombre, rol, valor light/dark y el porqué), contrato de interacción
(busy/feedback/empty/validación), mapa de vistas y el glosario de nomenclatura del
Plan D — prosa resource-as-subject (gate W011). Nuevos casos deterministas en
`tests/test_workstation.sh` (tokens sin hex fuera de `:root`, rutas presentes,
labels de acciones, `skill_version` en el header) cableados en la suite existente;
`references/README.md` ya cataloga `workstation.md` (sin alta nueva). `SKILL.md`
no se toca.

**Orden de ejecución sugerido**: A (fundación de tokens, todo lo demás la
consume) → D (renombrar es barato y desbloquea el glosario) → B (contrato de
interacción) → C (vistas, el cambio más grande, ya con tokens/nombres/feedback
estables) → E transversal, cerrando con la referencia y los tests de regresión.
Cada plan cabe como una feature independiente con gate verde, espejo de las
entregas 61–65 y 71–75.

## 8. Trabajo futuro (explícitamente fuera de esta entrega)

- **Theming configurable / white-label** (paleta por proyecto u operador): YAGNI
  hasta que exista más de un operador; los tokens del Plan A son el único
  prerequisito real.
- **Regresión visual con capturas** (playwright/percy): rompe la restricción de
  tests sin browser automation; los greps estructurales cubren el contrato.
- **i18n del panel**: el harness entero opera en inglés; se decide junto, no en
  la UI primero.
- **Vistas multi-usuario / remotas**: el modelo bind-localhost + token asume un
  operador; cambiarlo es una decisión de seguridad, no de UX.
- **Gráficas de throughput** (sparklines del timeline): azúcar sobre
  `metrics.py`; esperar a que el detalle por harness (Plan C) genere la demanda.

## 9. Riesgos

- **El string HTML crece dentro de `workstation.py`** (hoy 963 líneas): mitigado —
  los planes A–B *reducen* duplicación (tokens, capa `fmt`, helpers de estado
  vacío); si C empuja el archivo por encima del umbral de legibilidad, la salida
  lazy es extraer el panel a un asset servido por el mismo handler, decisión que
  se toma en la feature C, no antes.
- **Deriva de estilo entre fleet estático y panel vivo**: mitigado — los tokens
  viven solo en `_HTML_STYLE` (fuente única que ambos ya comparten) y el test de
  "sin hex fuera de `:root`" aplica a las dos páginas.
- **Renombrar acciones rompe memoria muscular de tests/operador**: bajo — los
  endpoints y el API no cambian de nombre, solo labels y agrupación; los tests
  actuales asiertan JSON, no captions.
- **Scope creep hacia web app**: el límite es explícito (§4 sin framework, §8
  multi-usuario fuera); cualquier necesidad que no quepa en vanilla+hash se
  documenta como blocker antes de improvisar.

---

*Generado por la feature 76 (`new_proposal_ux_ui_handyman_workstation`). Los
Planes A–E quedan listos para ejecutarse como features independientes, espejo de
las series 61–65 (fleet) y 71–75 (workstation).*
