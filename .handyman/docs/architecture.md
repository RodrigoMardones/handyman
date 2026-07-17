# Architecture

Define que es "buen trabajo" en este repo. Los reviewers evaluan el codigo contra esto.

> **Contexto de migracion (activo):** el proyecto migra de **Python + Bash** a
> **TypeScript sobre Bun/Node**. Los invariantes de abajo son *runtime-agnosticos*:
> deben sostenerse igual antes, durante y despues de la migracion. Ver el plan en
> `docs/current/plan-migracion-typescript-bun.md`.

## Principles

1. **Capas.**
   - **CLI (entrypoints):** cada `handyman/scripts/*.py` es un entrypoint delgado con
     argparse; parsea argumentos, llama a la logica y traduce a exit code + salida.
   - **Core compartido:** `validate_harness.py` concentra los helpers reutilizados
     (resolucion de `HARNESS_WORKSPACE`, carga/validacion de `feature_list.json`,
     lectura de config). Es importado por ~7 scripts -> en TS se vuelve `src/core/`.
   - **Datos/plantillas:** `handyman/assets/` (templates + `schemas/*.json`) son datos,
     no codigo. Los JSON Schema son la fuente de verdad del contrato de estado.
2. **Politica de dependencias.** Minimalismo agresivo. Hoy: solo stdlib de Python +
   `jsonschema` (unica dep externa). Objetivo TS: solo lo imprescindible (`ajv` para
   validar los mismos JSON Schema). Toda dep nueva requiere justificacion explicita.
3. **Errores explicitos.** Cada CLI expone un contrato de exit code estable
   (convencion: `0` ok, `1` error, `2` usage, `3` sin trabajo listo en `ready`). Los
   mensajes van a stderr; la salida machine-readable va a stdout con forma estable
   (p.ej. ultima linea `status: ok|warn|error`, o payload `--json`). **Este contrato
   es sagrado: la migracion no puede cambiar exit codes ni la forma de salida.**
4. **Politica de datos.** `feature_list.json` es una maquina de 4 estados
   (`pending`/`in_progress`/`done`/`blocked`) validada contra
   `assets/schemas/feature_list.schema.json` con `additionalProperties:false`. A lo
   sumo una feature `in_progress`. Escrituras deterministas y estables (indentacion,
   orden de claves, newline final) para que los tests black-box no rompan.
5. **Politica de IO.** Toda mutacion de estado pasa por un CLI (`feature.py`,
   `sprint.py`, `backlog.py`), nunca por edicion a mano. El scaffold es determinista y
   nunca sobreescribe. Los role files viven en la ruta de plataforma
   (`.claude/agents/` o `.github/agents/`), nunca dentro de `HARNESS_WORKSPACE`.

## Data Flow

Invocacion CLI (argparse) -> resolucion de `PROJECT_ROOT` / `HARNESS_WORKSPACE`
(config -> feature_list config -> `.handyman/` -> fallback) -> carga + validacion de
estado (schema) -> operacion atomica sobre `feature_list.json` / `progress/` / `backlog/`
-> salida machine-readable (stdout) + exit code. El verificador (`init.sh`) orquesta
`validate -> lint -> build -> test` y compuerta el cierre.

## What Not To Do

- Cambiar el contrato de un CLI (subcomandos, flags, exit codes, forma de stdout) sin
  actualizar su test oracle **y** todas las referencias en `SKILL.md` / `references/`.
- Editar `feature_list.json` a mano o introducir claves fuera del schema.
- Hacer que el leader o el reviewer editen codigo de producto.
- Introducir una dependencia externa evitable (preferir stdlib / plataforma).
- Migrar un script a TS sin dejar verde su suite black-box existente (paridad).
- Requerir un runtime de JS para correr el **verificador** en repos destino (ver conventions).
