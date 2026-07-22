---
type: Explore Report
topic: reorganizacion_capas
role: explorer
updated: 2026-07-21
tags: [handyman/role/explorer]
---

# Exploration: reorganización de capas del harness

## Question

¿Qué capas del harness se usan realmente (con evidencia del dogfooding en este repo) y cuáles conviene fusionar, rotar o eliminar antes de reorganizar la estructura?

## Findings

### Evidencia de uso por capa

| Capa | Evidencia | Veredicto |
|------|-----------|-----------|
| `docs/` (business, architecture, conventions, verification) | Tamaños sanos (3–19 KB), referenciados por CHECKPOINTS, reviewer y `init.sh` (advisory de template) | **Mantener** — es la memoria que funciona |
| `init.sh` (estado 0) | 7 gates + advisories; corre `validate_harness` contra el propio workspace | **Mantener** — ancla del sistema |
| `progress/current.md` | 31 líneas, reseteado correctamente tras cierre | **Mantener** |
| `progress/history.md` | 130 KB / 1338 líneas en un solo archivo; entradas recientes con `Plan: ...` `Changes: ...` sin rellenar (feature 68) | **Rotar por sprint** — la ceremonia de 8 campos ya no se llena |
| `backlog/` | 324 archivos / 1.7 MB: 162 impl + 156 review + 6 explore para 39 features listadas (features 1–29 podadas de la lista pero sus reportes quedaron) | **Retención** — necesario en vuelo (anti-teléfono-descompuesto), archivo muerto tras cierre de sprint |
| `feature_list.json` | 73 KB, 39 features **todas `done`**, cola vacía; ids 30–68 (1–29 desaparecidas); `archive/feature_archive.json` existe con **0** entradas | **Adelgazar** — hoy es un ledger que duplica history, no una cola |
| `graphify-out/` | Generado 2026-07-17 (377K tokens input), **nunca actualizado** (posterior: PR #25 y #26, los más grandes); **no indexa `.handyman/`**; sin telemetría de consultas (`cost.json` ausente); ~15 comunidades duplicadas de un solo archivo ("Docs Analisis" ×15) | **Decidir vivo o muerto** — la regla "query graph first" de AGENTS.md no se cumple |
| `docs/` raíz del repo | 23 `analisis-*.md`; tercer hogar para análisis junto a `backlog/explore_*` y `.handyman/docs/sprints/plan-*` | **Consolidar regla** |
| `docs/current/` (workspace) | 4 handoffs + planes; solapa con `progress/current.md` | **Fusionar** |
| `feature-request.md` + `request.template.md` | Dos plantillas para lo mismo, contenido divergente (una tiene una petición real dentro) | **Fusionar en una** |
| `harness.config.json` models | Los 4 roles usan `GLM-5.2` — la diferenciación por rol es ceremonia sin uso | **Simplificar** (default + overrides) |
| `harness.config.json` discovery | Lista nombres (skills/mcp/agents) sin path ni relación con dónde viven (`.agents/skills`, `.github/agents`) | **Relacionar declaración ↔ ubicación** |
| `$HOME/HANDYMAN` global | `events.jsonl` muerto desde 2026-07-02; `index.html` = panel retirado; `registry.json` vivo (toolBox) | **Limpiar muertos, conservar registry** |

### Hallazgos transversales

1. La petición de multi-rama ya está registrada dentro de `request.template.md` ("habilitar múltiples ramas y múltiples sesiones en paralelo") y existe `impl_branch_provenance.md` — el dolor es real y parcialmente atacado.
2. El estándar de memoria en texto plano ya está adoptado: feature `okf_memoria_alignment` alineó 345 archivos al frontmatter OKF (knowledge-catalog de Google). Renombrar `docs/` → `memory/` sería churn puramente cosmético sobre algo ya resuelto.
3. El crecimiento no es un problema de capas nuevas sino de **falta de cierre**: existen los mecanismos (archive, sprint close) pero no se ejecutan — `feature_archive.json` con 0 entradas es la prueba.

## Plan de trabajo propuesto (fases = features del propio harness)

**F0 — Cerrar, no construir (una feature, mayormente mecánica)**

_Corrección post-revisión de `sprint.ts`: el cierre ya implementa archive de done, doc del período y compactación de history. F0.1–F0.3 no se construyen — se corre `sprint close`. El problema real es el disparador: el calendario no ocurre; el merge de rama sí. Decisión: la rama reemplaza al sprint como unidad de trabajo. `sprint open --label <rama>` al abrir rama, `sprint close` como paso del merge (encaja en pull-request-publish). El código de sprint.ts no se toca; renombrar "sprint" → "period/branch" queda como futuro cosmético._
1. Correr el cierre pendiente una vez (vacía las 39 done de `feature_list.json` hacia el archive, compacta history). Mata además el 90 % de los conflictos de merge multi-rama, porque lo que acumula son las `done`.
2. Atar `sprint close` al flujo de merge (checklist de pull-request-publish o post_run), no a un calendario.
3. Retención de `backlog/`: los reportes de features archivadas se mueven a `archive/` en el mismo cierre.
4. Fusionar `feature-request.md` y `request.template.md` en una sola plantilla.
5. Limpiar `$HOME/HANDYMAN`: borrar `events.jsonl` e `index.html`; conservar `registry.json`.

**F1 — Coherencia de contexto (una feature)**
6. Graphify: o se automatiza o se quita la regla. Propuesta mínima: advisory de frescura en preflight (mtime de `graph.json` vs último commit) + `graphify --update` como paso del cierre de sprint + incluir `.handyman/docs/` en el scan. Si no se quiere pagar ese costo, eliminar "query the graph first" de AGENTS.md y dejar graphify como herramienta on-demand.
7. Regla única para análisis: `backlog/explore_*` = trabajo en vuelo; `docs/` del repo = solo documentos durables de producto. Los `analisis-*.md` que ya cumplieron se archivan.
8. Simplificar la plantilla de entrada de `history.md` a 3 campos (qué, evidencia → link a backlog, verifier) — la de 8 campos ya no se rellena.

**F2 — Declaración ↔ uso (una feature) — RENEGOCIADA en ejecución**
_Al implementar se descubrió que `tools_discovery check` ya resuelve declaración → ubicación (paths impresos, MCPs validados contra `.vscode/mcp.json`) y que persistir paths contradice la decisión de diseño documentada del propio módulo (nombres portables, paths resueltos). `models` default+overrides: ceremonia sin consumidor. El gap real era señal: ~30 NOTEs de skills globales enterraban el reporte. Lo ejecutado: NOTEs de no-declarada solo para instalaciones locales del proyecto (13 reales vs 30 de ruido). Ver [[impl_discovery_declared_paths]]._

**F3 — MCP de handyman (cuando F0 deje el estado limpio)**
Servidor `handyman-mcp` como wrapper delgado sobre `handyman/src/core` (mismo código que la CLI, cero segunda fuente de verdad; construir con mcp-builder). Valor, en orden:
1. El contrato pasa de prosa a código: `feature_close` rechaza sin verifier verde — hoy esa regla vive en markdown y depende de obediencia del modelo (la decadencia de ceremonia observada — placeholders en history, cierre nunca corrido — es el argumento).
2. Hub multi-repo: el server lee `$HOME/HANDYMAN/registry.json` (3 harnesses registrados) y las tools reciben `project` — toolBox o cualquier agente opera todos los repos desde una superficie. Es el puente directo al norte "panel como agente".
3. Portabilidad: cualquier cliente MCP obtiene los verbos sin la skill instalada; la skill adelgaza a metodología (hoy menciona `npx` 101 veces).
Superficie mínima: `harness_list`, `preflight`, `feature_next`, `feature_close` (gated), `report_write`, `verify` + resources (`docs/*`, `current.md`). toolBox web sigue leyendo por import directo de `toolbox-core` (mismo monorepo); el MCP es la superficie de verbos para agentes.

**Futuro nombrado, no construido**
- Renombrar la unidad "sprint" → "period/branch" en sprint.ts y plantillas (cosmético).
- Renombrar `docs/` → `memory/` (solo si algún día justifica el churn de templates/tests/validator).
- Sesiones paralelas multi-rama con estado por rama.
- Grafo que cubra el workspace (`.handyman/`) además del código.
- `logs/<element>.log.md`: no crear — history rotado + backlog con retención ya cumplen ese rol.

## Source Locations

- `.handyman/feature_list.json` (73 KB, cola vacía) · `.handyman/archive/feature_archive.json` (0 entradas)
- `.handyman/progress/history.md:1300+` (entradas con placeholders)
- `graphify-out/GRAPH_REPORT.md` (fechado 2026-07-17; comunidades duplicadas desde línea ~58)
- `handyman/src/sprint.ts` (cierre de sprint donde colgar rotación/retención)
- `harness.config.json` (`models`, `discovery`, `post_run`)
- `$HOME/HANDYMAN/{events.jsonl,index.html,registry.json}`

## Open Questions

- ¿Graphify se paga (frescura automática) o se degrada a on-demand? Ambas son honestas; la actual (regla escrita + grafo muerto) no.
- ¿`docs/current/` (handoffs) se fusiona en `progress/` o desaparece con la disciplina de `current.md`?
- Ramas paralelas con el modelo rama-como-período: `current_sprint` es un puntero único; con provenance de rama en las features, `close` podría derivar membresía desde la rama en vez del label (cambio chico, futuro).

## Resueltas en conversación (2026-07-21)

- Unidad sprint vs rama: la rama gana; el cierre existente se dispara en el merge. (Corrección de evidencia: el archive SÍ se usó en SP1–SP5 con 29 features; lo varado era SP6 más el hueco de estampado que dejó 19 done sin label.)
- MCP de handyman: sí, como F3 — contrato en código + hub multi-repo vía registry + portabilidad. Wrapper sobre core, no segunda implementación. Registrada como feature 72 (pending, depends_on 69–71).

## Ejecución (2026-07-21, rama feat-rework-tools)

- **F0 = feature 69** cerrada: SP6 archivado (39 done; feature_list 73 KB → ~5 KB), labels de rama + estampado en add/start, retención de backlog (325 → 7 archivos), plantilla única de petición, protocolo por rama en AGENTS/CHECKPOINTS (C6), global limpio. → [[impl_period_close_branch_unit]]
- **F1 = feature 70** cerrada: gate `context` en preflight (NOTE grafo viejo / OK fresco), regla única de análisis en conventions, 20 análisis a `docs/archive/`, entrada de history compacta (emisor + plantilla + pins), grafo refrescado (2185 nodos / 4268 aristas / 134 comunidades; 347 fantasmas podados; cubre `.handyman/docs` por primera vez; cost.json iniciado con 423K tokens). Hueco conocido: 21 docs del chunk fallido quedaron fuera del manifest para re-extracción en el próximo `--update`. → [[impl_graphify_freshness_gate]]
- **F2 = feature 71** cerrada renegociada (ver arriba). → [[impl_discovery_declared_paths]]
- Pendiente: **feature 72 `handyman_mcp_server`** (F3) y el rename cosmético sprint → period.
