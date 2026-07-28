---
type: Implementation Log
feature: src_comment_memory_drift
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/src_comment_memory_drift]
---

# Implementation Report: src_comment_memory_drift

## Files Changed

- `handyman/src/sprint.ts` — 3 comentarios actualizados a `memory/sprints/sprint.<ID>.md`:
  cabecera de uso (`close`, linea 18), comentario de SPRINT_ID (linea 58) y
  el texto del usage impreso (linea 478).
- `handyman/src/core/schema.ts:79` — docstring de `validateSprint` a
  `memory/sprints/sprint.<ID>.md` con nota legacy explicita (`the legacy
  pre-F73 path was docs/sprints/`).

## Design Notes

- Cero cambio de comportamiento: solo comentarios/docstrings (el runtime ya
  escribe `memory/sprints/` via `resolveDocsDir` y
  `assets/schemas/sprint.schema.json` ya describia memory/).
- La unica ocurrencia restante de `docs/sprints` en src/ es la nota legacy
  deliberada de schema.ts (grep verificado), como permite el acceptance.

## Test Output

```text
grep "docs/sprints" handyman/src/: solo la nota legacy de schema.ts
pnpm --filter handyman-harness build (tsc -b): OK
./init.sh → exit 0 (verificado en feature.js done)
```
