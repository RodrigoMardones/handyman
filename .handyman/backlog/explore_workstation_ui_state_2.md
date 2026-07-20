---
type: Explore Report
tags: [handyman/backlog/explore]
---

# Mapa técnico del estado actual de la UI del workstation (segunda pasada UX/UI)

## Resumen

El workstation (`handyman/scripts/workstation.py`, 1326 líneas) es un panel web
localhost servido con la biblioteca estándar (`http.server.ThreadingHTTPServer`),
sin framework, sin build step y sin assets externos. La primera pasada UX/UI
(feature 76 propuesta + features 77–84 de ejecución, planes A–E) ya se ejecutó y
dejó el panel bastante ordenado: existe un sistema de **design tokens `--hw-*`**
único en `fleet.py`, una capa de formato `fmt.*`, routing por `location.hash` con
tres vistas (`#/fleet`, `#/harness/<name>`, `#/timeline`), nomenclatura de
acciones alineada al workflow, badges textuales semánticos, aviso de panel
obsoleto y un app shell (appbar/nav/footer). La segunda pasada NO parte de cero:
parte de un sistema ya definido pero con debilidades concretas de accesibilidad
(HTML semántico incompleto, contraste no auditado, foco/teclado en diálogo),
performance secundaria (todo el CSS+JS inline en cada `GET /`, sin caché) y de
madurez de diseño (escala tipográfica de solo 3 pasos, sin estados de foco en
tablas, densidad, responsive únicamente por `max-width`).

Todo el estilo y el marcado se generan como **strings de Python**: `_HTML_STYLE`
(tokens + base compartida) vive en `fleet.py`; `_PANEL_STYLE = _HTML_STYLE + "..."`
y `build_panel_html()` viven en `workstation.py`. El JS del panel es un f-string
gigante embebido en `build_panel_html`.

## Arquitectura actual del workstation

### Framework y servidor
- **Stdlib puro**: `from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer`.
  Sin Flask/FastAPI, sin dependencias. Bind duro a `127.0.0.1` (sin flag para
  ampliarlo). CLI con `argparse`; subcomando único `serve`
  (`--port` default 8765, `0` = efímero; `--refresh-seconds` default 7;
  `--verifier-timeout` default 300; `--handyman-root`).
- `make_handler()` hornea el HTML del panel UNA vez al arrancar (`panel =
  build_panel_html(token, refresh_seconds)`) y devuelve la clase `Handler` cerrada
  sobre esa config. Consecuencia de diseño: tras un upgrade del skill, un server
  vivo sigue sirviendo el panel viejo → de ahí el aviso "panel outdated" (F84).
- `server_version = "HandymanWorkstation/1.0"`. `log_message` silenciado (salida
  estable para tests).

### Rutas / endpoints (contrato HTTP)
GET:
- `GET /` → sirve `panel` (HTML autocontenido). `text/html; charset=utf-8`.
- `GET /api/state` → `build_state(hroot)` como JSON (documento único por refresh).
- Cualquier otra ruta GET → 404 JSON `{ok:false,error:"not found"}`.
  (Nota: `GET /favicon.ico` cae aquí — el favicon va inline como data-URI en el
  `<head>`, no como archivo servido.)

POST (todas exigen token `X-Workstation-Token`, `Content-Type: application/json`,
cuerpo ≤ 1 MiB, y `root` que resuelva a un `project_root` registrado):
- `/api/request-draft` → escribe `feature-request.md` (única ruta que escribe
  directamente un archivo, no vía feature.py). `{ok, path, overwrote}`.
- `/api/feature/add` → `feature.py add`. `{ok, message, id, snapshot}`.
- `/api/feature/block` → `feature.py block --reason`. `{ok, message, snapshot}`.
- `/api/feature/unblock` → `feature.py unblock`. `{ok, message, snapshot}`.
- `/api/verifier/run` → `fleet.run_verifier`. `{ok, verifier:{result, exit_code}}`.
- POST a `/` o `/api/state` → 405. Ruta POST desconocida → 404.

### Vistas (SPA por hash sobre un solo documento)
`route()` lee `location.hash`: `#/fleet` (default), `#/harness/<name>`,
`#/timeline`. `hashchange` re-renderiza desde `lastState` cacheado (no re-fetch).
Tres `<section>` (`view-fleet`, `view-harness`, `view-timeline`) se muestran/ocultan
con el atributo `hidden`.
- **Fleet** (`renderFleet`): tabla de 8 columnas (Project, Version, Drift,
  Pending, In progress, Done, Blocked, Session). El nombre enlaza a
  `#/harness/<name>`; badge `N signal(s)` marca atención. Agregado en `#aggregate`.
- **Harness detalle** (`renderHarness`): breadcrumb + pagetitle + identidad
  (versión+drift+root), luego **Actions** (agrupadas por etapa, state-first),
  **Status** (sesión + última cierre + salud), **Queue** (agrupada por status;
  done/blocked colapsados en `<details>`), **Timeline** propio.
- **Timeline** (`fillTimeline`): cierres cross-flota, agrupados por fecha
  (`tl-date` heading por día).

### Generación de HTML/CSS/JS y templating
- **Sin motor de plantillas**: `build_panel_html(token, refresh_seconds)` es un
  f-string gigante (líneas 334–990). El CSS se inyecta como
  `<style>{_PANEL_STYLE}</style>`; el JS como un `<script>` con `"use strict"`.
  Las llaves JS van escapadas `{{ }}` por ser f-string.
- **Render DOM-safe (gate W011)**: TODO el estado de harness llega por `fetch` y
  se pinta con `document.createElement` + `textContent` (helper `el(tag,text,attrs)`).
  El texto de archivos de harness nunca se convierte en markup. La única capa que
  humaniza strings es `fmt.*` (status sin guion bajo, sesión/agregado/timeline como
  frases con plantilla, fechas relativas con la absoluta en `title`).
- **Fleet estático** (`fleet.py build_fleet_html`): usa `html.escape` + f-strings
  (server-side, no DOM). Comparte `_HTML_STYLE` y `_FAVICON_LINK`.

### App shell
`<header class="appbar">` con `<h1>Handyman · Workstation <badge skill X></h1>` +
`#stale` (aviso obsoleto) + `#updated` (pulso vivo). `<p id="statusline"
aria-live="polite">`. `<nav>` con tabs Fleet/Timeline + checkbox pause. `<footer
class="meta">` con `#registry` (path + versión skill, debug). `<dialog id="dlg">`
con `<form id="dlgform">` para los formularios de intake.

### Nomenclatura de acciones (constantes JS `LABELS`/`TITLES`/`HELP`)
- `request` → "Draft request" (Intake — escribe feature-request.md)
- `add` → "Add pending feature" (Intake — feature.py add, gate verde auto)
- `block` → "Block" (transición pending/in_progress → blocked)
- `unblock` → "Unblock" (blocked → pending)
- `verify` → "Run verifier" (Verification — corre init.sh del destino)
Agrupadas por etapa en `stageActions()`: Intake / State / Verification. **State-first**:
una transición que los status vivos no pueden tomar no se pinta (ej. Unblock solo
aparece si hay features bloqueadas). Los formularios se abren con `HELP[kind]` de
una línea que explica el efecto y la distinción Draft-request vs Add.

### Contrato de interacción con el harness (mutación)
- `run_feature_py(root, *argv)` shell-out con array de argumentos a `feature.py`
  (`--root`, timeout 30s). El panel NUNCA escribe `feature_list.json`; solo
  `request-draft` escribe el `.md` directamente (bajo `MUTATION_LOCK`).
- `MUTATION_LOCK` (threading.Lock) serializa las escrituras del panel (feature.py
  reescribe el JSON entero; concurrencia last-writer-wins con sesiones de agente).
- `registered_root()` = allowlist: el registry es la lista de destinos de escritura.
- `ensure_gate()` añade el gate verde como último bullet de acceptance si falta.
- `VERIFIER_BUSY` (set + lock): el verifier corre FUERA del mutation lock; un
  segundo run sobre el mismo root → 409; `/api/state` reporta `verifier_busy`.
- `_feature_py_reply()`: exit 0 → 200 con snapshot fresco (`fresh_snapshot` re-lee
  para re-render sin esperar poll); "already exists"/"is not blocked"/"not found"
  → 409; resto → 500.

### Aviso de panel obsoleto (stale, F84)
`BAKED_VERSION = json.dumps(version)` horneada; `render()` compara con
`state.skill_version` y si difieren pinta badge `panel outdated — restart serve to
update` en `#stale`. No puede dispararse in-process (mismo binario hornea y
reporta); testeado estructuralmente.

### Detalle "declutter" (F82)
Actions renderiza ANTES que Queue. Grupos done/blocked colapsan a `<details>` con
conteo; in_progress/pending quedan visibles. Timeline por-harness con `omitProject`.
Helper `plural()` (evita "(s)" perezoso). Estado vacío único vía `emptyNode()`/`.empty`.

## Tokens y estilos actuales (valores exactos)

Definidos UNA vez en `fleet.py` `_HTML_STYLE`, `:root` (líneas 717–777). El panel
(`_PANEL_STYLE = _HTML_STYLE + "..."`) solo consume; el dark mode solo reasigna.

**Color light (`:root`)**
- `--hw-bg: #ffffff`
- `--hw-surface: #f2f4f7`
- `--hw-fg: #1a1a1a`
- `--hw-muted: #555555`
- `--hw-border: #d0d0d0`
- `--hw-accent: #0a5dc2`
- `--hw-ok: #1a7f37`
- `--hw-warn: #9a6700`
- `--hw-danger: #b00020`
- `--hw-backdrop: rgba(0, 0, 0, 0.35)`
- `color-scheme: light dark`

**Color dark (`@media (prefers-color-scheme: dark)`)**
- `--hw-bg: #16181d`
- `--hw-surface: #1f232b`
- `--hw-fg: #e6e6e6`
- `--hw-muted: #9aa0a6`
- `--hw-border: #3a3f47`
- `--hw-accent: #6cb2ff`
- `--hw-ok: #4ccf6a`
- `--hw-warn: #e3b341`
- `--hw-danger: #ff8a80`
- `--hw-backdrop: rgba(0, 0, 0, 0.55)`

**Espaciado**: `--hw-space-1: 0.25rem` · `-2: 0.5rem` · `-3: 1rem` · `-4: 2rem`.
**Tipografía**: `--hw-text-s: 0.85rem` · `-m: 0.95rem` · `-l: 1.3rem` (solo 3 pasos).
**Fuente**: `font-family: system-ui, sans-serif` (sin webfonts).
**Layout base**: `body { margin: var(--hw-space-4) auto; max-width: 72rem;
padding: 0 var(--hw-space-3); }`. `:focus-visible { outline: 2px solid
var(--hw-accent); outline-offset: 1px; }`. Bordes/radios: `border-radius: 3px`
(badges/botones/details), `4px` (dialog). Badges: `.badge` con borde + fondo
surface + `font-weight:600`; variantes `.badge-ok/warn/danger/muted` cambian solo
`color`.

**Favicon** (`_FAVICON`, `fleet.py`): PNG 16x16 data-URI base64 (cuadrado accent).
Se eligió PNG y no SVG para no arrastrar `xmlns` (contrato sin assets externos).
`_FAVICON_LINK = '<link rel="icon" href="data:image/png;base64,...">'`.

**Reglas panel-only** (`_PANEL_STYLE`, workstation.py 257–326): `h2` (uppercase,
letter-spacing 0.04em, muted), `#statusline`, `details`/`summary`, `ul`/`li`
(list-style none), `.pagetitle` (text-l, 700), `button` (hover border accent),
`.muted`, `dialog` (max-width 34rem, width 90%) + `::backdrop`, `dialog form`
(grid), labels (grid), `.formstatus` (danger; `.working` → muted), `.empty`
(italic muted), `header.appbar` (flex space-between), `footer`, `nav` (flex,
tab con `aria-current` → border-bottom accent), `th.num`, `.tl-date`, `.tl-item`,
`.stages`/`.stage` (grid/flex de acciones por etapa).

**Invariante testeado**: cada valor hex vive en una línea `--hw-` (grep
"sin hex fuera de tokens" sobre panel Y fleet html — test W15).

### Contexto de la primera pasada (docs + referencia)
`docs/analisis-ux-ui-workstation.md` (feature 76) diagnosticó el estado PRE-rediseño
("en términos de diseño y usabilidad es un desastre"): dos bloques de CSS con ~11
colores literales repetidos, 6 tamaños tipográficos ad hoc, ~10 espaciados sin
escala, sin identidad, estados semánticos sin codificación visual, vocabulario de
máquina en pantalla, 1 sola página-scroll con tabla de 11 columnas y 5 botones
siempre visibles. Definió Planes A–E (tokens/marca, contrato de interacción,
vistas por hash, nomenclatura por etapa, entrega en referencia+tests) — TODOS ya
ejecutados (features 77–84). `references/workstation.md` §"Panel Design Guidelines"
documenta hoy: tabla de tokens (nombre/rol/valor light-dark/porqué), contrato de
interacción, mapa de vistas y glosario de nomenclatura. **Trabajo futuro declarado
(doc §8, sigue pendiente)**: theming configurable/white-label, regresión visual con
capturas, i18n del panel, vistas multi-usuario/remotas, gráficas de throughput
(sparklines). El límite §4 sigue vigente: autocontenido, sin framework, DOM-safe,
etiquetas textuales nunca color-solo, ruta de escritura por feature.py, tests
deterministas sin browser.

## Contrato de interacción con el harness (endpoints/acciones que NO deben romperse)

Restricciones duras heredadas del modelo de seguridad y del harness — cualquier
rediseño debe conservarlas (son criterios de aceptación):

1. **HTTP shape**: `GET /` (HTML), `GET /api/state` (JSON con `harnesses[]`,
   `fleet`, `timeline`, `verifier_busy`, `skill_version`, `registry`,
   `registry_error`, `generated`); los 5 POST con sus cuerpos y códigos
   (200/400/403/409/413/500, 405 método erróneo). La forma de `/api/state` NO cambia.
2. **Seguridad**: bind 127.0.0.1, token `X-Workstation-Token` en todo POST,
   Host-header local (anti DNS-rebinding), `Content-Type: application/json`,
   cuerpo ≤ 1 MiB, `Cache-Control: no-store` en toda respuesta, subprocesos
   argv-only, registry como allowlist de escritura.
3. **Escritura**: mutaciones solo por `feature.py` (argv); `request-draft` escribe
   solo el `.md`; gate verde como último bullet; MUTATION_LOCK serializa.
4. **Render DOM-safe (W011)**: texto de harness solo por `textContent`/createElement.
5. **Accesibilidad mínima**: etiquetas textuales primarias, color secundario;
   `aria-live` en statusline; dark mode por `prefers-color-scheme`.
6. **Autocontenido**: una página por `GET /`, cero assets/CDN/build; tokens en
   `_HTML_STYLE` (compartidos con `moc --html`); favicon data-URI PNG.
7. **Nomenclatura**: labels de acción = vocabulario de `workflow.md`; endpoints y
   forma JSON NO renombran (los tests aciertan JSON y labels, no captions internos).

## Cobertura de tests

`tests/test_workstation.sh` (642 líneas, 21 casos W1–W21). Cada caso arranca su
propio server en `--port 0` bajo `HANDYMAN_ROOT` temporal, parsea URL+token del
stdout, y usa `curl` + assert por JSON/grep. Nunca toca el `$HOME/HANDYMAN` real.
macOS: paths canonicalizan (`/var`→`/private/var`), por eso se aserta por campos
JSON, no strings de path.

- **W1**: `serve` bindea 127.0.0.1 efímero, imprime URL+token, `GET /` = 200 con
  "Handyman Workstation" y el token embebido.
- **W2**: `/api/state` = documento consistente (2 harnesses, conteos agregados,
  skill_version, timeline con 'alpha', `verifier_busy == []`).
- **W3**: features por-harness presentes; feature_list corrupto degrada a
  `error` + `features:[]` sin tumbar el resto.
- **W4**: ruta desconocida 404 JSON, POST /api/state 405, `Cache-Control: no-store`.
- **W5**: `feature/add` crea pending con gate verde como ÚLTIMO bullet, id correcto.
- **W6**: no duplica un acceptance que ya nombra el gate (run_tests.sh).
- **W7**: nombre duplicado → 409 sin efectos, count intacto.
- **W8**: slug malo → 400; root no registrado → 400 y destino intacto.
- **W9**: token ausente/erróneo → 403, sin efectos.
- **W10**: block fija blocked+reason; unblock vuelve a pending y borra reason;
  unblock de no-bloqueada → 409.
- **W11**: request-draft escribe markdown CORE, rechaza overwrite (409), `force` gana.
- **W12/W13/W14**: verifier green (exit 0), red (exit real 7), skipped (sin init.sh);
  segundo run concurrente = 409 mientras los GET siguen respondiendo (verifier_busy).
- **W15** (tokens, F77): panel y fleet html comparten `--hw-`, favicon data-URI PNG,
  wordmark "Handyman · Workstation"/"· Fleet", "skill X"; **cero hex fuera de `--hw-`**.
- **W18** (F80): las tres rutas hash presentes (`#/fleet`, `#/timeline`,
  `#/harness/`), `<nav>`, views harness/timeline; overview YA NO tiene columnas
  Verifier ni Actions; ciclo de vida draft absent→pristine→filled.
- **W21** (F84): `const BAKED_VERSION`, comparación `!== BAKED_VERSION`, mensaje
  "panel outdated", slot `id="stale"`.
- **W20** (F83): appbar, footer con registry, `aria-current`, `<th class="num">`,
  `tl-date`, `"updated "`, `"num muted"`.
- **W19** (F82): pagetitle, `createElement("details")`, helper `plural`, sin "(s)"
  perezoso, `omitProject`, `list-style: none`, y Actions renderiza ANTES que Queue.
- **W17** (F79): capa `fmt`, sin dump `k=v`, sin slug crudo, `pattern="[a-z0-9_]+"`,
  "lowercase slug", `"working..."`, prefijos `"ok: "`/`"error: "`, help Draft-vs-Add,
  nodo `dlghelp`.
- **W16** (F78): labels "Draft request"/"Add pending feature"/"Run verifier";
  titles con etapa+artefacto; "blocked -> pending".

`tests/test_docs.py::test_workstation_reference`: `references/workstation.md` debe
contener "Panel Design Guidelines", "Design tokens", "--hw-", "Interaction
contract", "Action Nomenclature", "#/harness/", "textContent", "state-first"; y
`references/README.md` debe listar workstation.md. `test_w011_passive_framing`
gobierna la prosa resource-as-subject en `references/`.

**Qué NO cubren los tests** (margen de rediseño libre): son 100% estructurales
(grep/JSON) — no hay browser automation, ni assert de layout real, contraste,
navegación por teclado, foco, ni tamaño de payload. Un rediseño de CSS/marcado que
mantenga las cadenas y estructuras que estos greps buscan pasa sin tocar tests.

## Debilidades detectadas

### Accesibilidad
- **HTML semántico incompleto**: las vistas son `<section>` sin `<h1>/<h2>`
  jerárquico claro por vista (h2 se genera por JS en detalle; fleet/timeline usan
  h2 estático). No hay landmarks `<main>`, `role`s ni `<h1>` por vista SPA (el h1
  global no cambia al navegar por hash → lectores de pantalla no anuncian cambio
  de vista). El cambio de ruta no mueve foco ni emite anuncio (solo statusline
  `aria-live` para acciones, no para navegación).
- **Diálogo**: `<dialog>.showModal()` da focus-trap y Esc nativos (bien), pero no
  hay `aria-labelledby` que ate el título `<h3>` al dialog, ni gestión explícita de
  retorno de foco al botón disparador. El help por campo usa `<small>` sin
  `aria-describedby` que lo asocie al input.
- **Tabla**: sin `<caption>`, sin `scope="col"` en `<th>`, sin `aria-sort`. Filas
  no son navegables por teclado (el enlace del nombre sí).
- **Contraste no auditado formalmente**: `--hw-muted #555555` sobre `#ffffff` ~7:1
  (ok), pero muted-sobre-surface, warn `#9a6700`, y los badges (texto de color
  sobre `--hw-surface`) no tienen verificación WCAG documentada; en dark,
  `--hw-warn #e3b341` y accent sobre surface conviene revisar. `--hw-text-s
  0.85rem` para meta/badges/botones puede quedar chico.
- **Estados de foco**: hay `:focus-visible` global (outline accent) — bien — pero
  los botones en hover solo cambian border, sin indicación de foco diferenciada
  más allá del outline; tabs (`nav a`) dependen del outline global.
- **`document.hidden` pausa el refresh** (bien para batería) pero no hay región
  live que anuncie "datos actualizados" a AT en refrescos automáticos.

### Performance
- **Payload monolítico sin caché**: `GET /` reenvía TODO el CSS + JS inline en cada
  carga con `Cache-Control: no-store` (correcto por seguridad para el estado, pero
  el shell estático —CSS/JS— podría cachearse; hoy no se separa). El HTML del panel
  ronda ~650 líneas de fuente → decenas de KB por carga.
- **Sin minificación ni compresión**: no hay gzip/deflate en las respuestas
  (`_send` no negocia `Accept-Encoding`).
- **Polling fijo cada 7s** de `/api/state`: reconstruye el documento completo
  (snapshots de toda la flota, timeline, señales) en cada tick; no hay ETag/304 ni
  entrega incremental. Escala linealmente con nº de harnesses.
- **Re-render completo**: cada refresh hace `replaceChildren()` de tablas/listas
  enteras (no diffing) — aceptable para flotas pequeñas, costoso si crece.
- **Script bloqueante**: el `<script>` va al final del `<body>` (bien), sin
  `defer`; es inline, así que no bloquea red pero sí parseo.

### Diseño (madurez visual)
- **Escala tipográfica de solo 3 pasos** (s/m/l: 0.85/0.95/1.3rem): m y s casi
  indistinguibles (0.10rem); falta un paso xl para el pagetitle vs h1, y jerarquía
  entre body y meta es débil. La densidad general es alta y plana.
- **Badges monótonos**: todos comparten fondo `--hw-surface` y solo cambian color
  de texto; sin variación de peso/tono de fondo por severidad → jerarquía visual
  limitada (warn vs danger se distinguen solo por color de texto).
- **Tabla densa**: 8 columnas sin zebra striping, sin hover de fila, sin estados de
  foco de fila; los ceros van `.num muted` (bien) pero la lectura sigue siendo
  tabular plana.
- **Sin identidad más allá del wordmark**: favicon es un cuadrado accent; no hay
  logotipo, ni sistema de iconografía (todo es texto), ni ilustración de estados
  vacíos.
- **Responsive mínimo**: solo `max-width: 72rem` + `padding`; la tabla de 8
  columnas no colapsa en móvil (overflow horizontal); `dialog width:90%` ok. No hay
  media queries de layout salvo dark mode.
- **Espaciado de 4 pasos** puede quedar corto para secciones grandes (salto 1rem→2rem).

### Best practices
- **CSS + JS como strings de Python**: imposible lint/format/minify con herramientas
  frontend; el JS es un f-string con `{{}}` escapados (frágil, propenso a errores de
  escape). No hay separación de responsabilidades (marcado/estilo/lógica en un `.py`).
- **Sin `<meta name="description">` ni theme-color**; SEO irrelevante (herramienta
  local, no indexable, sin robots), pero `<meta name="theme-color">` y
  `color-scheme` en meta ayudarían a la barra del navegador en dark.
- **Estado en variables globales JS** (`lastState`, `verifierResults`, `dlgKind`,
  `dlgRoot`) — aceptable para el tamaño, pero sin encapsulación.
- **Sin manejo de errores de red visible más allá del statusline** ("server
  unreachable — retrying"); no hay backoff, reintenta al ritmo del interval.
- **El panel se hornea una vez**: cambios de config en caliente imposibles (por
  diseño), mitigado por el aviso stale.
- **Duplicación de lógica de presentación** entre `build_fleet_html` (server-side,
  escape) y `renderFleet` (client-side, DOM): drift labels, session line, drift
  class se implementan dos veces en dos lenguajes.

## Oportunidades

1. **Extraer el shell estático (CSS/JS) a assets cacheables** servidos por el mismo
   handler con `ETag`/`Cache-Control` (manteniendo `no-store` solo en `/api/state`).
   Reduce payload por carga y desbloquea lint/minify frontend. El doc de la 1ª pasa
   ya lo anticipa como "salida lazy" si el archivo crece (riesgo §9).
2. **Cerrar los gaps de accesibilidad** (bajo riesgo, sin tocar contrato): `<main>`
   landmark, `<h1>` por vista o `aria-live` de cambio de ruta + foco; `<dialog
   aria-labelledby>`, `aria-describedby` para help por campo; `scope="col"` +
   `<caption>` en tablas; auditoría WCAG documentada de los tokens (light y dark) —
   encaja con el skill `accessibility`/`web-quality-audit`.
3. **Enriquecer el sistema de tokens** sin romper W15: añadir pasos tipográficos
   (xs/xl), tokens de fondo de badge por severidad, radios/sombras nombrados, y un
   set de spacing más granular — todo sigue viviendo en `_HTML_STYLE :root`.
4. **Responsive real**: media queries que colapsen la tabla de 8 columnas a tarjetas
   en viewport angosto; el detalle por-harness ya es card-friendly.
5. **Unificar la capa de presentación fleet↔panel**: hoy drift/session se pintan dos
   veces (Python escape vs JS DOM). Consolidar reduce drift de estilo (riesgo §9 del doc).
6. **Compresión gzip** en `_send` cuando el cliente lo acepta.
7. **Trabajo futuro ya declarado y aún abierto** (doc §8): theming/white-label
   (tokens ya son el prerequisito), sparklines de throughput sobre `metrics.py`,
   i18n. Regresión visual con capturas sigue vetada por la restricción de tests sin
   browser — mantener greps estructurales.

### Archivos clave
- `handyman/scripts/workstation.py` — server, panel HTML/JS, `_PANEL_STYLE`, rutas,
  mutaciones, stale, detail declutter.
- `handyman/scripts/fleet.py` (líneas 713–848) — `_HTML_STYLE` (tokens),
  `_FAVICON`/`_FAVICON_LINK`, `build_fleet_html` (moc --html estático).
- `handyman/references/workstation.md` — guidelines, glosario, tabla de tokens,
  endpoints, seguridad.
- `docs/analisis-ux-ui-workstation.md` — investigación 1ª pasada (planes A–E,
  restricciones §4, futuro §8, riesgos §9).
- `tests/test_workstation.sh` — 21 casos W1–W21.
- `tests/test_docs.py` — `test_workstation_reference`, `test_w011_passive_framing`.
