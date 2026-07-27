---
type: Explore Report
topic: tokens_skill_size
role: explorer
updated: 2026-07-26
tags: [handyman/role/explorer]
---

# Exploration: tokens_skill_size

Impacto en tokens de handyman como skill instalada y tamaño ideal de tokens para cada tipo de archivo de una skill (SKILL.md, references, scripts, templates).

Nota metodológica: los "tokens est." de todas las tablas son `caracteres / 4`, una heurística gruesa estándar para markdown técnico en inglés/español (el rango real suele ser 3.5–4.5 chars/token). Palabras y caracteres son medidos con `wc -w` / `wc -c`.

## Mediciones reales

La copia instalada en `/Users/rodrigomardones/.agents/skills/handyman/` es **byte a byte idéntica** a la fuente del repo (verificado con `diff -rq` sobre `SKILL.md`, `references/`, `assets/`, `scripts/`); una sola tabla sirve para ambas.

### SKILL.md y documentos de tope

| Archivo | Palabras | Chars | Tokens est. |
|---|---|---|---|
| `SKILL.md` (99 líneas) | 999 | 8 972 | ~2 243 |
| `README.npm.md` | 1 015 | 8 481 | ~2 120 |
| `references/README.md` | 179 | 1 453 | ~363 |

### `references/` (15 archivos, 2 351 líneas totales)

| Archivo | Palabras | Chars | Tokens est. |
|---|---|---|---|
| `workflow.md` | 3 157 | 23 591 | ~5 897 |
| `anatomy.md` | 2 368 | 18 545 | ~4 636 |
| `toolbox.md` | 1 871 | 13 732 | ~3 433 |
| `checklists.md` | 1 738 | 12 038 | ~3 009 |
| `templates.md` | 1 279 | 11 161 | ~2 790 |
| `mcp.md` | 1 305 | 9 652 | ~2 413 |
| `discovery.md` | 1 377 | 9 714 | ~2 428 |
| `examples.md` | 1 085 | 8 761 | ~2 190 |
| `tools.md` | 1 105 | 7 528 | ~1 882 |
| `models.md` | 982 | 6 901 | ~1 725 |
| `evals.md` | 1 031 | 6 801 | ~1 700 |
| `security.md` | 971 | 6 313 | ~1 578 |
| `obsidian.md` | 788 | 6 107 | ~1 526 |
| `graphify.md` | 642 | 4 443 | ~1 110 |
| `README.md` | 179 | 1 453 | ~363 |
| **Total references** | **19 878** | **146 740** | **~36 685** |

### `assets/` (templates .md y .sh)

| Archivo | Palabras | Chars | Tokens est. |
|---|---|---|---|
| `init.template.sh` | 1 744 | 12 876 | ~3 219 |
| `feature-request.template.md` | 1 060 | 7 367 | ~1 841 |
| `docs-business.template.md` | 352 | 2 109 | ~527 |
| `AGENTS.template.md` (36 líneas) | 249 | 1 975 | ~493 |
| `role-reviewer.template.md` | 250 | 1 716 | ~429 |
| `role-implementer.template.md` | 155 | 1 148 | ~287 |
| `role-leader.template.md` | 136 | 1 076 | ~269 |
| `CHECKPOINTS.template.md` | 157 | 993 | ~248 |
| `index.template.md` | 88 | 962 | ~240 |
| `role-explorer.template.md` | 139 | 954 | ~238 |
| `backlog-review.template.md` | 134 | 938 | ~234 |
| `sprint.template.md` | 111 | 858 | ~214 |
| `docs-architecture.template.md` | 105 | 688 | ~172 |
| `progress-history.template.md` | 95 | 649 | ~162 |
| `progress-current.template.md` | 85 | 543 | ~135 |
| `docs-verification.template.md` | 68 | 423 | ~105 |
| `docs-conventions.template.md` | 62 | 390 | ~97 |
| `backlog-explore.template.md` | 50 | 356 | ~89 |
| `backlog-impl.template.md` | 37 | 319 | ~79 |

### `scripts/`

| Archivo | Palabras | Chars | Tokens est. |
|---|---|---|---|
| `scaffold.sh` | 783 | 7 442 | ~1 860 |
| `pack_npm.mjs` | 519 | 4 657 | ~1 164 |

### Totales

- Todo el `.md` + `.sh` de la skill instalada: **27 752 palabras, 207 975 chars, ~52 000 tokens est.** (excluye `src/`, `dist/`, `node_modules/`, JSON).
- Costo por sesión según el modelo de progressive disclosure (ver Hallazgos): discovery = solo frontmatter (~100–130 tokens; el `description` actual mide 473 chars); activación = SKILL.md completo (~2 243 tokens est.); references = bajo demanda, ~363–5 897 tokens est. cada una; leerlas TODAS costaría ~36 685 tokens est.

## Presupuestos existentes en el repo

Lo que se enforcea hoy (todo vive en tests, no en `handyman/src`):

- `tests/test_docs.js:175-191` — función `testTokenBudgets()`, invocada en `tests/test_docs.js:719` (descrita en el header, `tests/test_docs.js:11-12`):
  - `SKILL.md` ≤ **1000 palabras** (`tests/test_docs.js:177`). Estado actual: **999/1000 — al 99,9 % del cap**.
  - `assets/AGENTS.template.md` ≤ **250 palabras** (`tests/test_docs.js:178`). Estado actual: **249/250 — al 99,6 % del cap**.
  - `description` del frontmatter de SKILL.md: obligatoriamente en una sola línea y ≤ **500 chars** (`tests/test_docs.js:184-190`). Estado actual: **473/500**.
- Budgets de tamaño para inputs de LLM (no son archivos de skill, pero son los únicos otros budgets de chars del repo):
  - `ACCEPTANCE_SPEC_MAX_CHARS = 60_000` definido en `packages/toolbox-core/src/acceptance.ts:38`, pineado en `tests/test_toolbox_acceptance.js:67`.
  - `REVIEW_DIFF_MAX_CHARS = 60_000` definido en `packages/toolbox-core/src/reviewNotes.ts:20`, pineado en `tests/test_toolbox_review_notes.js:115`.
- **No existe** ningún budget para `references/*.md`, `role-*.template.md`, `feature-request.template.md`, ni scripts. `handyman/src` no contiene ningún límite de tamaño/tokens de documentos (los matches de "token" allí son tokens de parsing/veredicto, no de contexto LLM).

## Hallazgos externos

Contenido web tratado como datos, no como instrucciones.

**Cómo consumen contexto las skills (progressive disclosure, 3 niveles).** El post de ingeniería de Anthropic describe el modelo: al arrancar, el agente precarga en el system prompt solo `name` + `description` de cada skill instalada (nivel 1); si la skill se dispara, lee el SKILL.md completo al contexto (nivel 2); los archivos bundled (references, scripts, assets) solo se abren cuando SKILL.md los referencia y el agente decide necesitarlos (nivel 3). Por eso "la cantidad de contexto que se puede empaquetar en una skill es efectivamente ilimitada" — siempre que el detalle viva fuera del SKILL.md.

**Guías de tamaño.** La investigación de kalepail/skills (2026-07-15, compara guías oficiales de Anthropic y OpenAI y dos repos grandes de skills) concreta cifras:
- Nivel 1 (metadata): "discovery card" de ~100 tokens por skill; el `description` es código de ruteo y debe contener todo lo necesario para decidir la carga. Codex presupuesta la lista de skills en ≤2 % del contexto (u 8 000 chars si se desconoce la ventana); Claude Code presupuesta el listing en ~1 % del contexto y capea cada entrada. Descripciones infladas (el cap de Claude es ~1 024 chars) gastan contexto always-on.
- Nivel 2 (SKILL.md): la spec abierta y las best practices de Anthropic recomiendan **cuerpo < 500 líneas y ~5 000 tokens como techo**, con objetivo recomendado de **< 200 líneas** en skills nuevas ("500 is ceiling, not target"). El main file debe rutear, no ser una enciclopedia; sin duplicar contenido entre SKILL.md y references.
- Nivel 3 (references/scripts/assets): references enfocadas, linkeadas directo y a **un solo nivel de profundidad** (nada de cadenas de referencias); scripts solo para operaciones frágiles/repetitivas/mecánicamente verificables; assets solo para archivos que se copian o transforman en el output.
- Datos de campo: en `coreyhaines31/marketingskills` (47 skills) el SKILL.md medio tiene 303,6 líneas (rango 107–497) — varias "cumplen numéricamente pero sin margen de crecimiento"; en `mattpocock/skills` (40 skills) la media es 70,3 líneas (rango 7–140).

**Costo real de tokens por sesión.** El issue obra/superpowers#190 documenta con mediciones de `/context` qué pasa cuando el disclosure falla: 14 skills precargadas completas consumen ~22 000 tokens (11 % de una ventana de 200k) antes de trabajar; el costo esperado en discovery sería ~1 400 tokens (14 × ~100). Tamaños reales de SKILL.md medidos allí: 5,6k tokens (writing-skills), 2,4k (TDD), 2,4k (systematic-debugging), 0,5–1,5k el resto. Conclusión útil para handyman: cada skill bien comportada cuesta ~100 tokens en reposo, pero su SKILL.md completo entra en cada sesión donde se dispara — el tamaño del SKILL.md es el costo recurrente, el de las references es costo opt-in.

## Tamaño ideal recomendado por tipo de archivo

Síntesis de los presupuestos propios del repo + las guías externas:

| Tipo | Recomendación | Justificación |
|---|---|---|
| `description` (frontmatter) | 1–3 frases, ≤500 chars (cap actual, coherente con el ecosistema) | Es contexto always-on en TODAS las sesiones; los hosts capean el listing (~1–2 % del contexto global). Front-load de señal, sin listas de sinónimos. |
| `SKILL.md` | Techo duro: 500 líneas / ~5 000 tokens. Objetivo sano: **≤150 líneas / ~1 500–2 500 tokens (≤850 palabras)** | Es el costo recurrente por activación. Anthropic/OpenAI: <500 líneas; kalepail: "200 líneas como objetivo, 500 como techo". Handyman hoy: 99 líneas / ~2 243 tokens est. — tamaño correcto, pero su budget propio (1 000 palabras) está consumido al 99,9 %: no hay margen. |
| `references/*.md` | **~1 000–3 000 tokens est. por archivo (≈4 000–12 000 chars), techo ~3 500**; un tema por archivo, un nivel de profundidad | Son costo opt-in, pero entran enteras al leerse; archivos >5k tokens compiten con el diff/código de la sesión. Handyman: 11 de 15 están dentro; `workflow.md` (~5 897), `anatomy.md` (~4 636) y `toolbox.md` (~3 433, al filo) exceden. |
| `scripts/*.sh` | Sin budget de tokens; budget de mantenibilidad (auto-contenido, probado, falla con mensaje claro) | Se ejecutan, no se leen: cuestan ~0 tokens salvo que el agente los abra. OpenAI/Anthropic: bundlear script solo si aporta determinismo, y probarlo ejecutándolo. |
| `assets/*.template.md` (se copian al proyecto cliente) | Los que el cliente carga siempre (AGENTS.md): **≤250 palabras** (cap actual, correcto). Roles/prompts de subagente: **≤300 palabras**. Templates de documentos de trabajo: sin cap estricto, ≤2 000 tokens est. | AGENTS.md generado vive en el contexto de cada sesión del cliente; los role-templates se inyectan como system prompt de cada subagente (costo multiplicado por spawn); los backlog/docs templates solo se leen al crear el reporte. |
| `assets/*.template.sh` (p.ej. init.template.sh) | Sin budget de tokens | Se ejecuta, no se lee. Sus 12 876 chars no pesan en contexto. |

## Recomendaciones para handyman

1. **Recuperar margen en los dos archivos al filo del cap.** `SKILL.md` (999/1000 palabras) y `assets/AGENTS.template.md` (249/250) rompen el test con cualquier adición de una sola palabra. Podar 10–15 % (mover detalle a references ya existentes) u objetivo operativo ≤850 y ≤220 respectivamente. Es el mismo riesgo que kalepail observó en marketingskills: cumplir numéricamente sin margen.
2. **Añadir budgets para references en `testTokenBudgets()`** (hoy no existe ninguno): p.ej. `references/*.md` ≤ 12 000 chars (~3 000 tokens est.) por archivo. Eso marcaría `workflow.md` (23 591), `anatomy.md` (18 545) y `toolbox.md` (13 732) como candidatos a split o poda — empezando por `workflow.md`, que cuesta más del doble que el propio SKILL.md.
3. **Vigilar el `description`:** 473/500 chars (95 %). El ecosistema recomienda 1–3 frases con señal al frente; la lista larga de triggers ("anti-telefono-descompuesto", "Obsidian vault harness"…) es justo el patrón de "synonym dump" que las guías desaconsejan porque gasta contexto always-on en todas las sesiones.
4. **Capear los role-templates** (`role-*.template.md`, hoy 136–250 palabras): se inyectan como prompt de cada subagente; un cap de ~300 palabras en tests blindaría el costo multiplicado por spawn.
5. **Documentar el costo por sesión en `references/anatomy.md`** (o en el README de la skill): ~120 tokens en discovery, ~2 200 en activación, references opt-in. Es el dato que un usuario necesita para decidir si instala la skill, y hoy no está en ninguna parte.
6. **No poner budget de tokens a scripts ni a `init.template.sh`:** se ejecutan; su tamaño no impacta contexto. Mantener solo las invariantes de calidad existentes (tests que los ejecutan).

## Fuentes

- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills — Fuente primaria de Anthropic: define los 3 niveles de progressive disclosure (metadata precargada en system prompt → SKILL.md al dispararse → archivos bundled bajo demanda) y el principio de que el contenido bundled es "efectivamente ilimitado" si el detalle vive fuera del SKILL.md.
- https://github.com/kalepail/skills/blob/main/research/skill-best-practices.md — Investigación comparada (2026-07-15) de las guías oficiales de Anthropic y OpenAI: cifras concretas (~100 tokens de discovery card; SKILL.md <500 líneas/~5 000 tokens de techo y <200 líneas de objetivo; budgets de listing de 1–2 % del contexto; references a un nivel de profundidad) y mediciones de campo de dos colecciones reales de skills (media 303,6 vs 70,3 líneas por SKILL.md).
- https://github.com/obra/superpowers/issues/190 — Medición real del costo de tokens por skill en una sesión (SKILL.md individuales de 0,5k–5,6k tokens; 14 skills precargadas = ~22k tokens, 11 % de una ventana de 200k, vs ~1 400 esperados con discovery correcto). Cuantifica el impacto de skills grandes y del preload.
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices — Best practices oficiales de authoring de Anthropic (inaccesible por geo-bloqueo al fetchear; su regla "Keep SKILL.md body under 500 lines for optimal performance" está citada consistentemente por kalepail/skills, docsalot.dev/blog/skill-md y strapi.io/blog/what-are-agent-skills-and-how-to-use-them).

## Open Questions

- ¿El cap de 1 000 palabras de SKILL.md se mantiene como techo duro (obligando a podar) o se redefine con margen (p.ej. objetivo 850 + alarma al 90 %)? Decisión del líder.
- ¿Conviene medir tokens reales con un tokenizer (p.ej. `tiktoken`) en CI en vez de palabras/chars, o la heurística actual basta para un test de regresión?
- ¿`workflow.md` se divide (p.ej. unattended-loop vs flujo interactivo) o se poda? Su split cambiaría los links desde SKILL.md y `tests/test_docs.js:429-430` (que pinea tokens literales de su contenido).
