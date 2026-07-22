# Investigación: Replicación mínima del harness de Handyman

> **Objetivo:** determinar el conjunto *mínimo* de elementos de un harness de
> Handyman que, una vez subido (commit/GitHub release/gist), permita descargarlo
> y **regenerar el harness completo en cualquier repositorio**.

Fecha: 2026-07-22 · Harness version: 3.5.0 · Sprint `feat-rework-tools` cerrado.

## 1. Cómo se construye un harness (modelos mental)

Un harness se compone de tres capas claramente separables:

1. **Toolchain (CLI)** — el propio skill `handyman` / paquete npm
   `handyman-harness`. No vive en el repo objetivo: se invoca con
   `npx handyman-harness` o se instala el skill. **Totalmente reproducible.**
2. **Scaffolding gestionado** — plantillas que `scripts/scaffold.sh`
   (`handyman bootstrap`) copia desde `assets/` al hacer un primer arranque:
   `AGENTS.md`, `CHECKPOINTS.md`, `init.sh`, `harness.config.json`,
   `feature_list.json`, `progress/{current,history}.md`, `memory/*.md`,
   `index.md`, `feature-request.md`, role files. **Reproducibles** salvo el
   contenido específico del proyecto que se rellena a mano.
3. **Estado mutable + conocimiento** — `feature_list.json` (backlog),
   `progress/`, `backlog/`, `archive/`, `memory/` (negocio, arquitectura,
   convenciones, verificación). **Irreproducible**: es el contexto del proyecto.

Por tanto la pregunta "¿qué subo para regenerar el harness en cualquier repo?"
se traduce en: **¿qué subo de las capas 2 (la parte customizada) y 3 (el
conocimiento) que NO se puede regenerar desde el paquete npm?**

## 2. Inventario del repo dogfood (handyman/handyman)

Elementos rastreados hoy y su carácter replicable:

| Elemento | Cuenta | Replicable | Notas |
|---|---|---|---|
| `handyman/src/` + `handyman/assets/` | 66 | ✅ desde npm o fuente | Es el skill mismo; no forma parte del "harness destino" |
| `assets/*.template.*` | 28 | ✅ `scaffold.sh` | Plantillas base |
| `.handyman/archive/` | **319** | ⚠️ ruido histórico | Reportes terminados, stubs compactados. No necesarios para regenerar |
| `.handyman/backlog/` | 18 | 🔸 trabajo activo | Descartable tras cierre |
| `.handyman/progress/` | 11 | 🔸 operativo | `current.md` + handoffs; histórico |
| `.handyman/memory/` (4 core) | 4 | ❌ **conocimiento** | business/architecture/conventions/verification |
| `.handyman/memory/sprints/` | 13 | 🔸 planes/periodos | Útil como referencia, no esencial |
| `.handyman/feature_list.json` | 1 | ❌ **backlog** | El plan de trabajo |
| `.handyman/index.md`, `feature-request.md` | 2 | 🔸 derivable | `index_md` regenera index.md |
| Raíz: `harness.config.json` (76 L) | 1 | ❌ **config** | models/tools/discovery/project_name |
| Raíz: `init.sh` (188 L, muy custom) | 1 | ❌ **verifier** | lint/build/test reales del proyecto |
| Raíz: `AGENTS.md` (37 L), `CHECKPOINTS.md` (38 L) | 2 | 🔸 diff mínimo vs plantilla | 1-2 líneas custom |
| `.github/agents/*.agent.md` | 3 | 🔸 casi plantilla | 57 L totales |

**Conclusión cuantitativa:** de ~368 archivos bajo `.handyman/` + puentes,
**solo ~10–15 archivos son realmente necesarios** para regenerar; los 319 del
`archive/` y los ~40 de backlog/handoffs son ruido reproducible o histórico.

## 3. Conjunto MÍNIMO replicable (el "seed")

Para clonar en un repo nuevo y tener un harness Handyman funcionando + su
contexto, basta con:

### Tier 0 — Regenerable por herramienta (no se sube, se ejecuta)
- `npx handyman-harness` + `scaffold.sh` → crean esqueleto desde plantillas.
- Esto entrega: `AGENTS.md`, `CHECKPOINTS.md`, `init.sh`, `harness.config.json`
  (placeholders), `feature_list.json`, `progress/`, `memory/*.md`, role files.

### Tier 1 — Config + verifier específicos del proyecto (OBLIGATORIO subir)
1. `harness.config.json` — models/tools/discovery/post_run/current_sprint.
2. `init.sh` — comandos reales de lint/build/test (no los placeholders).

### Tier 2 — Conocimiento del dominio (OBLIGATORIO para valor real)
3. `.handyman/memory/business.md`
4. `.handyman/memory/architecture.md`
5. `.handyman/memory/conventions.md`
6. `.handyman/memory/verification.md`

### Tier 3 — Estado de trabajo (opcional, según objetivo)
7. `.handyman/feature_list.json` — si quieres conservar el backlog.
8. `.handyman/progress/current.md` — punto de reanudación.
9. `AGENTS.md` / `CHECKPOINTS.md` diffs sobre la plantilla (1-2 líneas).

**Total mínimo: 6 archivos (Tier 1+2) ≈ 4 KB.** Con backlog: 8 archivos.

## 4. Soluciones propuestas

### Solución A — "Seed bundle" en el repo (recomendada, simple)
Empaquetar Tier 1+2 (+Tier 3 opcional) en una carpeta versionada del propio
repo, p.ej. `.handyman.seed/`, y un script `restore` que:
1. `npx handyman-harness` bootstrap (crea esqueleto desde plantillas).
2. Copia los overrides de `.handyman.seed/` encima (no sobrescribe estado
   nuevo si ya existe).

- **Pros:** un solo `git clone` lo trae; cero dependencias externas; idempotente.
- **Contras:** vive en cada repo; el seed debe mantenerse a mano al driftar.

### Solución B — GitHub Release / gist portátil
Publicar el seed como un `.tar.gz` (6–8 archivos) adjunto a un release o un
gist. Un `restore.sh` hace `curl | tar xz` + bootstrap.

- **Pros:** reutilizable entre N repos; repo destino queda limpio.
- **Contras:** URL/version que mantener; el seed se desacopla del código.

### Solución C — Repositorio plantilla (`handyman-template`)
Convertir un repo en GitHub Template con los Tier 1+2 ya customizados por
defecto. "Regenerar" = `Use this template` + `scaffold.sh` para lo mutable.

- **Pros:** integración nativa GitHub; README + actions incluidos.
- **Contras:** solo GitHub; una plantilla por "sabor" de proyecto.

### Solución D — Script `handyman seed export/import` (más completa)
Nuevo verbo del CLI que empaqueta automáticamente Tier 1+2 (y opcionalmente 3)
leyendo `harness.config.json` para resolver rutas, y los restaura con
`bootstrap` + merge. Formaliza la mecánica y la versiona con el skill.

- **Pros:** reproducible, testeable, documentado; perfecto encaje con el skill.
- **Contras:** desarrollo nuevo (feature del CLI); no existe hoy.

## 5. Recomendación

| Perfil | Solución |
|---|---|
| Uso inmediato, 1–2 repos | **A** (seed bundle en repo) |
| Múltiples repos / máquinas | **B** (gist/release tarball) |
| Equipos en GitHub | **C** (template repo) |
| Producto durable (visión del skill) | **D** (`handyman seed export/import`) |

Para el repo dogfood actual, **A** es lo más rápido y además sirve como prueba
de concepto de **D**. El `archive/` (319 archivos) puede dejar de versionarse
sin pérdida: es derivable del historial git y del `feature_archive.json`.

## 6. Próximos pasos sugeridos
1. Decidir solución (recomiendo **A** ahora, abrir feature para **D**).
2. Generar `.handyman.seed/` con Tier 1+2 (+3 opcional).
3. Escribir `restore`/`bootstrap` idempotente.
4. Evaluar `git rm -r --cached .handyman/archive` (319 archivos de ruido) o
   moverlo a un reflog/branch de historia.

---

## 7. Implementación (rama `feat-harness-seed`) — DONE

Se aplicó el plan con las decisiones de negocio elegidas: **ambas A y D**,
**Tier 1+2 (plantilla limpia)**, **archive al `.gitignore`**, **universal**.

### Parte A — Seed bundle autónomo (`.handyman.seed/`)
- **Tier 1:** `init.sh`, `harness.config.json` (snapshot de este repo).
- **Tier 2:** `memory/{business,architecture,conventions,verification}.md`.
- **`templates/`:** 12 plantillas puente (AGENTS, CHECKPOINTS, roles, progress,
  feature_list, index, feature-request) para que el restore sea autónomo — el
  paquete npm publicado incluye `assets/` pero NO `scripts/scaffold.sh`.
- **`manifest.json`:** fuente de verdad del contenido del seed.
- **`restore.sh`:** idempotente y **no destructivo** (solo llena huecos, jamás
  sobrescribe estado existente). Fase 1 bootstrap desde `templates/`, fase 2
  overlay Tier 1+2. Smoke-testeado en un dir temporal: regenera 17 archivos.

### Parte D — Verbo CLI `seed` (`handyman/src/seed.ts`)
- `handyman seed export [--root .] [--seed PATH]` — escribe el seed desde el
  harness en vivo (Tier 1+2 + templates de `assets/` + `manifest.json`).
- `handyman seed import [--root .] [--seed PATH] [--overlay]` — restaura:
  bootstrap del esqueleto desde `templates/` (si no hay harness) + overlay
  Tier 1+2. Idempotente y no destructivo.
- Registrado en `cli.ts` y `scripts/pack_npm.mjs` (VERBS), **9 tests vitest**
  (export, import, idempotencia, errores, usage) — todos en verde.

### Limpieza de archive
- `git rm -r --cached .handyman/archive/backlog` (318 reportes terminados) +
  `.handyman/archive/backlog/` al `.gitignore`. Se conserva el índice
  `feature_archive.json` (canónico, ~124 KB). El historial git conserva los
  reportes si se necesitan.

### Verificación
- `./init.sh` → **INIT_EXIT=0** (lint OK, build OK, test OK, harness OK,
  preflight OK). Dos tests ajustados por el cambio de estado:
  `test_docs.js` excluye `.handyman.seed` (plantillas bundled, como `assets/`);
  `test_mcp.js` M12 acepta "no sprint open" además de "open: N feature(s)".

### Uso
```bash
# Refrescar el seed tras drift de config/conocimiento:
npx handyman-harness seed export --seed .handyman.seed
# Regenerar el harness en cualquier repo (drop del seed + import):
npx handyman-harness seed import --seed .handyman.seed
# O sin build/npm, solo bash:
./.handyman.seed/restore.sh
```

