# @handyman/mastra-handyman — agente handyman sobre Mastra

Agente handyman corriendo sobre el runtime **Mastra 1.x** (`@mastra/core`
1.53.0): un leader supervisor que orquesta subagentes `implementer`/`reviewer`
y conduce el harness handyman a través de su servidor MCP, ejecutando el ciclo
completo de un feature (`add → start → impl → review → close`). Nació de
`docs/spike-mastra-harness.md` (fases 0–2 ejecutadas; 3 y 4 pendientes) como
sucesor del spike con Flue (`agents/flue-handyman/`).

## Topología

```
run-feature.ts (tsx, in-process) ──> Mastra app (agente handyman-leader)
                                          │ MCPClient (streamable-http)
                                          ▼
                            handyman MCP server :8177  (node handyman/dist/mcp.js --http)
                                          │ shell-out a dist/feature.js --root <PROJECT>
                                          ▼
                            <PROJECT>/.handyman/feature_list.json  (+ verifier init.sh)
```

- **In-process (topología A del spike)**: sin servidor Mastra; el driver importa
  la app y llama `agent.generate()`. Ideal para spike y CI.
- Modelo por rol vía env (ver abajo); ambos providers hablan protocolo
  Anthropic con baseURL propia **con `/v1` final** (AI SDK pega
  `${baseURL}/messages`; sin el `/v1` Z.AI devuelve 404 disfrazado de 200).
- **Un thread por feature, un resource por proyecto** (memoria conversacional
  en LibSQL): reemplaza el patrón "una instancia de agente por feature" de
  Flue. El `Agent` es una definición stateless; el aislamiento vive en
  thread/resource.
- El proyecto objetivo se elige con `HANDYMAN_PROJECT_ROOT` (default: la raíz
  del monorepo; para spikes, un scratch como `/tmp/hm-mastra-sup1`).

## Cómo ejecutar

```bash
# 0. Dependencias (una vez, desde la raíz del monorepo)
pnpm install

# 1. Proyecto scratch con verifier trivial (exit 0) — solo para pruebas
mkdir -p /tmp/hm-mastra-spike
bash handyman/scripts/scaffold.sh local /tmp/hm-mastra-spike spike-project
#    (sustituir /tmp/hm-mastra-spike/init.sh por un `exit 0` trivial)

# 2. Servidor MCP handyman (desde la raíz)
node handyman/dist/mcp.js --http --port 8177

# 3. Ejecutar el ciclo de un feature (desde agents/mastra-handyman)
set -a && . ../../.env && set +a
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-feature -- <nombre_feature>
```

## Decisiones de diseño (y por qué)

- **Barrel anti-volatilidad** (`src/mastra/index.ts`): único importador de
  `@mastra/*` y `@ai-sdk/*` del paquete. Mastra publica 2–4 minors/semana y ha
  roto superficies nuevas post-1.0 (rename `Harness`→`AgentController` en
  1.47.0); la adaptación toca un solo archivo.
- **El MCP es el anti-corruption layer** (inalterado del ADR Flue): los 25
  tools son comandos de aplicación; el modelo propone y el CLI dispone. Las
  reglas de negocio jamás viven en prompts sin enforcement en código.
- **Tool sets por rol en código** (`src/domain/role-tools.ts`): leader = las
  25; implementer = probes read-only + `feature_log` + `report_write`;
  reviewer = probes + `backlog_review`. Un reviewer NO PUEDE mutar estado:
  las tools no existen para su perfil (test unitario enforced).
- **Aislamiento de subagentes**: `delegation.messageFilter: () => []` — cada
  delegación ve solo su task prompt, nunca el transcript del leader
  (equivalente al `task` de Flue). El reviewer juzga artefactos, no el
  razonamiento del implementer.
- **Memoria de negocio por INYECCIÓN, no por espejo**: `.handyman/memory/*.md`
  sigue siendo la fuente de verdad en disco; se inyecta un snapshot read-only
  en las instrucciones del leader en cada llamada (instrucciones dinámicas).
  No se usa la working memory de Mastra (vive en SU base de datos = segunda
  verdad). La memoria conversacional (threads) sí es de Mastra.
- **Storage compuesto**: LibSQL (memoria/snapshots) + DuckDB (dominio
  observability — LibSQL no soporta métricas) vía `MastraCompositeStore`.
- **Observabilidad**: `Observability` + `MastraStorageExporter` +
  `SensitiveDataFilter` (nunca contenido de mensajes en spans) +
  `requestContextKeys: ['feature']` para correlación por feature. Métricas
  automáticas `mastra_model_*` (tokens in/out/cache, duraciones, costo
  estimado por modelo) consultables en DuckDB.
- **Telemetría JSONL por feature** (`src/ports/telemetry.ts` →
  `logs/agent-<feature>.jsonl`): pista de EJECUCIÓN sanitizada (nombres de
  tools, usage, finishReason; texto como `{ chars }`). `history.md` sigue
  siendo la pista de NEGOCIO. Misma regla que el sink de Flue.
- **Ledger de tokens** (`src/ports/tokens-ledger.ts`): al cerrar el feature,
  una línea en `<PROJECT>/.handyman/metrics/tokens.jsonl` con
  `source: "mastra"` (diseño §2 de `docs/analisis-tokens-consumo-y-metricas.md`;
  best-effort, nunca bloquea).

## Reglas duras de operación

- **Un proceso vivo por data dir**: el store DuckDB toma un lock nativo
  exclusivo (single writer) y el error es FATAL para el run (rechaza el
  stream del modelo, no degrada a "sin métricas"). Para corridas paralelas:
  `HANDYMAN_DATA_DIR=/tmp/dir-único` por proceso.
- **El driver cierra el MCPClient** (`close()`): un MCPClient abierto mantiene
  el event loop vivo y el proceso nunca sale.
- `data/` y `logs/` están gitignored; borrarlos resetea el estado del runtime
  (el estado de negocio handyman NO se toca: vive en el `.handyman/` del
  proyecto target).

## Hallazgos del spike (fases 0–2)

1. **Endpoint Anthropic custom**: `createAnthropic({ baseURL })` debe incluir
   `/v1` (AI SDK pega solo `/messages`). Verificado con curl contra
   `api.z.ai/api/anthropic/v1/messages` y `api.kimi.com/coding/v1/messages`.
2. **Una delegación NO hereda `maxSteps` del leader**: el subagente cae al
   default de 5 y el implementer quedaba cortado antes de `report_write`
   (el leader narraba "reporte escrito" y el disco decía lo contrario —
   mismo síntoma que el `demo_estable` de Flue). Fix en código:
   `defaultOptions.maxSteps: 15` por rol + `onDelegationStart →
   modifiedMaxSteps: 15`, e instrucciones que prohíben probes exploratorios
   al implementer (su presupuesto es para sus DOS escrituras).
3. **Modelo desconocido en el registry**: Mastra no conoce `glm-5.2` y limita
   el output a 4096 tokens con un warning. Fix: `modelSettings:
   { maxOutputTokens: 16384 }` (GLM quema output en thinking).
4. **DuckDB single-writer**: ver regla dura arriba.
5. **MCP streamable-http contra `mcp.ts` funciona sin ajustes**: 25 tools
   como `handyman_<verb>`; sin loop de reconexión GET observado (el caveat
   documentado de MCPClient no se reproduce con nuestro servidor).
6. **El protocolo se sostiene ante estados rotos**: con el scratch sin
   bootstrap, el leader sondeó, detectó la ausencia del harness y pidió
   bootstrap en vez de alucinar el ciclo — en 2 de 3 corridas. En la tercera
   el leader **cambió de proyecto**: descubrió el monorepo vía
   `harness_list` y ejecutó el protocolo completo ahí (feature 98 +
   reportes en el `.handyman/` real). Se limpió quirúrgicamente y se añadió
   la regla HARD STOP al prompt del leader (nunca cambiar de proyecto; las
   probes fleet_* son observación, no fallback). **Deuda estructural:** la
   mitigación real debe ser de código — pinning del proyecto a nivel MCP
   (una sesión MCP por proyecto) o un wrapper de tools que rechace
   `project != PROJECT`; el prompt solo reduce la probabilidad.

## Modelos por rol (multi-provider)

| Rol | Env var | Default |
|---|---|---|
| leader | `HANDYMAN_LEADER_MODEL` | `zai/glm-5.2` |
| implementer | `HANDYMAN_IMPLEMENTER_MODEL` | `zai/glm-5.2` |
| reviewer | `HANDYMAN_REVIEWER_MODEL` | `zai/glm-5.2` |

Providers (`src/ports/model-catalog.ts`): `zai` → Z.AI GLM (protocolo
Anthropic, key `Z_AI_API_KEY`); `kimi-coding` → Kimi for Coding
(`api.kimi.com/coding`, modelos `k2p7`/`k3`, key `KIMI_API_KEY`). Un token de
Kimi for Coding NO es válido en `api.moonshot.ai` (401) — productos distintos.

Ejemplo mixto validado:

```bash
HANDYMAN_IMPLEMENTER_MODEL=kimi-coding/k3 \
HANDYMAN_REVIEWER_MODEL=kimi-coding/k3 \
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-mixed pnpm run-feature -- sup_mixed_kimi
```

## Resultados de validación (2026-07-28)

**Fase 0 (agente plano, spike_mastra_green/red en /tmp/hm-mastra-spike):**

- Verde: ciclo completo en 35s → `done` en disco con `started_at`/`done_at`
  reales, impl + review en backlog, usage capturado (in 42 046 / out 916).
- Roja (verifier exit 1): `feature_close` rechazado, feature queda
  `in_progress`, el agente reporta la denegación textual y para.

**Fase 1 (supervisor + subagentes, 3 corridas + 1 roja):**

| Feature | leader | implementer | reviewer | Estado | impl | review |
|---|---|---|---|---|---|---|
| `sup_loop_1` | GLM-5.2 | GLM-5.2 | GLM-5.2 | `done` | ✓ | ✓ |
| `sup_loop_2` | GLM-5.2 | GLM-5.2 | GLM-5.2 | `done` | ✓ | ✓ |
| `sup_mixed_kimi` | GLM-5.2 | **kimi-coding/k3** | **kimi-coding/k3** | `done` | ✓ | ✓ |
| `sup_red_verifier` (verifier exit 1) | GLM-5.2 | GLM-5.2 | GLM-5.2 | `in_progress` (close rechazado) | ✓ | ✓ |

Las 4 con `validate_harness: OK`; duraciones 75–115s; el ledger se omitió
correctamente en la roja (`[ledger] skipped (feature not done)`).

**Fase 2 (memoria + observabilidad + tokens + telemetría):**

- Thread por feature persistido en LibSQL (`id="sup_mixed_kimi"`,
  `resourceId="project:_tmp_hm-mastra-mixed"`).
- Métricas automáticas en DuckDB por entidad y modelo — la corrida mixta:
  leader glm-5.2 in 45 045 / out 887; implementer k3 in 9 480 / out 789
  (229 reasoning); reviewer k3 in 12 612 / out 668 (237 reasoning).
  Correlación `threadId`/`resourceId`/`runId` verificada en `metric_events`.
- Ledger `tokens.jsonl` con `source:"mastra"`, `scope:"leader"` en las 3
  corridas verdes. **Limitación conocida:** la línea registra solo el uso
  del LEADER (`result.usage`); el total del run (con subagentes) se agrega
  desde `metric_events` por `threadId`/`runId` — en la mixta, ~45k
  registrados vs ~67.6k reales.
- Telemetría `logs/agent-<feature>.jsonl`: secuencia del protocolo
  (`feature_add → feature_start → agent-implementer → agent-reviewer →
  feature_close → stop`) con usage por step, nombres de tools y ningún
  contenido de mensajes. Los pasos INTERNOS del subagente no aparecen en el
  `onStepFinish` del leader (solo la delegación `agent-*`): su detalle vive
  en los spans de DuckDB.

Reporte completo: `.handyman/backlog/impl_mastra_spike_phases_0_2.md`.

## Pendiente (fases 3–4 del spike)

- **Fase 3**: workflow `createWorkflow` con `suspend/resume` para revisión
  humana, crash-recovery demostrado, decisión documentada sobre doble verdad
  (snapshot Mastra vs `feature_list.json`).
- **Fase 4**: `runEvals` en CI con gates deterministas (`checks.toolOrder`,
  `noToolErrors`) + skill handyman como skill nativa Mastra (`Workspace` +
  filesystem); ADR de adopción/rechazo.
