# 🔩 Investigación: UX/UI del workstation, segunda pasada — identidad de taller, WCAG 2.2 y shell cacheable

> Documento de investigación y plan de trabajo. Responde a una pregunta concreta:
> **¿cómo llevar el panel del workstation — ya ordenado por la primera pasada
> (features 77–84: tokens `--hw-*`, capa `fmt`, tres vistas por hash, nomenclatura
> por etapa) — a una identidad de marca propia, un pase completo de accesibilidad
> WCAG 2.2, tema manual claro/oscuro y una capa de performance adaptada a
> localhost, sin romper su modelo de seguridad ni su filosofía autocontenida?**
> Cada hallazgo se apoya en el mapa de evidencia
> `.handyman/backlog/explore_workstation_ui_state_2.md` y en el código. El scope
> del plan es `handyman/scripts/`, `handyman/references/` y `tests/`; `SKILL.md`
> no se toca (presupuesto de tokens, precedente features 36–37, 65, 75 y 76–84).

---

## 1. El objetivo

La primera pasada (`docs/analisis-ux-ui-workstation.md`, feature 76; ejecución
77–84) resolvió los tres dolores originales: hoy existe un sistema de tokens
único en `fleet.py`, una capa de formato `fmt.*`, routing por `location.hash`
con tres vistas y acciones nombradas con el vocabulario del workflow. Esta
segunda pasada **no parte de cero**: parte de un sistema definido con
debilidades concretas y medibles:

1. **Sin identidad propia**: la paleta actual es un azul-genérico funcional
   (`--hw-accent #0a5dc2`) sin carácter; el operador pide una marca Handyman
   propia — "taller digital": grafito, acero y ámbar.
2. **Accesibilidad incompleta**: HTML semántico sin landmarks ni `<h1>` por
   vista SPA, diálogo sin `aria-labelledby`, tablas sin `scope`/`caption`,
   contraste nunca auditado formalmente, cero `prefers-reduced-motion`.
3. **Sin tema manual**: el dark mode depende exclusivamente de
   `prefers-color-scheme`; no hay toggle claro/oscuro/sistema persistido.
4. **Performance de fuerza bruta**: cada `GET /` reenvía ~30 KB de CSS+JS
   inline con `Cache-Control: no-store`, sin compresión; el polling re-renderiza
   la página completa aunque `/api/state` no haya cambiado.
5. **Madurez visual a medias**: escala tipográfica de 3 pasos casi
   indistinguibles, densidad uniforme en las tres vistas cuando sus intents
   (operar / actuar / auditar) piden densidades distintas.

La pregunta de fondo es de refinamiento sobre una base sana, no de rediseño:
los endpoints, la ruta de escritura y la arquitectura de vistas no se tocan.

## 2. Evidencia: el estado actual, debilidad por debilidad

Estado verificado contra `explore_workstation_ui_state_2.md` y el código en la
rama actual (`workstation.py` 1326 líneas, `fleet.py` 969 líneas,
`tests/test_workstation.sh` 641 líneas, casos W1–W21).

### 2.1 Marca: tokens sanos, paleta sin carácter y escala plana

| Fuente | Qué define | Síntoma |
|---|---|---|
| `fleet.py` `:root` (l.718–737) | 10 tokens de color light, 4 espaciados, 3 tamaños | paleta azul-genérica (`--hw-accent #0a5dc2`), sin token `info`, sin radios/sombras nombrados |
| `fleet.py` `@media dark` (l.738–751) | reasignación dark | única vía de theming: no hay toggle manual |
| `fleet.py` `_HTML_STYLE` tipografía (l.734–736) | `--hw-text-s/m/l`: 0.85 / 0.95 / 1.3 rem | s y m separados por 0.10 rem (~1.6 px): jerarquía casi imperceptible; falta paso xl para título vs sección |
| `fleet.py` `.badge*` (l.767–774) | badges textuales | todas las variantes comparten fondo `--hw-surface` y solo cambian color de texto: warn vs danger se distinguen únicamente por el matiz |
| `fleet.py` `_FAVICON` (l.782–784) | PNG 16×16 data-URI | cuadrado del accent azul: la identidad hereda el color genérico |

- **Contraste jamás calculado**: la tabla de tokens de
  `references/workstation.md` documenta rol y porqué, pero ningún par
  texto-sobre-superficie tiene su ratio WCAG declarado. `--hw-warn #9a6700`
  sobre `--hw-surface #f2f4f7` y los badges en dark quedaron "a ojo".
- **Bordes de controles bajo el umbral no-textual**: `--hw-border` da 1.55:1
  (light) y 1.75:1 (dark) contra el fondo — los botones (`workstation.py`
  l.272–276) delimitan su área solo con ese borde, por debajo del 3:1 que pide
  WCAG 1.4.11 para componentes de UI.

### 2.2 Accesibilidad: lo que el marcado aún no dice

| Gap | Evidencia | Criterio WCAG 2.2 |
|---|---|---|
| Sin `<main>` ni `<h1>` por vista: las tres `<section>` (l.357–377) cuelgan de un único `<h1>` de appbar (l.345) que no cambia al navegar | `grep '<main' workstation.py` → 0 resultados | 1.3.1, 2.4.1 (landmarks), 2.4.6 |
| El cambio de ruta no mueve foco ni se anuncia: `hashchange` solo re-renderiza (l.438–439); el `aria-live` del statusline (l.349) cubre acciones, no navegación | lectores de pantalla no perciben el "cambio de página" | 2.4.3, 4.1.3 |
| `<dialog>` sin `aria-labelledby`/`aria-describedby`: el `<h3>` y el help se insertan sin id ni asociación (l.689–690); no hay retorno de foco al botón disparador tras cerrar (l.732 `showModal()`) | `grep aria-labelledby` → 0 | 1.3.1, 2.4.3 |
| Ayuda por campo en `<small>` sin `aria-describedby` que la ate al input | formularios del diálogo | 3.3.2 |
| Tablas sin `<caption>` ni `scope="col"` (fleet estático l.839–841; panel l.360–363) | `grep 'scope='` → 0 | 1.3.1 |
| Cero `prefers-reduced-motion` en ambos bloques de estilo | `grep prefers-reduced-motion` → 0 | 2.3.3 |
| Contraste no auditado (§2.1) y `--hw-text-s` 0.85 rem para badges/botones al límite de legibilidad | tabla de tokens sin ratios | 1.4.3, 1.4.11 |

Lo que sí está sano y se conserva: `:focus-visible` global con outline accent
(`fleet.py` l.758), etiquetas textuales nunca color-solo, focus-trap y Esc
nativos del `<dialog>`, `aria-current` en tabs, `lang="en"`, charset y viewport
correctos.

### 2.3 Performance: todo inline, todo no-store, todo re-render

- **Payload monolítico**: `GET /` sirve 30 588 bytes medidos (9 207 gzip) de
  HTML+CSS+JS horneados una vez (`make_handler`, l.999) y reenviados completos
  en cada carga, porque `_send` fija `Cache-Control: no-store` en **toda**
  respuesta (l.1009–1015) — correcto para el estado y el token, innecesario
  para el shell estático.
- **Sin compresión**: `_send` no negocia `Accept-Encoding`; el gzip stdlib
  reduciría el shell ~70 % (medido arriba).
- **Polling ciego**: `refresh()` (l.971–983) hace fetch de `/api/state` cada 7 s
  y re-renderiza el documento entero (`replaceChildren` en l.507, 688, 861,
  923) aunque nada haya cambiado; no hay ETag/304 en el API. Pausa con
  `document.hidden` (l.972) — eso se conserva.
- **JS como f-string**: todo el script vive dentro del f-string de
  `build_panel_html` con llaves escapadas `{{ }}` — frágil para editar y opaco
  para cualquier herramienta frontend.

### 2.4 Densidad: tres intents, una sola densidad

Las tres vistas comparten exactamente la misma densidad tabular plana:
`#/fleet` (operar: correcto que sea denso), `#/harness/<name>` (actuar: hoy es
una pila de `h2` + listas con el mismo interlineado que la tabla,
`renderHarness` l.859) y `#/timeline` (auditar). El espaciado tope es
`--hw-space-4: 2 rem`, corto para separar secciones grandes; no hay tokens de
radio ni superficie de tarjeta.

## 3. El gap, dolor por dolor

| Dolor de la petición | Gap técnico concreto |
|---|---|
| 1. Identidad Handyman "taller digital" | paleta azul-genérica sin carácter, favicon del accent viejo, contraste sin auditar, badges monótonos, borde de controles bajo 3:1 |
| 2. Pase WCAG 2.2 completo | sin landmarks/`<main>`/`<h1>` por vista, diálogo y campos sin asociaciones aria, tablas sin `scope`/`caption`, sin `prefers-reduced-motion`, foco sin gestión en navegación SPA |
| 3. Tema manual | solo `prefers-color-scheme`; sin toggle light/dark/system, sin persistencia, sin estrategia anti-flash |
| 4. Performance localhost | 30 KB inline con `no-store` en todo, sin gzip, polling que re-renderiza estado idéntico, sin presupuesto de payload |
| 5. Densidad por vista | escala tipográfica de 3 pasos planos, espaciado tope 2 rem, detalle sin tarjetas ni agrupación visual por etapa |

## 4. Restricciones: lo que esta pasada no puede romper

Heredadas del §4 de la primera pasada, del modelo de seguridad
(`references/workstation.md`) y del mapa del explorador; funcionan como
checklist de aceptación para cualquier plan:

- **Autocontenido**: cero assets externos, cero CDN, cero build step. La
  decisión operativa 4 (§6) **refina** este límite para el panel vivo: el shell
  puede dividirse en rutas de asset servidas **por el mismo handler** (mismo
  origen, mismo binario) — externo sigue significando "fuera del servidor". La
  página estática `moc --html` sigue siendo un archivo único sin excepciones.
- **Render DOM-safe** (gate W011): texto de archivos de harness solo vía
  `textContent`/`createElement`; ninguna capa nueva (tema, tarjetas) inyecta
  markup desde datos.
- **La forma de `/api/state` no cambia** y los 5 POST conservan cuerpos y
  códigos; las mutaciones siguen solo vía `feature.py` argv, registry como
  allowlist, token de sesión, bind 127.0.0.1, Host-check, cuerpo ≤ 1 MiB.
- **`no-store` se conserva donde protege**: `/api/state` (estado vivo) y
  `GET /` (contiene el token de sesión) nunca se vuelven cacheables.
- **Sin framework JS ni dependencias**: vanilla + fetch + setInterval; tema y
  caché se resuelven con plataforma nativa (localStorage, ETag, gzip stdlib).
- **Etiquetas textuales, nunca color-solo**; el `aria-live` del statusline se
  conserva; el ámbar es una capa secundaria, jamás la única codificación.
- **Tests deterministas** (grep/JSON/curl sobre servidor efímero `--port 0`),
  sin browser automation ni capturas.
- **Prosa resource-as-subject** en `references/` (gate W011,
  `test_w011_passive_framing`); `SKILL.md` no se toca.

## 5. Literatura consultada

- **accessibility** (WCAG 2.2): el checklist rector del Plan H — umbrales de
  contraste 4.5:1 texto / 3:1 no-textual (1.4.3, 1.4.11), focus-visible con
  contraste propio, target size 24×24 (2.5.8, nueva en 2.2), foco no obstruido
  (2.4.11), `prefers-reduced-motion`, landmarks y jerarquía de encabezados,
  patrón `.visually-hidden` para captions, y la regla de oro que el panel ya
  practica: elementos nativos antes que ARIA.
- **performance**: presupuesto de recursos como contrato explícito, estrategia
  de `Cache-Control` por tipo de recurso (HTML no-cache, assets revalidables),
  compresión gzip/brotli para texto, y batch de lecturas/escrituras DOM. Lo
  dependiente de red pública (CDN, preconnect, HTTP/2) se descarta: un solo
  origen en 127.0.0.1.
- **core-web-vitals**: leído como marco adaptado, no como métrica de ranking.
  LCP en localhost es trivial (TTFB ~0); lo trasladable es **INP** (mantener
  handlers cortos: saltarse el re-render cuando el estado no cambió es
  exactamente reducir trabajo por interacción/tick) y **CLS** (el refresh que
  reemplaza tablas enteras no debe mover el layout: mismas dimensiones
  reservadas, sin saltos al pintar badges).
- **web-quality-audit**: el método de este documento — hallazgos por severidad
  con evidencia file:line y fix concreto (§2–§3), y el orden de prioridad
  accesibilidad > performance > pulido.
- **best-practices**: HTML semántico (`<main>`, jerarquía), charset/viewport
  (ya correctos), `textContent` sobre `innerHTML` (ya contrato W011),
  `<meta name="theme-color">` para la barra del navegador en cada tema, y la
  advertencia de listeners con cleanup (el panel vive una sola página: n/a).
- **frontend-design**: la identidad sale del mundo del sujeto — un *handyman*
  trabaja en un taller: grafito de plancha pavonada, acero de herramienta,
  ámbar de lámpara de trabajo. Un solo gesto de firma (el ámbar en wordmark,
  foco y nav) y disciplina en todo lo demás; tipografía como jerarquía real,
  no decoración; copy activo que ya quedó resuelto en la primera pasada.
- **vercel-react-best-practices**: consultada y **mayormente N/A por diseño**
  — el panel no usa React ni framework alguno y ese es un límite duro (§4), de
  modo que las 8 categorías de reglas de hooks/RSC/bundle no aplican. Se
  extraen sus principios framework-agnósticos: `client-localstorage-schema`
  (clave de localStorage versionada y validada — adoptada por el toggle de
  tema), `js-batch-dom-css` (cambios de tema vía un solo atributo
  `data-theme`, nunca estilos por elemento) y la disciplina general de "no
  re-renderizar lo que no cambió" que el Plan J implementa con ETag/304.
- **ponytail** (escalera de seniority — gobierna cada decisión técnica):
  plataforma nativa antes que dependencia. Tokens CSS + `color-mix` para los
  tintes en vez de duplicar hex; `localStorage` + `data-theme` en vez de un
  theme manager; `gzip` e `ETag` de la stdlib en vez de un servidor nuevo;
  `system-ui` con cero payload de fuentes. Y su límite explícito: la
  accesibilidad nunca se simplifica.
- **handyman** (`references/workstation.md`, `references/workflow.md`): el
  vocabulario canónico (7 etapas, 4 status, glosario de acciones) que las
  tarjetas del detalle reutilizan como agrupación visual, y el modelo de
  seguridad que fija el §4.
- La skill **seo** se consideró y se excluyó: herramienta de operador en
  localhost, sin superficie de búsqueda que optimizar.

## 6. Decisiones resueltas (con el operador; requisitos fijos)

### 6.1 Marca: identidad Handyman "taller digital"

Carácter: superficies de **grafito**, neutros de **acero**, acento **ámbar** de
lámpara de taller; semánticos con temperatura (cálidos = atención, fríos =
información). Se **evolucionan** los tokens `--hw-*` existentes — misma
arquitectura, nuevos valores y cinco tokens nuevos (`--hw-info`,
`--hw-border-strong`, `--hw-text-xs/xl`, `--hw-space-5`, `--hw-radius-s/m`).
El favicon (cuadrado del accent) se regenera en ámbar.

**Paleta propuesta (hex exactos, light y dark):**

| Token | Rol | Light | Dark |
|---|---|---|---|
| `--hw-bg` | fondo de página | `#F7F8FA` | `#16181D` |
| `--hw-surface` | superficies elevadas (tarjetas, diálogo, badges) | `#ECEEF2` | `#1E222A` |
| `--hw-fg` | texto | `#1B1E24` | `#E7E9EC` |
| `--hw-muted` | texto secundario | `#50565F` | `#9AA3AF` |
| `--hw-border` | reglas decorativas (separadores de fila) | `#C4CAD3` | `#3B424C` |
| `--hw-border-strong` | **nuevo** — borde de controles (botones, inputs) | `#6F7885` | `#727D8C` |
| `--hw-accent` | identidad: enlaces, foco, nav, wordmark, favicon | `#8A5300` | `#E8A33D` |
| `--hw-ok` | semántico verde | `#156C2C` | `#57C46F` |
| `--hw-warn` | semántico ámbar-ocre (cálido) | `#7A5900` | `#E0B94F` |
| `--hw-danger` | semántico rojo (cálido) | `#B3261E` | `#F2857D` |
| `--hw-info` | **nuevo** — semántico azul acero (frío) | `#2A5DA8` | `#82AEE8` |
| `--hw-backdrop` | fondo del diálogo | `rgba(22,24,29,0.45)` | `rgba(0,0,0,0.55)` |

Los badges ganan **fondo teñido por severidad** sin tokens extra:
`background: color-mix(in srgb, var(--hw-ok) 15%, var(--hw-bg))` (ídem
warn/danger/info/muted) — nativo, un valor por regla, y el test "sin hex fuera
de `--hw-`" sigue válido.

**Auditoría de contraste WCAG (calculada con la fórmula de luminancia relativa
de WCAG 2.x, script determinista; criterio AA: 4.5:1 texto normal, 3:1
componentes de UI):**

| Par texto → superficie | Light | Dark | Criterio | Pasa |
|---|---|---|---|---|
| `fg` sobre `bg` | 15.71 | 14.60 | ≥ 4.5 | ✓ |
| `fg` sobre `surface` | 14.37 | 13.10 | ≥ 4.5 | ✓ |
| `muted` sobre `bg` | 6.96 | 6.96 | ≥ 4.5 | ✓ |
| `muted` sobre `surface` | 6.37 | 6.25 | ≥ 4.5 | ✓ |
| `accent` sobre `bg` (enlaces) | 5.96 | 8.23 | ≥ 4.5 | ✓ |
| `accent` sobre `surface` | 5.45 | 7.39 | ≥ 4.5 | ✓ |
| `ok` sobre `surface` / sobre su tinte 15 % | 5.63 / 4.93 | 7.23 / 6.15 | ≥ 4.5 | ✓ |
| `warn` sobre `surface` / tinte | 5.55 / 4.89 | 8.52 / 7.04 | ≥ 4.5 | ✓ |
| `danger` sobre `surface` / tinte | 5.63 / 4.80 | 6.40 / 5.61 | ≥ 4.5 | ✓ |
| `info` sobre `surface` / tinte | 5.60 / 4.93 | 6.96 / 5.97 | ≥ 4.5 | ✓ |
| `border-strong` vs `bg` (no-textual, 1.4.11) | 4.20 | 4.25 | ≥ 3.0 | ✓ |
| anillo de foco `accent` vs `bg` (no-textual) | 5.96 | 8.23 | ≥ 3.0 | ✓ |

El peor par de toda la paleta es `danger` sobre su tinte en light (4.80:1),
holgado sobre el mínimo AA. El tinte 15 % está incluido en la auditoría porque
`color-mix in srgb` es interpolación lineal determinista: el color efectivo es
calculable y queda calculado. `--hw-border` decorativo queda deliberadamente
bajo 3:1 (1.55/1.75): separa filas, no delimita controles — para eso nace
`--hw-border-strong`.

Nota de diseño asumida: `--hw-accent` y `--hw-warn` comparten familia térmica
(ámbar). Se resuelve por contexto y forma, no por matiz: warn vive únicamente
dentro de `.badge` con texto + fondo teñido; accent vive en enlaces, foco, nav
y wordmark, nunca en badges. El panel jamás codifica solo-color (§4), así que
la vecindad cromática no elimina información.

### 6.2 Tipografía: `system-ui`, cero payload, escala de 5 pasos

Se mantiene `font-family: system-ui, sans-serif` (ningún webfont: presupuesto
de fuentes = 0 bytes, coherente con autocontenido). El hallazgo del explorador
— 3 pasos con s/m separados por 0.10 rem — se corrige con una escala modular de
**5 pasos**, base 1 rem, ascensos ×1.25/×1.5 y descensos ×0.875/×0.75, todos en
fracciones limpias de rem (saltos ≥ 2 px, siempre perceptibles):

| Token | Valor | px | Uso |
|---|---|---|---|
| `--hw-text-xs` | **nuevo** 0.75 rem | 12 | eyebrows (los `h2` uppercase actuales, `.tl-date`) |
| `--hw-text-s` | 0.875 rem | 14 | meta, badges, botones, statusline (sube de 13.6 px: responde al "puede quedar chico") |
| `--hw-text-m` | 1 rem | 16 | cuerpo, celdas, formularios (sube de 15.2 px al default del navegador) |
| `--hw-text-l` | 1.25 rem | 20 | títulos de sección y pagetitle del detalle |
| `--hw-text-xl` | **nuevo** 1.5 rem | 24 | `<h1>` de vista / wordmark |

Cinco pasos y no más: el panel tiene exactamente cinco niveles de jerarquía
real (página, sección, cuerpo, meta, eyebrow). Espaciado: se añade
`--hw-space-5: 3rem` (separación de tarjetas en el detalle) y radios nombrados
`--hw-radius-s: 3px` / `--hw-radius-m: 6px` (badges/botones vs tarjetas/diálogo),
reemplazando los literales `3px`/`4px` actuales.

### 6.3 Densidad híbrida por vista

- **`#/fleet`** se queda **denso y operacional**: la tabla de 8 columnas es el
  formato correcto para escanear una flota; gana solo hover de fila y ceros
  atenuados que ya tiene.
- **`#/harness/<name>`** se vuelve **aireado**: tarjetas (`.card`: surface +
  border + radius-m + padding space-3) **agrupadas por etapa del workflow** —
  Intake (estado del draft + Draft request/Add), Estado (sesión, salud,
  Block/Unblock, cola por status), Verification (Run verifier + último
  resultado), Closure (último cierre + timeline propio) — separadas por
  `--hw-space-5`. La agrupación reutiliza el vocabulario de `workflow.md`: la
  vista de actuar queda ordenada por el mismo mapa mental que la documentación.
- **`#/timeline`** queda **orientado a auditoría**: encabezados por fecha (ya
  existen, `.tl-date`) + timestamps en `tabular-nums`; denso pero cronológico.

### 6.4 Tema manual light/dark/system

Toggle de tres estados persistido en `localStorage` (clave versionada
`hw-theme:1`, valores válidos solo `light`/`dark` — cualquier otro valor se
ignora y cae a system), **en capa sobre** `prefers-color-scheme`:

```
:root { /* tokens light */ }
:root[data-theme="dark"] { /* tokens dark */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* tokens dark */ }
}
```

El bloque dark se define **una sola vez como string de Python** e interpola en
ambos selectores (fuente única, sin duplicación mantenida a mano).
**Anti-flash**: un script inline de 3 líneas al inicio del `<head>`, antes del
`<style>`, lee la clave y fija `document.documentElement.dataset.theme` antes
del primer paint. **DOM-safe**: el script solo compara contra la whitelist y
asigna un atributo `data-*`; nunca interpreta el valor almacenado como markup.
El control es un `<select>` nativo en el nav (system/light/dark) que escribe la
clave y el atributo. Dos `<meta name="theme-color">` con atributo `media`
alinean la barra del navegador. La página estática del fleet hereda los
selectores `[data-theme]` gratis por compartir `_HTML_STYLE`, pero no lleva
toggle (fuera de alcance, §8).

### 6.5 Performance adaptada a localhost

- **Shell cacheable**: el CSS y el JS del panel salen del HTML hacia
  `/assets/panel.css` y `/assets/panel.js`, servidos **por el mismo handler**
  con `ETag` fuerte (sha-256 del contenido, horneado al arrancar) y
  `Cache-Control: no-cache` (revalidación barata: 304 en cada recarga, cero
  riesgo de shell obsoleto tras reiniciar el server post-upgrade — coherente
  con el aviso stale de F84). `GET /` queda en ~3–5 KB (config + token + tema
  inline) y **conserva `no-store`** porque embebe el token. Beneficio lateral:
  el JS deja de ser f-string con `{{ }}` escapadas — pasa a string plano.
- **Compresión**: `_send` negocia `Accept-Encoding` y aplica `gzip` stdlib a
  respuestas de texto > 1 KiB, con `Vary: Accept-Encoding` (el shell de 30 KB
  medía 9 KB gzip; `/api/state` escala con la flota).
- **Polling inteligente**: `/api/state` gana un `ETag` calculado sobre el
  documento **sin el campo volátil `generated`** (la forma de la respuesta no
  cambia: el cuerpo sigue completo). El cliente envía `If-None-Match`; con 304
  no hay payload ni re-render — el tick pasa de "reconstruir 4 vistas" a una
  comparación de header. `no-store` se mantiene (la revalidación es manual en
  el fetch, no del caché del navegador).
- **Presupuesto de payload** como contrato testeado: `GET /` ≤ 12 KiB,
  `panel.css` + `panel.js` ≤ 64 KiB sin comprimir, verificado con `wc -c` en
  la suite (margen ~2× sobre lo medido hoy, para que el test señale
  crecimiento anómalo sin volverse ruido).

### 6.6 Alcance excluido (fijado con el operador)

Rediseño dedicado de la página estática `moc --html` (los tokens compartidos le
llegan gratis), theming/white-label, i18n, sparklines y regresión visual con
capturas quedan explícitamente en §8.

## 7. Plan de trabajo (F–K)

La numeración continúa la serie A–E de la primera pasada. Cada plan es **una
feature independiente** con gate `./init.sh` verde, sus archivos y el test
determinista que la sella.

**Plan F — Paleta "taller digital" + escala tipográfica y de espaciado
(tokens v2).** Cambia: los valores de `:root`/`@media` en `fleet.py`
`_HTML_STYLE` (l.718–751) a la paleta de §6.1; alta de `--hw-info`,
`--hw-border-strong`, `--hw-text-xs/xl`, `--hw-space-5`, `--hw-radius-s/m`;
badges con fondo `color-mix` por severidad; botones/inputs pasan a
`--hw-border-strong`; los literales `3px`/`4px` de radio migran a tokens;
favicon regenerado en ámbar (`_FAVICON`, l.782); consumo de los pasos nuevos en
`_PANEL_STYLE` (`workstation.py` l.257–326: h2 → xs, pagetitle → l, h1 → xl).
Archivos: `handyman/scripts/fleet.py`, `handyman/scripts/workstation.py`,
`handyman/references/workstation.md` (tabla de tokens con los ratios
calculados). Tests: W15 se amplía — ambos páginas contienen `--hw-info` y
`--hw-text-xl`, cero hex fuera de líneas `--hw-`, cero `border-radius` con
literal; `test_docs.py::test_workstation_reference` exige la columna de
contraste en la tabla de tokens.

**Plan G — Tema manual light/dark/system sin flash.** Cambia: `_HTML_STYLE`
emite el bloque dark desde un único string Python bajo los dos selectores de
§6.4; `build_panel_html` añade el script inline anti-flash al inicio del
`<head>` (antes del `<style>`), el `<select id="theme">` en el nav con
persistencia en `localStorage` (`hw-theme:1`, whitelist) y los dos
`<meta name="theme-color">`. Archivos: `fleet.py`, `workstation.py`,
`references/workstation.md` (contrato del tema). Tests nuevos en
`test_workstation.sh`: la página servida contiene `[data-theme="dark"]` y el
`@media` original, la clave `hw-theme:1`, y el script de tema aparece **antes**
del primer `<style>` (grep posicional); la página del fleet estático conserva
los selectores `[data-theme]` (herencia verificada).

**Plan H — Pase WCAG 2.2 sobre el marcado y el foco.** Cambia:
`build_panel_html` envuelve las tres `<section>` en `<main>`; el `<h1>` de
appbar pasa a `<p class="wordmark">` (mismo estilo vía token xl) y cada vista
gana su `<h1>` propio (Fleet / nombre del harness / Timeline) con
`tabindex="-1"`, foco movido y `document.title` actualizado en cada
`hashchange`; `<dialog>` gana `aria-labelledby`/`aria-describedby` atados al
`<h3>` y al `.dlghelp` (l.689–690) y retorno de foco al botón disparador al
cerrar; cada input asocia su ayuda con `aria-describedby` y marca
`aria-invalid` en error; tablas ganan `<caption class="visually-hidden">` y
`th scope="col"` (panel l.360–363 y fleet estático l.839–841); utilidad
`.visually-hidden` y bloque `prefers-reduced-motion` en `_HTML_STYLE`; botones
con `min-height` ≥ 24 px (2.5.8). Archivos: `workstation.py`, `fleet.py`.
Tests: greps por `<main`, `scope="col"`, `<caption`, `aria-labelledby`,
`aria-describedby`, `prefers-reduced-motion`, `visually-hidden`,
`tabindex="-1"` en ambas páginas servidas.

**Plan I — Shell cacheable + compresión.** Cambia: el CSS y el JS del panel se
extraen a strings servidos en `GET /assets/panel.css` y `GET /assets/panel.js`
por el mismo `Handler` (`do_GET`, l.1028–1039) con `ETag` sha-256 horneado en
`make_handler` y `Cache-Control: no-cache`; `_send` (l.1009) gana la rama gzip
con `Vary: Accept-Encoding`; `GET /` queda reducido a shell mínimo con token,
config y script de tema inline, aún `no-store`. Archivos: `workstation.py`,
`references/workstation.md` (endpoints y contrato de caché). Tests: curl al
asset → 200 con `ETag` y sin `no-store`; segundo curl con `If-None-Match` →
304; curl con `Accept-Encoding: gzip` → `Content-Encoding: gzip` y el cuerpo
descomprimido idéntico; `GET /` sigue conteniendo el token y `no-store`;
`/api/state` intacto (W2–W4 verdes).

**Plan J — Polling inteligente + presupuesto de payload.** Cambia:
`/api/state` calcula `ETag` sobre el JSON sin `generated` y responde 304 ante
`If-None-Match` coincidente (forma del 200 intacta); `refresh()` (l.971)
conserva el ETag y omite render en 304; presupuesto de payload (§6.5) como
caso de suite con `wc -c`. Archivos: `workstation.py`. Tests: dos GET
consecutivos sin cambios → segundo 304; tras `feature/add` → 200 con ETag
nuevo (el estado real invalida); `verifier_busy` altera el ETag; caps de bytes
sobre `GET /` y los dos assets.

**Plan K — Densidad híbrida: detalle en tarjetas por etapa + entrega en la
referencia.** Cambia: `renderHarness` (l.859) agrupa su contenido en `.card`
por etapa del workflow (§6.3) con `--hw-space-5` y `--hw-radius-m`; `#/fleet`
gana hover de fila; `#/timeline` fija `tabular-nums`; la sección **Panel Design
Guidelines** de `references/workstation.md` se actualiza con densidad por
vista, contrato de tema y contrato de caché (prosa resource-as-subject, gate
W011). Archivos: `workstation.py`, `references/workstation.md`. Tests: grep
`class="card"` (o `"card"` en el JS servido) y `--hw-space-5` consumido; los
nombres de etapa como agrupadores; W18/W19 (rutas, orden Actions-antes-que-
Queue, `plural`, `omitProject`) siguen verdes sin edición;
`test_workstation_reference` exige "Density" y "Theme".

**Orden de ejecución sugerido**: **F → G → H → I → J → K**. F es la fundación
(todos consumen los tokens v2); G toca los mismos bloques `:root` que F y
completa la arquitectura de theming mientras el contexto está fresco; H es
solo-marcado y no depende del transporte; I y J son la capa de transporte y
comparten el helper de ETag (J reutiliza lo que I introduce); K va último por
ser el mayor cambio visual — aterriza sobre tokens, tema, aria y captions ya
estables, y toca `renderHarness`, que H ya habrá reestructurado. Cada plan cabe
como una feature con gate verde, espejo de las series 61–65, 71–75 y 77–84.

## 8. Trabajo futuro (explícitamente fuera de esta entrega)

- **Rediseño dedicado de la página estática del fleet** (`moc --html`): recibe
  paleta, tipografía, captions y reduced-motion gratis por compartir
  `_HTML_STYLE`; una pasada propia (tarjetas, tema con toggle) espera a que
  alguien la use más que el panel vivo.
- **Theming configurable / white-label**: los tokens v2 y el mecanismo
  `data-theme` son el prerequisito ya cumplido; YAGNI hasta que exista más de
  un operador.
- **i18n del panel**: el harness entero opera en inglés; se decide junto, no
  en la UI primero.
- **Sparklines de throughput** sobre `metrics.py`: azúcar; esperar a que las
  tarjetas del detalle (Plan K) generen la demanda.
- **Regresión visual con capturas** (playwright/percy): sigue vetada por la
  restricción de tests sin browser automation; la auditoría de contraste
  calculada (§6.1) cubre el contrato cromático de forma determinista.

## 9. Riesgos

- **El grep de W15 ("cero hex fuera de `--hw-`") frente a `color-mix` y los
  selectores de tema**: bajo — los tintes referencian variables, no hex, y los
  bloques `[data-theme]` siguen siendo líneas `--hw-`; el test se amplía en F/G
  en la misma feature que introduce cada cambio, nunca después.
- **Vecindad accent/warn en la familia ámbar**: asumida y documentada (§6.1);
  mitigada porque el panel nunca codifica solo-color y ambos viven en
  contextos disjuntos (enlaces/foco vs badges). Si en uso real confunde, el
  ajuste es un solo token.
- **El toggle de tema y la página estática divergen**: mitigado — los
  selectores viven en `_HTML_STYLE` (fuente única); la estática simplemente no
  ejerce el atributo. El riesgo real sería duplicar el bloque dark a mano: por
  eso G lo interpola desde un único string Python.
- **La extracción del shell (Plan I) amplía la superficie HTTP**: dos rutas GET
  nuevas sin token — aceptable porque sirven bytes estáticos horneados sin
  estado ni secretos (el token queda solo en `GET /`, que conserva
  `no-store`); el Host-check existente las cubre igual que al resto.
- **Presupuesto de payload como test frágil**: mitigado con margen ~2× sobre lo
  medido y caps por archivo, no por byte exacto; su función es detectar
  crecimiento anómalo, no congelar el tamaño.
- **`workstation.py` sigue creciendo** (hoy 1326 líneas): el Plan I lo
  *reduce* al convertir el f-string gigante en strings planos separados; si el
  archivo supera el umbral de legibilidad, la salida lazy ya prevista es mover
  los strings de assets a constantes módulo-nivel — decisión dentro de la
  feature I, no antes.
- **Re-render y CLS en el refresh**: el skip por 304 (Plan J) elimina la
  mayoría de los repaints; para los reales, las tarjetas reservan dimensiones
  con la misma estructura entre ticks (sin inserciones por encima del
  viewport), regla heredada de core-web-vitals.

---

*Generado por la feature 85 (`new_proposal_ux_ui_handyman_workstation_2`). Los
Planes F–K quedan listos para ejecutarse como features independientes tras la
aprobación de este documento, espejo de las series 61–65 (fleet), 71–75
(workstation) y 77–84 (primera pasada UX/UI).*
