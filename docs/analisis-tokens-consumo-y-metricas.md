# Análisis: consumo de tokens, métricas por feature y descarga sugerida de skills

Consolidación de la investigación de la feature 86 (`research_two_topics_token_related`). Fuentes primarias (con citas externas completas en cada una):

- `.handyman/backlog/explore_tokens_skill_size.md` — tamaño de la skill y budgets ideales
- `.handyman/backlog/explore_tokens_metrics_feature.md` — diseño de métrica de tokens por feature
- `.handyman/backlog/explore_find_skills_suggested_install.md` — resultado real de `npx skills add` y recomendación de declaración

Nota metodológica: "tokens est." = `caracteres / 4` (heurística estándar para markdown técnico; rango real 3.5–4.5 chars/token).

---

## 1. Tamaño de la skill en tokens (mediciones reales)

La copia instalada (`~/.agents/skills/handyman/`) es byte a byte idéntica a la fuente del repo (`diff -rq` verificado). Medidas con `wc -w/-c`:

| Componente | Medida real | Tokens est. | Observación |
|---|---|---|---|
| `SKILL.md` (99 líneas) | 999 palabras / 8 972 chars | ~2 243 | **Al 99,9 % de su budget** (1 000 palabras, `tests/test_docs.js:177`) |
| `assets/AGENTS.template.md` | 249 palabras | ~493 | **Al 99,6 % de su budget** (250 palabras, `tests/test_docs.js:178`) |
| `description` (frontmatter) | 473 chars | ~118 | Al 95 % del cap (500 chars, `tests/test_docs.js:184-190`) |
| `references/` (15 archivos) | 146 740 chars | ~36 685 | Sin budget alguno hoy; 3 archivos exceden el techo recomendado |
| Total skill (.md + .sh) | 207 975 chars | ~52 000 | Excluye `src/`, `dist/`, `node_modules/` |

Costo por sesión según progressive disclosure (modelo de 3 niveles de Anthropic): **~120 tokens en discovery** (solo frontmatter), **~2 243 al activarse** (SKILL.md completo), references como costo opt-in (~363–5 897 tokens est. cada una).

Guías externas consolidadas (fuentes en el explore report): description ≈ "discovery card" de ~100 tokens; SKILL.md con techo de 500 líneas / ~5 000 tokens y **objetivo <200 líneas**; references a un solo nivel de profundidad, ~1 000–3 000 tokens por archivo; los scripts se ejecutan (≈0 tokens de contexto), no se leen.

**Archivos fuera de la guía:** `workflow.md` (~5 897 tokens est.), `anatomy.md` (~4 636), `toolbox.md` (~3 433, al filo).

## 2. Métrica de tokens por feature (diseño recomendado)

**Estado actual: no existe ningún conteo de tokens en el repo** (verificado con grep sobre `handyman/src` y `packages/toolbox-core/src`). Hallazgo de arquitectura decisivo: handyman **no hace llamadas LLM durante el trabajo de una feature** — los tokens se queman en la sesión del CLI anfitrión (Claude Code, Kimi Code, etc.); los adapters de `toolbox-core` solo sirven drafts de apps/web (fracción ínfima del gasto).

Diseño recomendado (híbrido **B + A + C**, ledger JSONL como formato canónico; detalle y trade-offs en el explore report):

1. **Fuente primaria (B):** ledger append-only `.handyman/metrics/tokens.jsonl`, una línea JSON por feature cerrada (`{ts, feature_id, feature, source, provider, model, input_tokens, output_tokens, cache_*?}`). Lo escribe `feature.js done` con `--tokens in=N out=N [--tokens-source S]` (mismo patrón que `--tools`), con intento best-effort de `ccusage --json --since <started_at> --until <done_at>` cuando esté disponible, y `source:"unknown"` si no hay dato — **el cierre nunca falla por tokens** (principio "observa, no bloquea" de `metrics.ts`).
2. **Complemento (A):** captura de `usage` real en los adapters LLM de `toolbox-core` (`message_start`/`message_delta` en Anthropic-protocol; `stream_options:{include_usage:true}` + chunk final en OpenAI-compat). Cubre zai/claude/ollama — "cualquier modelo" del registry.
3. **Fallback (C):** estimación chars/4 sobre artefactos, marcada `source:"estimate"` y excluida de promedios reales.
4. **Persistencia:** ledger JSONL (agregable) + línea `- **Tokens:** in=N out=N (fuente)` en la entrada de `history.md`. **Sin cambios de schema** en `feature_list.json` (`meta` está cerrado con `additionalProperties:false`).
5. **Reporte:** nueva sección `tokens` en `metrics.js` (totales, promedio por feature, desglose por modelo y fuente, lista de `estimate/unknown`).

## 3. Descarga sugerida vía find-skills (resultado real)

Comando ejecutado de verdad (2026-07-26, desde la raíz del repo):

```
npx -y skills add https://github.com/vercel-labs/skills --skill find-skills -y
```

- **Resultado: éxito (exit 0), totalmente no interactivo.** Instalación a nivel **proyecto**: `.agents/skills/find-skills/SKILL.md` (copia canónica, gitignored), symlink `.claude/skills/find-skills`, y `skills-lock.json` (hash SHA-256, reproducible, gitignored). Nada fuera del repo tocado.
- **El verificador ya lo detecta:** `node handyman/dist/tools_discovery.js check` reporta `NOTE: installed but not declared: find-skills` — la señal natural para proponer declaración.
- Evaluación de seguridad integrada en la CLI: Gen Safe · Socket 0 alertas · **Snyk Med Risk** (skill de contenido estático, sin ejecutables).
- Drift menor: la copia de proyecto difiere en una línea de la copia de usuario ya instalada.

**Recomendación sobre declarar find-skills en `discovery.skills`: SÍ, condicionado** — (1) convención documentada de instalar sin `-g` (scope proyecto, no ensuciar `$HOME`); (2) añadir `.claude/` a `.gitignore` si se usa la CLI `skills` en este repo; (3) aceptar explícitamente el riesgo Med Risk de Snyk y revisión humana de toda skill instalada; (4) tolerar la duplicación usuario/proyecto o fijar un scope canónico. Alternativa si no se aceptan las condiciones: no declararla y convivir con el NOTE permanente.

## 4. Plan de acción de mejoras por campo

| Campo | Acción | Prioridad | Vehículo propuesto |
|---|---|---|---|
| Skill size — margen | Podar `SKILL.md` a objetivo ≤850 palabras y `AGENTS.template.md` a ≤220 (hoy 99,9 %/99,6 % del cap: cualquier palabra rompe el test) | **Alta** | feature `skill_budget_headroom` |
| Skill size — budgets | Añadir caps en `testTokenBudgets()`: `references/*.md` ≤12 000 chars (~3 000 tokens est.); `role-*.template.md` ≤300 palabras (costo multiplicado por spawn de subagente) | Alta | misma feature |
| Skill size — outliers | Split o poda de `workflow.md` (5 897), `anatomy.md` (4 636), `toolbox.md` (3 433); ojo: `tests/test_docs.js:429-430` pinea contenido literal de workflow.md | Media | feature `references_split_oversized` |
| Skill size — transparencia | Documentar el costo por sesión (~120 discovery / ~2 243 activación / references opt-in) en `references/anatomy.md` | Baja | junto a la anterior |
| Métrica tokens | Implementar ledger `.handyman/metrics/tokens.jsonl` + flag `--tokens` en `feature.js done` + línea en history.md + sección `tokens` en `metrics.js` (diseño §2) | **Alta** | feature `feature_token_metrics_ledger` |
| Métrica tokens — adapters | `DraftResult.usage` + captura en ambos adapters de `toolbox-core` | Media | feature `llm_usage_capture` (pequeña, separada) |
| find-skills | Declarar `find-skills` en `discovery.skills` con las 4 condiciones de §3 (incluye `.claude/` en `.gitignore` y convención sin `-g` en `references/discovery.md`) | Media | feature `declare_find_skills` |
| Verificación | `./init.sh` debe seguir en exit 0 tras cada acción (budgets nuevos = tests nuevos) | Siempre | — |

**Decisiones que quedan del líder** (open questions de los reportes): ¿cap de SKILL.md como techo duro con poda, o redefinir con margen (objetivo 850 + alarma al 90 %)? ¿Tokenizer real (tiktoken) en CI o basta la heurística palabras/chars? ¿`workflow.md` se divide o se poda?
