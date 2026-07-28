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

## Taxonomía de errores y política de retry

`src/domain/errors.ts` clasifica todo fallo en 3 clases y la clase **decide**
la política (clasificación por contratos estables: `type` snake_case de
FlueError y nombre/status del error del SDK — nunca por `message`):

| Clase | Ejemplos | Política |
|---|---|---|
| `domain_outcome` | verifier rojo en `feature_close`, `feature_add` duplicada, conflicto de veredicto, submission abortada o con retries agotados | **Nunca reintentar**: es un outcome de negocio/terminal. El leader reporta y para |
| `transient_infra` | provider 429/5xx, `HeadersTimeoutError`, `StreamClosedError`, `RuntimeUnavailableError` (drain) | **Reconexión acotada**: re-adjuntar al MISMO admission/stream (el backend sigue trabajando; re-dispatch duplicaría el ciclo) |
| `protocol_error` | `ToolInputValidationError`, `SubagentNotDeclaredError`, `SessionBusyError` | **El modelo corrige**: el error vuelve como tool result y el modelo ajusta su llamada; si escala a humano, es bug nuestro |

Detalles de diseño:

- Los tool results del MCP handyman con `isError` son `domain_outcome` por
  construcción: los CLIs enforcean reglas de negocio, sus rechazos no se
  reintentan (`classifyHandymanToolResult`).
- Fallo desconocido del cliente → `transient_infra` por defecto: los
  hiccups se recuperan, y el budget acotado (5 reconexiones, backoff
  exponencial hasta 15 s en `run-feature.mjs`) impide que un bug real
  reintente para siempre.
- La tabla de errores de cliente vive en `src/domain/client-error-classes.mjs`
  (JS plano) para que el driver standalone y los módulos TS compartan UNA
  fuente de verdad; `errors.ts` la envuelve con tipos.

## Servidor estable (sesiones largas)

`flue dev` es para desarrollo: su watcher **no tolera edits con un run en
vuelo** (`Runtime drain timed out` → estado `failed` hasta reiniciar). Para
corridas largas o desatendidas, usa el servidor compilado:

```bash
pnpm agents:build     # flue build --target node -> agents/flue-handyman/dist/server.mjs
pnpm agents:start     # PORT=3583 node dist/server.mjs (mismo puerto que flue dev)
```

El servidor compilado lee `PORT` (default 3000 upstream); el script lo fija a
3583 para que el driver (`run-feature.mjs`) y los evals apunten al mismo
puerto en ambos modos. Override libre: `PORT=4000 pnpm agents:start`.

- **Durabilidad real**: `src/db.ts` registra `sqlite('./data/flue.db')`
  (descubierto por el build; sin él, SQLite en memoria y todo se pierde al
  salir). Streams de conversación, submissions aceptadas y registros de runs
  sobreviven reinicios del proceso. `data/` está gitignored — borrarla
  resetea el estado del runtime (el estado de negocio handyman NO se toca:
  vive en el `.handyman/` del proyecto target).
- **Recovery tras kill**: mata el proceso a mitad de un ciclo y vuelve a
  `agents:start`; el runtime retoma los streams desde el último paso durable
  (tool calls sin resultado se marcan `interrupted`, no se reejecutan) y el
  disco handyman ya es crash-safe (escritura atómica temp+rename).
- **Abort por feature**: una instancia = una feature (`id` = nombre). Para
  abortar trabajo en vuelo o en cola: `agents.abort('handyman-leader',
  '<feature>')` vía `@flue/sdk` (p.ej. un one-liner con `createFlueClient`).
- **Regla dura**: un proceso vivo por instancia. No levantes dos servidores
  sobre el mismo `data/`; la paralelización es por feature distinta, no por
  réplica.
- Edita código solo con el servidor parado; tras editar, `agents:build` de
  nuevo antes de `agents:start`.

## Telemetría (observe() → JSONL)

`src/ports/telemetry-sink.ts` se suscribe al stream `observe()` del runtime
(un subscriber por proceso, cableado en `src/app.ts`) y escribe:

- **`logs/agent-<instanceId>.jsonl`** — una línea por evento `FlueEvent` v3,
  correlacionado por `instanceId` (= feature). Regla dura de privacidad:
  **nunca contenido de mensajes** — `text_delta`/`thinking_delta`, payloads de
  mensajes y args/results de tools se registran como `{ chars: N }`; solo
  pasan verbatim ids de correlación, escalares seguros (`toolName`,
  `durationMs`, `isError`, `outcome`…) y `usage` (todo numérico).
- **Consola orientada a outcomes** — `submission_settled` (completed → info;
  failed/aborted → warn), `run_end` con error, operaciones fallidas y
  operaciones lentas (>5 min). Las tool calls con error NO van a consola: son
  dato para el modelo (recuperables), no alertas. Es la política recomendada
  por las propias docs de Flue: alertar outcomes, no errores anidados.

`logs/` está gitignored; el dir se puede mover con `HANDYMAN_TELEMETRY_DIR`.
Correlación con la pista de negocio: `instanceId` = feature ↔ entradas de
`history.md` (no se duplica: el JSONL es pista de ejecución, history es pista
de negocio).

## Agente personalizado v1 (leader + subagents)

`src/agents/handyman-leader.ts` implementa el agente handyman personalizado.
Todo import de `@flue/*` pasa por la capa anti-volatilidad `src/flue/index.ts`
(único importador del paquete; la excepción documentada es `run-feature.mjs`,
driver `.mjs` sin build): cuando la API 1.0 de Flue rompa la superficie beta,
la adaptación toca un solo archivo.

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

Cada rol resuelve su modelo en `src/ports/model-catalog.ts` (único módulo que
conoce endpoints, env keys y tuning por provider; `app.ts` solo llama
`registerModelProviders()` y el agente `resolveRoleModels()`):

| Rol | Env var | Default |
|---|---|---|
| leader | `HANDYMAN_LEADER_MODEL` | `anthropic/glm-5.2` |
| implementer | `HANDYMAN_IMPLEMENTER_MODEL` | `anthropic/glm-5.2` |
| reviewer | `HANDYMAN_REVIEWER_MODEL` | `anthropic/glm-5.2` |

Providers configurados (ver `src/ports/model-catalog.ts`):

- **`anthropic` (override)** → Z.AI (`api.z.ai/api/anthropic`), key `Z_AI_API_KEY`. Sirve GLM-5.2.
- **`kimi-coding` (catálogo, solo apiKey)** → Kimi for Coding (`api.kimi.com/coding`,
  protocolo anthropic-messages). Key `KIMI_API_KEY`.
  Modelos: `k2p7` (K2.7 Code), `k3`.
- **Moonshot plataforma (`moonshotai`/`moonshotai-cn`): NO configurado** en este
  deployment. Ojo: un token de **Kimi for Coding NO es válido** en
  `api.moonshot.ai` (401) — son productos y endpoints distintos; si se necesita
  plataforma, registrar el provider explícitamente con su propia key.

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
