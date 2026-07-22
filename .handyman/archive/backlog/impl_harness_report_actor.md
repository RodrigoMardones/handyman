---
type: Implementation Log
feature: harness_report_actor
id: 55
role: implementer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: harness_report_actor (feature 55)

Las features 32-35 se cerraron con leader, implementer y reviewer colapsados en
un solo agente. El harness no lo detectó ni lo registró: la desviación existía
sólo porque alguien la escribió en prosa, en reviews firmadas por el mismo
agente que implementó. Ahora está en el registro estructurado.

Entró como opción **(a)** del §3 del plan: campo opcional, NOTE no bloqueante,
plantillas documentadas.

## Piezas

- `handyman/src/validate_harness.ts`: `checkActorCollisionAdvisory(workspace)`.
  Recorre los `impl_*.md`, busca el `review_` hermano, y cuando ambos declaran
  el mismo `actor:` no vacío imprime un `NOTE:`. Reusa `parseFrontmatter` de
  `core/frontmatter.ts`.
- `handyman/assets/role-implementer.template.md` y
  `role-reviewer.template.md`: paso 8/5 pide la línea `actor:`, más un párrafo
  que explica que es opcional, que no bloquea, y qué pasa cuando coinciden. La
  del reviewer agrega: «Declare it honestly — the point is that a
  collapsed-roles run is visible in the record, not hidden».
- `tests/test_docs.js`: `testActorFieldDocumented()`, 6 checks (3 por plantilla).
- `tests/test_init.sh`: T22 (mismo actor -> NOTE, exit 0), T23 (actores
  distintos -> silencio), T24 (sin campo `actor:` -> silencio).

## Por qué opcional

Es la única de las cinco que cambia un formato que harnesses instalados ya
usan. Ninguno tiene `actor:` en ningún reporte; invalidarlos sería hostil. Un
reporte sin el campo es simplemente silencioso — T24 lo fija como contrato, no
como accidente. Lo mismo para un lado solo: si sólo el impl declara actor, no
hay con qué comparar y no se dice nada.

## Lo que esta feature NO hace

**Resuelve visibilidad, no cumplimiento.** Un agente que corre los tres roles y
escribe tres `actor:` distintos pasa este chequeo sin despeinarse. Sirve para
que la desviación quede en el registro, no para impedirla. Impedirla es proceso
—dos sesiones separadas, dos agentes— y no código; decirlo es más honesto que
fingir que un chequeo lo cubre. El comentario de la función lo dice también,
para que nadie lo lea como un guard.

## Aplicado a esta misma sesión

Los 8 reportes que esta sesión escribió (features 51-54) llevan ahora
`actor: agente-local (single-agent session)`. Resultado: el verificador
imprime 4 NOTEs de colisión sobre este mismo repo, y sale 0.

Es el comportamiento buscado. La colisión de roles de esta sesión estaba
declarada en prosa en cada review; ahora está en el registro estructurado,
donde una herramienta la puede contar. La feature se probó a sí misma contra
el caso real que motivó su existencia.

## Verificación

- `node tests/test_docs.js` -> 218/218 (era 212/212).
- `bash tests/test_init.sh` -> 22/22 (era 19/19).
- `bash tests/run_tests.sh` -> ALL SUITES PASSED (30 suites).
- `./init.sh` -> exit 0, con los 4 NOTEs de colisión presentes.
