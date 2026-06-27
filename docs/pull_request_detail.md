## Revisores

- RodrigoMardones

## Cambios

- Declara skills y MCP en la config del harness: bloque opcional `discovery {skills, mcp}` en `harness.config.schema.json` y en el `config` de `feature_list.schema.json` (con `additionalProperties:false`, fuera de `required`) y en las plantillas, con el sentinel `{skills:[],mcp:[]}`.
- Agrega `handyman/scripts/tools_discovery.py` (contraparte determinista del descubrimiento semántico) con `list`, `find <keyword>` y `check` del bloque `discovery` contra el disco.
- Valida los MCP declarados contra el manifiesto on-disk de VS Code `.vscode/mcp.json` mediante un registro extensible `MCP_CONFIG_SOURCES` (declara vscode, abierto a nuevos hosts): un MCP configurado da `ok`, uno ausente da un NOTE no bloqueante (provisto por el host), y se anota el configurado-pero-no-declarado.
- Resuelve las raíces de skills local primero y luego global (`.agents/skills`, `.claude/skills`, `.github/skills` del proyecto antes que las globales `~/...`), de modo que una skill local sombrea a la global homónima; `--skills-dir` sigue siendo un override literal.
- Agrega el advisory no bloqueante `check_tools_discovery()` en `init.template.sh` (avisa cuando no hay skills ni MCP declarados, nunca altera el `EXIT_CODE`).
- Incorpora el harness de evaluaciones del modelo: schema `trigger_eval.schema.json`, `handyman/scripts/evals.py` con `validate` (contrato offline) y `measure` (medición online con varianza y matriz de confusión, degrada con NOTE sin runner), y el advisory `check_evals()` en `init.template.sh`.
- Agrega documentación de entrega: `handyman/references/discovery.md` y `handyman/references/evals.md` (con alta en `references/README.md`), un paso "Description Trigger Gate" en `workflow.md` y el enlace de `Tools>skills` del feature-request con el set declarado.
- Agrega los documentos de investigación `docs/analisis-tool-discovery.md` y `docs/analisis-tests-evaluaciones-modelo.md`.
- Agrega la configuración de VS Code `.vscode/mcp.json` y `.vscode/settings.json`.
- Agrega las suites `tests/test_tools_discovery.sh` (9 casos) y `tests/test_evals.sh` (7 casos), las cablea en `tests/run_tests.sh` y amplía `tests/test_docs.py`.

## Tarea o asunto asociado

- feat/MCP-Revision

## Evidencia del cambio

- `bash tests/run_tests.sh`: ALL SUITES PASSED (docs 142, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10, tools-discovery 9, evals 7).
- `./init.sh`: VERIFIER: all gates passed (exit 0); shellcheck limpio.
