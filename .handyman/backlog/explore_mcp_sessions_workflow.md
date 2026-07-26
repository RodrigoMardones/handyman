---
type: Explore Report
topic: mcp_sessions_workflow
role: explorer
updated: 2026-07-26
tags: [handyman/role/explorer]
---

# Exploration: manejo de sesiones MCP aplicado al workflow del harness

## Question

¿Qué capacidades de gestión de sesiones del Model Context Protocol (spec y casos de uso reales) pueden mejorar el flujo leader/implementer/reviewer de Handyman, dado que el harness ya es MCP-first?

## Findings

### Estado del arte: sesiones en MCP

| Mecanismo | Desde spec | Qué aporta |
|-----------|-----------|------------|
| stdio | 2024-11-05 | La sesión **es** el proceso: estado en RAM del subprocess, un solo cliente, muere con el cliente. Imposible de escalar/compartir (causa raíz de la mayoría de fallos de scaling reportados). |
| Streamable HTTP + `Mcp-Session-Id` | 2025-03-26 | Servidor asigna session id en `initialize`; el cliente lo reenvía en cada request; terminación explícita vía HTTP DELETE. Multi-cliente real. |
| Resumabilidad `Last-Event-ID` | 2025-03-26 | Si el stream SSE se rompe, el cliente reconecta con GET + `Last-Event-ID` y el servidor re-reproduce eventos (patrón `EventStore`, típicamente Redis/Valkey en despliegues multi-instancia). |
| Regla del 404 | 2025-03-26 | 404 a un request con session id → el cliente **debe** re-inicializar sesión nueva. LibreChat tuvo un bug real por ignorarlo ([issue #11868](https://github.com/danny-avila/LibreChat/issues/11868)). |
| Elicitation | 2025-06-18 | El servidor pide input al humano *en medio* de una tool call → human-in-the-loop nativo. |
| Tasks (async) | 2025-11-25 | "Call-now, fetch-later" para operaciones largas; **las tasks persisten entre reconexiones de sesión**. |
| Memoria persistente como patrón | literatura | Los resources MCP se clasifican como memoria episódica (historial), semántica (conocimiento estructurado) y procedural (secuencias de acción) ([arXiv 2504.21030](https://arxiv.org/html/2504.21030v1)). El patrón "handoff document" (CONTEXT.md/HANDOFF.md con resume points + health checks) ya existe como producto ([mcpmarket](https://mcpmarket.com/tools/skills/claude-code-handoff)). |

Fuentes principales: [spec oficial transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [state of the art MCP](https://dontfail.is/state-of-the-art-mcp-and-agentic-protocols-the-complete-map-for-builders/), [jsmanifest SDK v2](https://jsmanifest.com/mcp-sdk-v2-streamable-http-session-resumption), [Hitchhiker's Guide to MCP](https://github.com/seuros/action_mcp/blob/master/The_Hitchhikers_Guide_to_MCP.md), [mcp-server-playground](https://www.npmjs.com/package/%40chrisleekr%2Fmcp-server-playground) (referencia de EventStore + resumability), [Agentic Academy](https://agentic-academy.ai/posts/mcp-deep-dive/).

### Dónde está el harness hoy

El hallazgo clave: **la pregunta no es "¿adoptar MCP?" — `handyman/src/mcp.ts` ya expone 20 tools + 2 resources sobre stdio**, delegando al CLI por `execFileSync` (cero segunda fuente de verdad, hereda el verifier gate). La pregunta correcta es **qué capacidades de sesión de la spec aún no se aprovechan**. Fricciones actuales mapeadas a capacidad disponible:

| Fricción actual (evidencia) | Capacidad MCP que la ataca |
|------------------------------|----------------------------|
| Arranque de sesión relee AGENTS.md + feature_list + `current.md` + `memory/*` + CHECKPOINTS, orquestado a mano por el rol | Resources/prompts compuestos (memoria episódica + procedural) |
| Handoffs leader→implementer→reviewer manuales vía `backlog/` + chat | Tools de handoff estructurado |
| `feature_close` corre `init.sh` completo (lint+build+tests, timeout 15 min) como subprocess **bloqueante** | Tasks (async, sobrevive reconexión) |
| Verbos destructivos (`sprint open/close`, `acceptance --force`) fuera del MCP → fricción operativa en hitos de rama | Elicitation (confirmación humana mid-call) |
| Un solo cliente (stdio); punto abierto de `docs/analisis-mcp-extension.md` §6: ¿fleet en MCP o panel web? | Streamable HTTP multi-cliente + `Mcp-Session-Id` |
| Sesión única por checkout: una sesión de otra rama "aparece" en `current.md`; `validate_harness` solo NOTea el branch mismatch | Metadatos de sesión ligados a branch/worktree |

## Plan de trabajo propuesto (prioridad = features del propio harness)

**P1 — Aprovechamiento puro, sin cambio de transporte (una feature)**

1. **Resource de reanudación `handyman://{project}/resume`**: un solo call que empaquete feature activa + `Next Step` + `Plan` + últimas N entradas de `history.md` + memoria relevante. Es el patrón "handoff document" hecho nativo; todo el material ya existe en disco. Ataca la fricción #1 directamente.
2. **Role prompts como MCP prompts**: leader/implementer/reviewer invocables desde cualquier cliente MCP con argumentos (`feature`, `project`), con fuente canónica única en vez de role files estáticos reconciliados por `update_harness --sync`. Es la lectura "procedural memory" del paper.

**P2 — Salto a Streamable HTTP (una feature habilitadora, con su ciclo completo leader/implementer/reviewer)**

3. **`feature_close` como MCP Task**: el tool call devuelve `task_id` inmediato, el agente sigue trabajando y consulta después; si la sesión cae a mitad del verifier, la task sobrevive. Es exactamente el caso de uso para el que se diseñó la primitiva.
4. **Elicitation para verbos destructivos**: `sprint close` / `acceptance --force` vuelven al MCP pidiendo confirmación humana explícita mid-call ("se archivarán N features done y se compactará history.md, ¿continuar?"). La invariante de seguridad se mantiene, la fricción operativa desaparece.
5. **Panel web fleet como un cliente MCP más**: disuelve el punto abierto del análisis previo; cada cliente queda identificado por `Mcp-Session-Id` → audit trail por cliente en `history.md`. Implementar la regla del 404 (re-inicialización) en el cliente desde el día uno.

**P3 — Formalización (features chicas, independientes)**

6. **Handoff estructurado**: `handoff_submit(role, artifact_ref)` / `handoff_claim(role)` como cola en disco — convierte el anti-teléfono-descompuesto en evento de estado consultable y auditable, igual que las transiciones de feature.
7. **Sesión ligada a branch**: estampar branch + worktree en metadatos de sesión; `feature_start` advierte fuerte (vía elicitation) si la sesión activa pertenece a otra rama — hoy el mismatch es una nota pasiva de `validate_harness`.

**Secuencia recomendada**: P1 primero (cero riesgo de transporte, valor inmediato en cada arranque de sesión); P2 como feature propia con análisis de riesgo (cambia el transporte del servidor); P3 en cualquier orden posterior.

**Riesgos/notas**
- Streamable HTTP introduce superficie de red donde hoy no hay ninguna: Origin validation (DNS rebinding), auth si algún día sale de localhost. El costo de seguridad es real y debe pesar en la decisión de P2.
- La resumabilidad con `Last-Event-ID` solo importa si hay streams largos; con Tasks bien implementadas es redundante para el caso del verifier — no construir ambas "por las dudas".
- `graphify` sigue siendo CLI externo; envolverlo como MCP server propio queda fuera de alcance (ya hay consumidor vía explorer, y un MCP más es otro proceso que mantener).

## Source Locations

- `handyman/src/mcp.ts` (20 tools, stdio, execFileSync — superficie donde colgar resume resource, prompts y tasks)
- `handyman/src/feature.ts` (`close` gated por verifier → candidato a Task async)
- `handyman/src/sprint.ts` (verbos destructivos fuera del MCP → candidatos a elicitation)
- `.handyman/progress/current.md` + `.handyman/progress/history.md` (material del resource `resume`)
- `.github/agents/{leader,implementer,reviewer}.agent.md` (fuente de los MCP prompts)
- `docs/analisis-mcp-extension.md` §6 (puntos abiertos que P2 disuelve: fleet en MCP vs panel, versionado)
- `.vscode/mcp.json` (registro actual del servidor, stdio vía `npx handyman-harness@3 mcp`)
