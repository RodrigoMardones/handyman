# Spike: Flue ↔ handyman MCP

Prueba de concepto mínima: un agente Flue (`handyman-leader`) conduce el
harness handyman a través de su servidor MCP, ejecutando el ciclo completo de
un feature de juguete (`add → start → log → close`) sobre un proyecto scratch
en `/tmp/hm-flue-spike`.

## Topología

```
run-spike.mjs (@flue/sdk)  ──HTTP──>  flue dev :3583  (agente handyman-leader)
                                            │ connectMcpServer('handyman', { url: ':8177/mcp' })
                                            ▼
                              handyman MCP server :8177  (node handyman/dist/mcp.js --http)
                                            │ shell-out a dist/feature.js --root /tmp/hm-flue-spike
                                            ▼
                              /tmp/hm-flue-spike/.handyman/feature_list.json  (+ verifier init.sh)
```

- Modelo: `anthropic/glm-5.2` — override del provider de catálogo `anthropic`
  apuntando a `https://api.z.ai/api/anthropic` (Z.AI sirve GLM-5.2 solo por
  protocolo Anthropic). Ver `src/app.ts`.
- `thinkingLevel: 'minimal'` + `maxTokens: 16384`: GLM consume max_tokens en
  thinking antes de emitir texto; con los defaults el agente respondía vacío.
- Una instancia de agente por feature: el instance id ES el nombre del feature.

## Cómo reproducir

```bash
# 1. Proyecto scratch con verifier trivial (exit 0)
bash handyman/scripts/scaffold.sh local /tmp/hm-flue-spike spike-project
#    (sustituir /tmp/hm-flue-spike/init.sh por un `exit 0` trivial)

# 2. Servidor MCP handyman
node handyman/dist/mcp.js --http --port 8177

# 3. Runtime Flue (carga Z_AI_API_KEY del .env raíz)
cd spikes/flue-handyman && npm install
set -a && . ../../.env && set +a && npx flue dev

# 4. Ejecutar el ciclo de un feature
node run-spike.mjs <nombre_feature>
```

## Resultados (2026-07-27)

- **Caso verde:** `spike_flue_integration` — el agente ejecutó las 4 tools MCP
  en orden; `feature_list.json` terminó en `done` con `meta.started_at/done_at`
  reales y entrada en `history.md` ("verifier exit 0"). Validado en disco, no
  por el reporte del modelo.
- **Caso rojo (gate):** con `init.sh` en `exit 1`, `feature_close` fue
  rechazado (`closed: false`, "verifier failed (exit 1)") y
  `spike_red_verifier` quedó `in_progress` — el enforcement vive en el código
  de handyman, no en la obediencia del modelo. Tras restaurar el verifier se
  cerró por CLI.
- `validate_harness --root /tmp/hm-flue-spike`: OK.

## Hallazgos para la integración

1. El servidor MCP de handyman encaja directo con `connectMcpServer` (transporte
   streamable-http, path `/mcp`); las 25 tools aparecen como `mcp__handyman__*`.
2. El verifier-gate se hereda gratis: Flue no necesita reimplementarlo.
3. GLM necesita `thinkingLevel` bajo y `maxTokens` generoso para tool loops.
4. El patrón instancia-por-feature (`agents.prompt('handyman-leader', feature, ...)`)
   funciona y da aislamiento de conversación por feature.
5. Pendiente: evals con `vitest-evals` y mock de modelo vía
   `registerProvider({ baseUrl })` → `tests/lib/mock_openai.js` (no probado aquí).
