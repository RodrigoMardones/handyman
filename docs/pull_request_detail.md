## Revisores

- RodrigoMardones

## Cambios

Promueve el borrador `prompt-example.md` a un asset de primera clase del harness: un formulario de solicitud formal para pedir **una feature nueva** y ejecutarla por su ciclo (sembrar en `feature_list.json` → `in_progress` → implementar → revisar → cerrar con verifier verde). El formulario es **opcional**: no gatea el verifier y no rompe harnesses existentes.

### Nuevo asset
- Nuevo `assets/feature-request.template.md`: intro + plantilla en blanco + ejemplo trabajado + tabla de mapeo sección→concepto del harness. Escrito en inglés para alinear con el resto de `assets/`.
- Se elimina el borrador `prompt-example.md` de la raíz (su contenido vive ahora en el asset).

### Cableado en todas las superficies
- `scripts/scaffold.sh`: copia el formulario a `$HARNESS_WORKSPACE/feature-request.md` (junto a `feature_list.json`), igual que `index.md`.
- `references/templates.md`: nueva sección que lo documenta como intake opcional, no como gate del verifier.
- `references/workflow.md`: paso del Leader Protocol para ofrecer el formulario y convertirlo en la feature.
- `assets/index.template.md`: link al formulario en el MOC de Obsidian (## State).
- `SKILL.md`: mención en "Run one feature" (`offer the feature-request.md form`).
- `assets/AGENTS.template.md`: fila en el Repository Map (`drafting a task`).

### Respeto de budgets de tokens
- Las menciones en superficies con tope se compensaron con recortes equivalentes para no exceder los caps (SKILL.md ≤1000, AGENTS.template.md ≤250).

## Tarea o asunto asociado

- Formaliza las solicitudes de trabajo del harness con una plantilla definida y reutilizable. Sin ticket asociado.

## Evidencia del cambio

- `bash tests/run_tests.sh` → **38/38 PASS** (test_docs.py 26, test_init.sh 5, test_update.sh 7).
- Budgets respetados: SKILL.md 999/1000 palabras, AGENTS.template.md 249/250 palabras, description 472/500 chars.
- Smoke test de scaffold: `feature-request.md` se copia correctamente en `$HARNESS_WORKSPACE` tras `scripts/scaffold.sh local`.
- Pendiente fuera de esta rama: regenerar el grafo (`/graphify --update`) en un entorno con subagentes de escritura o `GEMINI_API_KEY`.
