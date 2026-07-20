---
type: Explore Report
feature: okf_memoria_alignment
status: explored
role: explorer
updated: 2026-07-19
tags: [handyman/role/explorer, handyman/topic/okf]
---

# Explore Report: alinear la memoria .handyman con OKF v0.1

Investigado el 2026-07-19 leyendo la spec real (SPEC.md del repo
GoogleCloudPlatform/knowledge-catalog) y el estado vivo de `.handyman/`
(343 archivos .md excluyendo `.upgrade-backups/`).

## Veredicto

**SI vale la pena, y el costo es bajo: `.handyman` ya es ~90% un bundle OKF.
Falta exactamente un campo (`type:`) y dos ajustes al generador de index.md.**

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿`.handyman` es hoy un bundle OKF conformante? | **No**, por un solo criterio MUST: ningún .md tiene `type:` en el frontmatter, y 14 .md no tienen frontmatter alguno | `grep -rlE '^\s*type:' .handyman --include='*.md'` → 0 hits; sin frontmatter: `docs/architecture.md`, `docs/conventions.md`, `docs/business.md`, `docs/verification.md`, `docs/current/handoff-2026-07-19*.md`, 6 planes en `docs/sprints/`, `request.template.md`, `feature-request.md` |
| ¿Qué tan lejos está del resto de la spec? | Muy cerca: estructura = directorios + .md, frontmatter YAML parseable en los 329 restantes, `index.md` ya existe, `tags` ya es lista YAML | SPEC.md: conformancia = (1) frontmatter parseable, (2) `type` no vacío, (3) archivos reservados con su estructura |
| ¿Los wikilinks rompen conformancia? | **No la rompen** (consumers MUST tolerar links rotos y keys desconocidas), pero el grafo no se forma para un consumer OKF: solo ve links markdown | SPEC.md: dos formas de link, absoluta bundle-relative (`/...`) y relativa estándar; "No wiki-link syntax is specified" |
| ¿Cambio mínimo? | Agregar `type:` (derivable del prefijo de filename/`role`), dar frontmatter a los 14 huérfanos, y que `index_md.ts` emita links markdown sin frontmatter | Ver sección "Cambio mínimo conformante" |
| ¿Qué se gana? | Interop gratis con el visualizador HTML de Google (Cytoscape.js, subcomando `visualize`), ingestión en Knowledge Catalog, y cualquier consumer OKF futuro lee la memoria sin adaptador | README.md del repo okf: reference agent + visualizer + 3 bundles ejemplo |

## Mapeo campo a campo (.handyman vs OKF)

| Aspecto | .handyman hoy | OKF v0.1 | Choque |
|---|---|---|---|
| Identidad del concepto | 1 archivo .md, path como identidad (`backlog/explore_npm_pack_64.md`) | 1 concepto = 1 .md, path = identidad | **Ninguno** — ya coincide |
| Campo obligatorio | `feature`, `status`, `role`, `updated`, `tags` (backlog); `sprint`, `status`, `closed_at` (sprints) | Solo `type` es MUST; valores libres, no registrados centralmente | **Falta `type`**. `role: explorer` + prefijo de filename ya lo determinan: `type: Explore Report` / `Implementation Note` / `Review` / `Sprint` / `Session Log` |
| Campos extra | `feature`, `role`, `status`, `updated`... | Extensiones permitidas; consumers MUST preservar y tolerar keys desconocidas | **Ninguno** — todo lo actual sobrevive intacto |
| `tags` | `tags: [handyman/role/explorer, ...]` lista YAML estilo Obsidian | `tags` convencional, lista YAML | **Ninguno** — formato idéntico |
| Links | Wikilinks `[[backlog/impl_x]]` (index.md tiene cientos; ~25 en backlog+sprints); también links markdown (`[feature_list.json](feature_list.json)`) | Links markdown relativos o bundle-absolutos (`/...`); wikilinks no especificados | **Parcial** — no rompe conformancia pero el grafo OKF solo se forma con links markdown. index.md es generado (`handyman/src/index_md.ts`), así que convertirlo es un cambio en un solo emisor |
| `index.md` | Existe en la raíz, **con frontmatter** (`tags: [handyman/moc]`) y wikilinks | Reservado: listado de directorio para progressive disclosure, **sin frontmatter**; "cuando presente, sigue su estructura" | **Menor** — quitar el frontmatter y emitir links markdown lo vuelve conformante; su rol actual (MOC) ya es exactamente progressive disclosure |
| `log.md` | No existe; `progress/history.md` es append-only con headings `## 2026-07-18 - Feature 48: ...` (agrupación por fecha ISO, igual que log.md) | Reservado, opcional: historia con agrupaciones de fecha ISO 8601, sin frontmatter | **Ninguno** — log.md es opcional ("when present"). history.md puede quedarse como está; renombrarlo/proyectarlo es mejora futura, no requisito |
| Timestamps | `updated: 2026-07-19` (solo fecha); sprints ya tienen ISO completo (`closed_at: 2026-07-18T05:18:50.072Z`) | `timestamp` es solo recomendado, ISO 8601 datetime | **Ninguno para conformancia** — `timestamp` es SHOULD, no MUST. `updated` queda como key de extensión |
| `feature_list.json` | JSON, fuente de verdad del estado (70 KB) | "La spec no contiene provisiones sobre archivos no-markdown" | **Ninguno** — queda dentro del bundle, invisible para consumers OKF, sin romper nada. Proyectarlo a .md es mejora futura |
| Distribución | Directorio en repo git | Recomendado: repo git; también tarball o subdirectorio | **Ninguno** |

## Cambio mínimo conformante (lente ponytail)

Tres pasos, todos mecánicos; nada de nuevos formatos ni migraciones de contenido:

1. **`type:` en cada frontmatter existente** (329 archivos). Script one-shot que lo
   deriva del path/prefijo: `backlog/explore_*` → `type: Explore Report`,
   `backlog/impl_*` → `type: Implementation Note`, `backlog/review_*` → `type: Review`,
   `docs/sprints/sprint.*` → `type: Sprint`, `progress/*` → `type: Session Log`,
   `docs/*` → `type: Doc`. Más: los writers que emiten frontmatter
   (`handyman/src/backlog.ts`, `sprint.ts`, plantillas) agregan `type:` a los archivos
   nuevos. Redundante con `role`+filename, sí — pero es el único MUST de la spec.
2. **Frontmatter mínimo (`type:` solo) a los 14 .md huérfanos** (docs/, handoffs,
   planes, templates). Una línea de frontmatter por archivo, contenido intacto.
3. **`handyman/src/index_md.ts`**: emitir `[explore_npm_pack_64](backlog/explore_npm_pack_64.md)`
   en vez de `[[backlog/explore_npm_pack_64]]` y no escribir frontmatter en index.md.
   Obsidian renderiza links markdown igual de bien, así que el vault no pierde nada.

No hacer: log.md (opcional), `timestamp` ISO (SHOULD), tocar feature_list.json,
convertir wikilinks en el cuerpo de los 343 archivos (los consumers toleran links
rotos; el grafo grueso vive en index.md que ya quedaría conformante).

## Qué se gana / qué no

**Se gana:**
- `.handyman` pasa a ser un bundle OKF legible por cualquier consumer sin adaptador:
  el visualizador HTML de Google (grafo force-directed Cytoscape.js, autocontenido),
  ingestión en Knowledge Catalog, y agentes de terceros que hablen OKF.
- Cero lock-in nuevo: OKF es formato-no-plataforma; todos los campos actuales
  (`feature`, `role`, `status`, `updated`) sobreviven como extensiones toleradas.
- El vault Obsidian sigue funcionando idéntico (links markdown también son links
  en Obsidian).

**No se gana (con el cambio mínimo):**
- Los wikilinks en cuerpos de backlog/sprints (~25) siguen invisibles para
  consumers OKF: grafo parcial fuera de index.md.
- `feature_list.json` sigue fuera del universo OKF: el estado de features no
  aparece en el grafo salvo lo que index.md lista como texto.
- Nada valida conformancia continuamente: un archivo nuevo sin `type` la rompe
  en silencio hasta que exista un check.

## Mejoras futuras nombradas (no construidas)

- `okf_lint` en `validate_harness`: check de que todo .md no reservado tenga
  frontmatter parseable con `type` no vacío.
- Conversión wikilink→markdown en cuerpos (o dual-emit) para grafo OKF completo.
- Proyección `feature_list.json` → un concepto .md por feature (`type: Feature`)
  generada por el mismo script que regenera index.md.
- `timestamp:` ISO 8601 emitido por los writers junto a `updated`.
- `log.md` raíz generado desde `progress/history.md` (o symlink conceptual).
- `resource:` URIs (p.ej. `github://...`) en conceptos que apuntan a código.
- Demo: correr el subcomando `visualize` del reference agent de Google contra
  `.handyman` como smoke de interop.

## Fuentes

- https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/README.md — principios, index.md auto-generado, visualizador, compat Obsidian/Notion/MkDocs.
- https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md — v0.1: `type` único MUST; `title`/`description`/`resource`/`tags`/`timestamp` recomendados; index.md y log.md reservados sin frontmatter; links markdown relativos/bundle-absolutos; criterios de conformancia; sin provisiones para no-markdown.
- https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf — estructura del repo: SPEC.md, bundles/ (GA4, Stack Overflow, Bitcoin), samples/, src/reference_agent/, tests/.
- Local: `.handyman/index.md`, `.handyman/backlog/explore_npm_pack_64.md`, `.handyman/backlog/review_toolbox_next_landing.md`, `.handyman/progress/current.md`, `.handyman/progress/history.md`, `.handyman/docs/architecture.md`, `.handyman/docs/sprints/sprint.2026-SP5.md`, `.handyman/feature_list.json`, `handyman/src/index_md.ts` (generador de index.md).
