## Revisores

- RodrigoMardones

## Cambios

### Nueva capa `docs/business.md`
- Nuevo template `assets/docs-business.template.md` (Domain, Stakeholders, Use Cases, Out Of Scope, Glossary).
- Cableado en `scripts/scaffold.sh`: el scaffold ahora crea `docs/business.md` en el harness.
- Añadido como doc core requerido en el verificador (`tests/fixtures/init.reference.sh`) y en la fixture de tests (`tests/test_init.sh`).
- Documentado en toda la superficie que enumera el set de docs: `references/anatomy.md`, `references/templates.md`, `references/checklists.md`, `references/obsidian.md`, `references/examples.md`, `references/workflow.md`, `assets/AGENTS.template.md`, `assets/index.template.md`, `README.md` y `SKILL.md`.

### Harness local abstracto vía `.gitignore`
- `assets/obsidian.gitignore.template` renombrado a `assets/harness.gitignore.template`.
- Nuevo contenido: `.handyman/*` + `!.handyman/docs/` (versiona SOLO la capa de docs; el estado operativo queda fuera de git) + `.obsidian/` y `.trash/`. Patrón validado con git real.
- Guía actualizada en `SKILL.md`, `README.md`, `references/templates.md`, `references/obsidian.md`, `references/checklists.md` y `references/anatomy.md`.

## Tarea o asunto asociado

- Iteración de feature: business layer + harness abstracto del proyecto.

## Evidencia del cambio

- `bash tests/run_tests.sh` → **30/30 PASS** (test_docs.py 18, test_init.sh 5, test_update.sh 7).
- Budgets de tokens respetados: SKILL.md 995/1000 palabras, AGENTS.template.md 249/250 palabras, description 472/500 chars.
- Patrón gitignore verificado en repo temporal: solo `.handyman/docs/*` tracked; `feature_list.json`, `progress/`, `backlog/`, `index.md` y `.obsidian/` ignorados.
