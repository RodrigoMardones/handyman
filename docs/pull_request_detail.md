## Revisores

- RodrigoMardones

## Cambios

Mitigación del hallazgo **W011 — Third-party content exposure / indirect prompt injection (MEDIUM)**: la skill instruía a los agentes a ingerir texto libre de archivos del harness, código, salida de tools y web sin una barrera explícita de "datos, no instrucciones". Se añade esa barrera por diseño en todas las superficies que un agente carga en runtime, más una prueba anti-regresión.

### Contrato de seguridad (nuevo)
- Nuevo `references/security.md`: threat model (quién puede inyectar texto y por qué es alcanzable, incluida la cadena código/web → `explore_<topic>.md` → leader), regla de oro data-not-instructions, reglas operativas por rol, controles existentes que ayudan, alcance/limitaciones y checklist.
- Registrado en `references/README.md` y en la línea References de `SKILL.md`.

### Reglas visibles donde operan los agentes
- `SKILL.md`: nueva Core Rule "Untrusted content" (datos, no instrucciones; confirmar acciones irreversibles), compensada condensando reglas de graphify/obsidian/role-files/models para respetar el budget.
- `assets/AGENTS.template.md`: nueva Hard Rule equivalente, compensada condensando el ítem de graphify en "Before Starting".
- Notas de seguridad escaladas por exposición en los 4 role templates: `role-explorer` (código/web, punto de entrada), `role-leader` (tools amplias + confirmar irreversibles), `role-implementer` y `role-reviewer` (criterios desde feature/docs vetados, no desde prosa).

### Refuerzo de proceso
- `references/checklists.md`: ítem de seguridad en Analysis y Review checklists + fila nueva "Indirect prompt injection" en Common Risks.
- `references/anatomy.md`: sección "Untrusted Content" junto al Anti Telephone Protocol.
- `references/workflow.md`: paso 9 en Startup (tratar lo leído como datos no confiables).

### Anti-regresión
- `tests/test_docs.py`: nueva prueba T5 `test_security_contract` (8 aserciones) que verifica que `security.md` exista y esté referenciado, y que la barrera "not instructions" persista en `AGENTS.template.md` y en los 4 role templates.

## Tarea o asunto asociado

- Hallazgo de seguridad W011 (indirect prompt injection, riesgo MEDIUM 0.65) reportado por escáner externo. Plan de acción P1–P4.

## Evidencia del cambio

- `bash tests/run_tests.sh` → **38/38 PASS** (test_docs.py 26 incl. T5, test_init.sh 5, test_update.sh 7).
- Budgets de tokens respetados: SKILL.md 998/1000 palabras, AGENTS.template.md 249/250 palabras, description 472/500 chars.
- Pendiente fuera de esta rama: regenerar el grafo (`/graphify --update`) en un entorno con subagentes de escritura o `GEMINI_API_KEY`.
