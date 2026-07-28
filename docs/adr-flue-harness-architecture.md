# ADR: Flue como tercer driving adapter del harness handyman

- **Fecha:** 2026-07-28
- **Estado:** aceptado
- **Contexto:** features 89–96 (branch `feat/flue-spike`) · Propuesta completa: `.handyman/backlog/explore_flue_runtime_api.md` · Investigación previa: `.handyman/backlog/explore_flue-framework-integration.md`

## Contexto

Handyman ya exponía su dominio (máquina de estados de feature, sprints, reportes, verifier) por dos driving adapters: los 13 CLIs y el servidor MCP (25 tools). Al añadir un agente autónomo que conduce el ciclo completo (leader + subagents implementer/reviewer) necesitábamos un runtime de agentes: loop, sesiones durables, multi-provider, delegación, observabilidad. Flue (1.0.0-beta.9, equipo de Astro) fue validado en spike end-to-end, pero su API beta está en rework camino a 1.0 (plugin Vite, `'use agent'`, eliminación de workflows, SDK colapsado).

## Decisión

1. **Flue como tercer driving adapter del dominio**, en `agents/flue-handyman/`: un `defineAgent` (leader) con `defineAgentProfile` (implementer/reviewer), **una instancia de agente por feature** (`id` = nombre del feature), que conduce el harness exclusivamente por el MCP.
2. **El MCP es el anti-corruption layer**: los tools son comandos de aplicación (`feature_close`), no primitivas de persistencia. El modelo propone; el CLI dispone. Las reglas de negocio jamás viven en prompts sin enforcement en código.
3. **Capa anti-volatilidad obligatoria**: todo import de `@flue/*` pasa por `src/flue/index.ts` (único importador del paquete; excepción documentada: `run-feature.mjs`). Diseñamos contra conceptos estables — agents, profiles, tools, sessions, dispatch, observe, registerProvider — nunca contra la superficie beta.
4. **Complementariedad de verdades**: `.handyman/` (disco) es la fuente de verdad de negocio; los Durable Streams de Flue son la verdad de la conversación. No se mezclan.
5. **Taxonomía de errores de 3 clases** para toda la capa: `domain_outcome` (nunca retry), `transient_infra` (reconexión acotada al mismo admission), `protocol_error` (corrige el modelo).
6. **Exposición por niveles**: CLIs/MCP (sagrado) → `flue dev` + SDK → servidor compilado + sqlite persistente → vista `/agent` read-only → channels/schedules (postergado).

## Alternativas consideradas

- **Agente propio sin framework** (loop propio sobre los CLIs): rechazado. El loop son ~20 líneas, pero durabilidad, multi-provider, compactación y observabilidad son el harness completo que Flue ya da; reinventarlo viola el minimalismo con peor resultado.
- **Target Cloudflare (Durable Objects)**: postergado. Multi-instancia real, pero exige sandbox remoto para tocar el repo del proyecto; el deployment single-node Node + sandbox `local()` encaja con el caso de uso actual.
- **Workflows de Flue para el ciclo de features**: rechazado. Están eliminados en 1.0 ("conversations are the only durable unit"); el ciclo vive en el protocolo del leader + el estado de handyman.
- **Acoplar directo a la API beta** (sin barrel): rechazado. El CHANGELOG de `main` anuncia breaking changes masivos; el barrel convierte la migración en un diff de un archivo.
- **Channels como intake inmediato**: postergado. Sin API pública en beta.9 (solo blueprints); el intake sigue por `feature-request.md` / `POST /api/intake`.

## Consecuencias

- **Positivas:** durabilidad real (sqlite + Durable Streams: recovery tras kill), multi-provider por rol (Z.AI GLM, Kimi for Coding) en un catálogo único, telemetría estructurada por feature (`observe()` → JSONL sanitizado), evals vivos con `vitest-evals`, y una vista read-only del loop en `apps/web`.
- **Costes:** pin en `1.0.0-beta.9` hasta guía de migración (hoy 404); la capa anti-volatilidad es obligatoria y enforced por test (TFA10); un proceso vivo por instancia (paralelizar por feature, no por réplica); el watcher de `flue dev` no tolera edits en vuelo (servidor compilado para sesiones largas).
- **Deuda conocida:** mock de modelo vía `registerProvider({ baseUrl })` pendiente de validar; `toSatisfyJudge` (juez independiente) como siguiente paso de evals; channels y `defineAction` se reevalúan con Flue 1.0.
