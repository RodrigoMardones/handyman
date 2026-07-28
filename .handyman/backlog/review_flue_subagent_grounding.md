---
type: Review Log
feature: flue_subagent_grounding
status: approved
role: reviewer
updated: 2026-07-28
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/flue_subagent_grounding]
---

# Review: flue_subagent_grounding

## Verdict

APPROVED

## Stage 1: Spec Compliance

Revisado contra los 4 criterios de aceptacion (feature 97):

- [x] **Sandbox `local({ cwd: PROJECT })`** configurado en el agente y
  decision documentada en README (vs quitar sandbox tools: el reviewer
  necesita leer el impl report; riesgo de `local()` aceptado y acotado a
  host confiable, sin env).
- [x] **Reviewer = subset read-only** de `mcp__handyman__*` (11 probes +
  `backlog_review`; sin verbs de estado ni `sprint_close`); TFA14 lo
  enforcea + 4 unit tests con el naming real del runtime (25 verbs del
  contrato). El bug de doble underscore (sets vacios) esta corregido y
  pineado tanto en TFA14 como en el unit test.
- [x] **Validacion documentada**: `demo_grounding_3` — el reviewer fundamento
  el veredicto en el impl report real (Reasoning cita su contenido), uso
  `backlog_review` via MCP, y hizo **cero** llamadas a verbs de estado
  (telemetria verificada sesion por sesion); implementer uso
  `feature_log`+`report_write` via MCP; feature `done`.
- [x] `./init.sh` exit 0 — gate de cierre.
- [x] Scope: agente + suite + README; el hardening de instrucciones MCP-only
  para reportes es consecuencia directa del drift observado en
  `demo_grounding`.

## Stage 2: Code Quality

- [x] Architecture respected — los verb lists y el filtro viven en
  `src/domain/` (modulo puro, testeable sin runtime), coherente con la
  lectura hexagonal (dominio sin imports de @flue salvo tipos; TFA10 sigue
  verde).
- [x] Conventions respected — comentarios en ingles tecnico; la decision y
  el riesgo documentados donde el operador los lee (README).
- [x] Tests meaningful and green — la leccion aplicada es la correcta:
  filtros que resuelven nombres en runtime se prueban con el naming real,
  no solo con greps de fuente.
- [x] Verifier exits 0.

Nota no bloqueante: el `actor:` que los subagentes escriben en el frontmatter
("Claude / Anthropic") es el modelo GLM siguiendo el tono de la plantilla;
cosmetico, sin impacto funcional.

## Required Changes

_None._
