---
type: Implementation Log
feature: flue_runtime_api_architecture
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/flue_runtime_api_architecture]
---

# Implementation Report: flue_runtime_api_architecture

Feature tipo Doc/Explore. Brief completo en
`.handyman/progress/handoff-2026-07-27.md` §3.

## Files Changed

- `.handyman/backlog/explore_flue_runtime_api.md` (nuevo, único entregable) —
  contiene las 4 partes exigidas por el acceptance:
  1. **Inventario de API** desde el ground truth instalado
     (`@flue/{runtime,sdk,cli}@1.0.0-beta.9`, `dist/*.d.mts` + exports map):
     barrel categorizado (agents/profiles, tools, actions, skills, sessions,
     sandboxes, MCP, routing/dispatch, stores, observabilidad, providers),
     jerarquía de errores completa, 26 variantes de `FlueEvent` v3, SDK y CLI.
  2. **Cross-check docs ↔ paquete** (§1.6): `docs/api/agent-api/` coincide con
     lo instalado (autoritativa); quickstart desactualizado (`createAgent`);
     README del repo muestra la API 1.0 de hooks inexistente en beta.9;
     **ningún paquete empaqueta CHANGELOG** (deriva 1.0 solo visible en el repo).
  3. **Concept map handyman ↔ Flue** (§2, tabla adopt/wrap/ignore) y
     **capability census** (§3, 10 capacidades).
  4. **Propuesta de arquitectura** (§4): entidades de negocio, 7 bounded
     contexts, puertos driving/driven, capa anti-volatilidad `src/flue/`,
     layout propuesto; más **estrategia de trabajo** (§5) para arquitectura,
     logs/errores, exposición/consumo, con roadmap de 8 features.

## Design Notes

- Fuentes externas de apoyo (arquitectura de agentes, DDD, hexagonal, OTel
  GenAI, idempotencia) citadas con URL en §7 del reporte.
- Decisiones clave: workflows ignorado (muere en 1.0); channels postergado
  (sin API pública en beta.9); MCP como anti-corruption layer (tools = comandos
  de aplicación); diseño contra conceptos estables, no contra la superficie beta.
- Sin cambios de código: feature de arquitectura. Su roadmap se ejecuta en las
  features siguientes del sprint (anti-volatilidad, model catalog, telemetry,
  stable server, error taxonomy, web live view, memory update).

## Test Output

```text
./init.sh → exit 0 (verificado en feature.js done)
```
