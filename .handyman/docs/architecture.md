# Architecture

Define que es "buen trabajo" en este repo. Los reviewers evaluan el codigo contra esto.

> **Runtime (Node/TypeScript):** la migracion desde Python + Bash esta
> **completada**. Todos los CLIs viven en `handyman/src/*.ts` y corren como
> `node handyman/dist/<x>.js`; `handyman/scripts/` conserva solo `scaffold.sh`.
> Los invariantes de abajo son *runtime-agnosticos* y se sostienen igual. La
> superficie CLI (subcomandos, flags, exit codes, stdout) es sagrada y esta
> protegida por suites black-box de paridad byte-a-byte (`tests/test_*.sh`).

## Principles

1. **Capas.**
   - **CLI (entrypoints):** cada `handyman/src/*.ts` es un entrypoint delgado; parsea
     argumentos (paridad con `argparse`), llama a la logica y traduce a exit code +
     salida estable. Se ejecutan como `node handyman/dist/<x>.js`.
   - **Core compartido:** `handyman/src/core/` concentra los helpers reutilizados
     (resolucion de `HARNESS_WORKSPACE`, carga/validacion de `feature_list.json`,
     IO byte-identica, `unifiedDiff` equivalente a `difflib`, frontmatter). Es
     importado por todos los CLIs; la ubicacion de los role files vive en
     `core/workspace.ts` (`PLATFORM_ROLE_DIRS`).
   - **Datos/plantillas:** `handyman/assets/` (templates + `schemas/*.json`) son datos,
     no codigo. Los JSON Schema son la fuente de verdad del contrato de estado.
   - **Observador (toolBox):** `handyman/src/toolbox*.ts` + `assets/toolbox_panel.js`
     exponen un panel web local read-only sobre el registro de harnesses
     (`node dist/toolbox.js serve`); los writes siguen en los CLIs de rol.
2. **Politica de dependencias.** Minimalismo agresivo: solo stdlib de Node +
   `ajv` (validacion de los mismos JSON Schema) + las deps de UI del observador
   (`marked`, `dompurify`, `minisearch`, `vis-network` servidas como UMD desde
   `node_modules`). Toda dep nueva requiere justificacion explicita.
3. **Errores explicitos.** Cada CLI expone un contrato de exit code estable
   (convencion: `0` ok, `1` error, `2` usage, `3` sin trabajo listo en `ready`). Los
   mensajes van a stderr; la salida machine-readable va a stdout con forma estable
   (p.ej. ultima linea `status: ok|warn|error`, o payload `--json`). **Este contrato
   es sagrado: ningun cambio puede alterar exit codes ni la forma de salida.**
4. **Politica de datos.** `feature_list.json` es una maquina de 4 estados
   (`pending`/`in_progress`/`done`/`blocked`) validada contra
   `assets/schemas/feature_list.schema.json` con `additionalProperties:false`. A lo
   sumo una feature `in_progress`. Escrituras deterministas y estables (indentacion,
   orden de claves, newline final) para que los tests black-box no rompan.
5. **Politica de IO.** Toda mutacion de estado pasa por un CLI (`feature.js`,
   `sprint.js`, `backlog.js`), nunca por edicion a mano. El scaffold es determinista y
   nunca sobreescribe. Los role files viven en la ruta de plataforma
   (`.claude/agents/` o `.github/agents/`), nunca dentro de `HARNESS_WORKSPACE`.

## Data Flow

Invocacion CLI (`node dist/<x>.js`) -> resolucion de `PROJECT_ROOT` /
`HARNESS_WORKSPACE` (config -> feature_list config -> `.handyman/` -> fallback) ->
carga + validacion de estado (ajv contra `assets/schemas`) -> operacion atomica sobre
`feature_list.json` / `progress/` / `backlog/` -> salida machine-readable (stdout) +
exit code. Toda mutacion de estado pasa por un CLI (`feature.js`, `sprint.js`,
`backlog.js`), nunca por edicion a mano. El verificador (`init.sh`) orquesta
`validate -> lint -> build -> test` y compuerta el cierre.

## Intake y toolBox

- **Intake.** La peticion de una feature nace como `feature-request.md` (plantilla
  `assets/feature-request.template.md`), ya sea redactada a mano o asistida por el
  toolBox (`POST /api/draft` arma el prompt con plantilla + contexto del harness y lo
  retransmite por SSE; `POST /api/intake` persiste el draft revisado en
  `feature-request.md`); `node dist/feature.js add` la convierte en entrada de
  `feature_list.json`.
- **Observador.** `node dist/toolbox.js serve` publica un panel read-only atado a
  `127.0.0.1`: snapshots + señales + cola de features + timeline (`/api/state`),
  corpus para el BM25 en el cliente (`/api/corpus`), disponibilidad de proveedores
  LLM (`/api/providers`), markdown quick-view (`/api/md`), grafo graphify
  (`/graph/<name>/...`), feed SSE (`/events`) y la vista `#/intake`. La unica ruta
  que escribe disco es `POST /api/intake`; el resto es lectura.
- **Timestamps.** `feature.js start` sella `meta.started_at` (ISO 8601) y
  `feature.js done` sella `meta.done_at`; el cierre de sprint registra `closed_at`.
  Estos timestamps enriquecen las metricas del observador (throughput, verdicts).

## What Not To Do

- Cambiar el contrato de un CLI (subcomandos, flags, exit codes, forma de stdout) sin
  actualizar su test oracle **y** todas las referencias en `SKILL.md` / `references/`.
- Editar `feature_list.json` a mano o introducir claves fuera del schema.
- Hacer que el leader o el reviewer editen codigo de producto.
- Introducir una dependencia externa evitable (preferir stdlib / plataforma).
- Migrar un script a TS sin dejar verde su suite black-box existente (paridad).
- Requerir un runtime de JS para correr el **verificador** en repos destino (ver conventions).
