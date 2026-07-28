# @handyman/flue-handyman — agente handyman sobre Flue

Agente handyman personalizado corriendo sobre el Flue runtime: un leader que
orquesta subagents `implementer`/`reviewer` y conduce el harness handyman a
través de su servidor MCP, ejecutando el ciclo completo de un feature
(`add → start → impl → review → close`). Nació como spike (resultados abajo) y
hoy es un paquete del workspace pnpm (`agents/*`).

## Topología

```
run-feature.mjs (@flue/sdk) ──HTTP──> flue dev :3583  (agente handyman-leader)
                                           │ connectMcpServer('handyman', { url: HANDYMAN_MCP_URL })
                                           ▼
                             handyman MCP server :8177  (node handyman/dist/mcp.js --http)
                                           │ shell-out a dist/feature.js --root <PROJECT>
                                           ▼
                             <PROJECT>/.handyman/feature_list.json  (+ verifier init.sh)
```

- Modelo por rol vía env (ver "Modelos por rol" más abajo); el provider
  `anthropic` se sobreescribe a `https://api.z.ai/api/anthropic` (Z.AI sirve
  GLM-5.2 solo por protocolo Anthropic). Ver `src/app.ts`.
- `thinkingLevel: 'minimal'` + `maxTokens: 16384`: GLM consume max_tokens en
  thinking antes de emitir texto; con los defaults el agente respondía vacío.
- Una instancia de agente por feature: el instance id ES el nombre del feature.
- El proyecto objetivo se elige con `HANDYMAN_PROJECT_ROOT` (default: la raíz
  del monorepo; para spikes, un scratch como `/tmp/hm-flue-spike`).

## Cómo ejecutar

```bash
# 0. Dependencias (una vez, desde la raíz del monorepo)
pnpm install

# 1. Proyecto scratch con verifier trivial (exit 0) — solo para pruebas
bash handyman/scripts/scaffold.sh local /tmp/hm-flue-spike spike-project
#    (sustituir /tmp/hm-flue-spike/init.sh por un `exit 0` trivial)

# 2. Servidor MCP handyman (desde la raíz)
node handyman/dist/mcp.js --http --port 8177

# 3. Runtime Flue (carga las keys del .env raíz; apunta al scratch)
cd agents/flue-handyman
set -a && . ../../.env && set +a
HANDYMAN_PROJECT_ROOT=/tmp/hm-flue-spike npx flue dev
#    o desde la raíz: pnpm agents:dev (con las env exportadas antes)

# 4. Ejecutar el ciclo de un feature
node run-feature.mjs <nombre_feature>     # o: pnpm agents:run -- <nombre>
```

## Evals (vitest-evals)

Suite viva sobre la frontera HTTP pública del agente (`src/evals/`), siguiendo
el blueprint `flue add tooling vitest-evals` con dos adaptaciones: `send`+`wait`
en vez de `prompt` bloqueante, y aserciones de verdad en disco (el
`feature_list.json` del scratch), no solo en la prosa del modelo.

```bash
# con MCP :8177 y flue dev :3583 arriba (HANDYMAN_PROJECT_ROOT=/tmp/hm-flue-spike)
cd agents/flue-handyman && pnpm evals        # o evals:json para reporte JSON
```

Casos (`src/evals/handyman-leader.eval.ts`, ~8 min, coste de API real):

1. **Camino verde** — el loop cierra con la secuencia MCP completa
   (`feature_add` < `feature_start` < `feature_close`, 5 tools) y el feature
   queda `done` en disco.
2. **Verifier en rojo** — con `init.sh` en `exit 1`, el close es rechazado, el
   feature queda `in_progress` y el leader reporta la denegación; el cleanup
   restaura el verifier y cierra el feature por CLI.

Última corrida: 2/2 verdes (483 s, ~86k tokens). Sin jueces de modelo por
ahora (aserciones deterministas); `toSatisfyJudge` con juez independiente es
el siguiente paso natural.

## Agente personalizado v1 (leader + subagents)

`src/agents/handyman-leader.ts` implementa el agente handyman personalizado:

- **Leader** (`defineAgent`): instrucciones = cuerpo de
  `handyman/assets/role-leader.template.md` + protocolo concreto MCP
  (`feature_add → feature_start → delegar implementación → delegar review →
  feature_close` solo si el reviewer aprueba).
- **Implementer** y **reviewer** (`defineAgentProfile`): prompts de rol desde
  las mismas plantillas del repo (single source of truth: los roles siguen
  siendo prompts, como dicta la filosofía handyman), cada uno con las tools
  MCP. La delegación usa el tool `task` built-in de Flue (sesión hija sin
  transcript del padre — aislamiento de contexto por rol).
- Las plantillas se leen del repo en el initializer (fs), no se copian:
  un cambio en `assets/role-*.template.md` cambia el comportamiento del agente.

## Modelos por rol (multi-provider)

Cada rol resuelve su modelo de una env var al arrancar `flue dev`:

| Rol | Env var | Default |
|---|---|---|
| leader | `HANDYMAN_LEADER_MODEL` | `anthropic/glm-5.2` |
| implementer | `HANDYMAN_IMPLEMENTER_MODEL` | `anthropic/glm-5.2` |
| reviewer | `HANDYMAN_REVIEWER_MODEL` | `anthropic/glm-5.2` |

Providers configurados (ver `src/app.ts`):

- **`anthropic` (override)** → Z.AI (`api.z.ai/api/anthropic`), key `Z_AI_API_KEY`. Sirve GLM-5.2.
- **`kimi-coding` (catálogo, solo apiKey)** → Kimi for Coding (`api.kimi.com/coding`,
  protocolo anthropic-messages). Key `KIMI_API_KEY` con fallback a `MOONSHOT_API_KEY`.
  Modelos: `k2p7` (K2.7 Code), `k3`.
- **`moonshotai` / `moonshotai-cn` (catálogo)** → plataforma Moonshot, key
  `MOONSHOT_API_KEY`. Modelos `kimi-k2.5`…`kimi-k3`. Ojo: un token de
  **Kimi for Coding NO es válido aquí** (401 en api.moonshot.ai) — son productos
  y endpoints distintos.

Ejemplo mixto validado:

```bash
HANDYMAN_LEADER_MODEL=anthropic/glm-5.2 \
HANDYMAN_IMPLEMENTER_MODEL=anthropic/glm-5.2 \
HANDYMAN_REVIEWER_MODEL=kimi-coding/k2p7 \
npx flue dev
```

## Resultados (2026-07-27)

**Modelos por rol (multi-provider):**

| Feature | leader | implementer | reviewer | Estado final |
|---|---|---|---|---|
| `model_config_glm` | GLM-5.2 | GLM-5.2 | GLM-5.2 | `done` (plumbing env→config→runtime) |
| `mixed_reviewer_kimi` | GLM-5.2 | GLM-5.2 | ~~moonshotai/kimi-k2.6~~ | **bloqueado**: 401 ×3 en la delegación; el leader se negó a cerrar sin veredicto y a auto-firmar la review — el gate de protocolo aguantó |
| `mixed_reviewer_kimi_coding` | GLM-5.2 | GLM-5.2 | **kimi-coding/k2p7** | `done` — review `approved` por Kimi (evidencia A/B: único cambio = provider del reviewer) |
| `mixed_k3_impl_review` | GLM-5.2 | **kimi-coding/k3** | **kimi-coding/k3** | `done` — Kimi en los roles pesados; ~34% más rápido que la corrida k2p7 (234s vs 357s) |

**Agente v1 (leader + subagents implementer/reviewer), 3 corridas validadas en disco:**

| Feature | add→start | task→implementer | task→reviewer | close | Estado final |
|---|---|---|---|---|---|
| `flue_subagent_loop` | ok | impl `implemented` | `approved` | verifier exit 0 | `done` |
| `flue_subagent_loop_2` | ok | impl `implemented` | `approved` | verifier exit 0 | `done` |
| `flue_subagent_loop_3` | ok | impl `implemented` | `approved` | verifier exit 0 | `done` |

Las 3 con `validate_harness: OK` y 0 features `in_progress` al terminar.

**Spike inicial (agente plano, sin subagents):**

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
5. **Runs largos:** no usar `agents.prompt` (bloqueante; muere con
   `HeadersTimeoutError` ~300 s en loops con delegación) sino `agents.send` +
   `agents.wait` — y ojo: `wait` resuelve `{ text, usage, model }` plano, no el
   envelope `{ result }` de `prompt`. El backend continúa aunque el cliente muera
   (Durable Streams: la conexión observa, no posee).
6. **`flue dev` no tolera edits con un run en vuelo**: el watcher intenta drenar
   el runtime activo (`Runtime drain timed out after 30000ms`) y queda en estado
   `failed` hasta reiniciar. Editar solo sin runs activos, o usar
   `flue build` + `node dist/server.mjs` para sesiones estables.
7. La delegación leader→subagent (`task`) aísla el transcript del subagente:
   el reviewer no ve el razonamiento del implementer, solo lo que el leader le
   pasa — útil para independencia de revisión, pero el leader debe incluir el
   contexto necesario en el texto de la tarea.
8. Pendiente: evals con `vitest-evals` y mock de modelo vía
   `registerProvider({ baseUrl })` → `tests/lib/mock_openai.js` (no probado aquí).
