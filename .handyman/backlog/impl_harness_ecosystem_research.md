---
type: Implementation Log
feature: harness_ecosystem_research
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/harness_ecosystem_research]
---

# Implementation Report: harness_ecosystem_research

## Files Changed

- `docs/analisis-harnesses-ecosistema.md` (nuevo, research-only; ningún cambio a `handyman/`, `tests/` ni al SKILL)

## Design Notes

- Research-only, espejo de las features 9/15/20/25/31/32/38/48/54/92. Fuentes web verificadas 2026-07-15: artículo de Anthropic sobre harnesses de larga duración + quickstart `autonomous-coding` (linaje directo de handyman), beads/bd (25.3k stars: grafo de dependencias, `ready`, ids hash, compaction, `prime/remember`), obra/superpowers (255k stars: workflow con revisión en dos etapas y worktrees), patrón ralph loop (skills 3.5K installs; fuente original 403, citada vía implementaciones), github/spec-kit (122k stars: `converge`), y 5 skills "harness" descubiertas con `npx skills find harness` (2 útiles como literatura, 1 con audit FAIL que se lee pero no se instala).
- Evidencia local verificada en vivo: contrato feature sin `depends_on` (leído del schema), `evals.py` sin pass@k (grep 0), `sprint.py close` archiva feature_list pero no comprime history, 11 scripts + 12 suites como línea base.
- Matriz de 16 features comunes (aparecen en >=2 fuentes): 6 completas, 8 parciales, 2 ausentes. Las ausentes: grafo de dependencias + detección ready, y contrato de loop desatendido.
- Plan A-E: A `depends_on`+`feature.py ready` (schema-first, precedente harness_version/discovery/sprint), B contrato de loop (exit codes + workflow, NO runner propio), C revisión dos etapas (solo template+protocolo), D compaction de history en sprint close (espejo del archive), E observation shape en scripts + pass@k opt-in en evals.py.
- Sección "qué NO adoptar" con 8 descartes razonados (ids hash, SQL, mensajería, TDD enforcement, runner propio, telemetría, allowlist, instalar skills de harness).
- 6 features sugeridas NO añadidas al backlog (decisión del operador), precedente de la serie.
- T2-safe: 0 markdown links (`grep -c '](' = 0`); URLs como inline-code; título con 🔬 como la serie.

## Test Output

```text
$ grep -c '](' docs/analisis-harnesses-ecosistema.md
0
$ ./init.sh
ALL SUITES PASSED
EXIT=0
```
