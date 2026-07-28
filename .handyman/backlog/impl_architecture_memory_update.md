---
type: Implementation Log
feature: architecture_memory_update
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/architecture_memory_update]
---

# Implementation Report: architecture_memory_update

## Files Changed

- `.handyman/memory/architecture.md` — nueva seccion "Capa de agentes Flue
  (bounded contexts y puertos)": lectura hexagonal del repo (dominio = core +
  CLIs + schemas; MCP = anti-corruption layer; orchestration, execution,
  model provisioning, observability, exposure como contexts), niveles de
  exposicion 0-4, y las 4 reglas duras (anti-volatilidad, taxonomia de 3
  clases, privacidad de logs, un proceso por instancia). "What Not To Do"
  gana 2 bullets (imports fuera de src/flue/; workflows y retry de outcomes
  de dominio). Contenido existente intacto (verificado).
- `docs/adr-flue-harness-architecture.md` (nuevo) — ADR: contexto, 6
  decisiones (Flue como tercer driving adapter; MCP como ACL; capa
  anti-volatilidad; complementariedad de verdades; taxonomia; exposicion por
  niveles), 5 alternativas consideradas con rechazo/postergacion justificados,
  consecuencias (positivas, costes, deuda conocida).
- `AGENTS.md` — la fila de `agents/flue-handyman/` del repo map documenta la
  regla del barrel anti-volatilidad (unico cambio operativo de convenciones).

## Design Notes

- Fuente: `backlog/explore_flue_runtime_api.md` secc. 4-5 (features 89-96 ya
  implementadas: barrel, catalog, sink, stable server, taxonomy, vista). La
  memoria describe lo que YA existe y es verificable por las suites (TFA10,
  TFA13, test_web_agent), no un plan.
- El ADR registra las alternativas rechazadas (agente propio, Cloudflare,
  workflows, acople directo a beta, channels) para que la migracion a Flue
  1.0 no reabra decisiones ya tomadas.
- Sin cambios de codigo: feature Doc. Las convenciones nuevas ya estan
  enforceadas en tests desde sus features respectivas.

## Test Output

```text
./init.sh → exit 0 (verificado en feature.js done)
```
