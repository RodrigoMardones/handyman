---
type: Implementation Log
feature: harness_roles_toolbox_pointer
id: 54
role: implementer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: harness_roles_toolbox_pointer (feature 54)

Cierre de G4: que el reviewer sepa que la capa LLM existe, sin que eso erosione
su autoridad. Depende de la 53, que es la que hizo la capa alcanzable.

## Piezas

- `handyman/assets/role-reviewer.template.md`: un párrafo `Optional:` que nombra
  `toolbox.js review-notes` como punto de partida del paso 3, y el párrafo de
  firma endurecido — «never on a model's output, including the checklist above.
  You sign on evidence you verified yourself: the verifier and the diff».
- `.github/agents/reviewer.agent.md`: el mismo par de cláusulas, redactadas en
  el idioma propio de esa instancia (ver «Desviación» abajo).
- `tests/test_docs.js`: `testReviewerToolboxPointer()`, 5 checks — nombra el
  subcomando, lo enmarca como opcional/no-sustituto, conserva la cláusula del
  verificador verde, prohíbe firmar sobre salida de modelo, y nombra la
  evidencia real sobre la que se firma.

## Desviación de la acceptance: la bala 3 partía de una premisa falsa

La bala 3 decía: «El cambio se hace en `handyman/assets/role-*.template.md`, no
en `.github/agents/*.agent.md`: esos últimos son **instancias generadas** y
`init.sh` los regenera».

**`init.sh` no los regenera.** Verificado:

- `update_harness.ts` sincroniza únicamente el **frontmatter** (`model:` /
  `tools:`) de los role files; nunca toca el cuerpo (`update_harness.ts:95-125`).
- `scaffold` «never overwrites» (declarado en la cabecera de
  `update_harness.ts:5-7`).
- La línea `agent reviewer: ok -> ...` que imprime `init.sh` viene de
  `tools_discovery.ts:436`, que sólo **reporta** que el archivo existe.

Comprobado empíricamente: tras cambiar la plantilla, `./init.sh` corrió con
exit 0 y `.github/agents/reviewer.agent.md` siguió con 0 menciones de
`review-notes`.

Consecuencia: con sólo la plantilla, los harnesses **nuevos** nacen sabiéndolo,
pero este repo y todo harness ya instalado seguían sin enterarse — es decir, G4
quedaba abierto justo donde importaba. Con la decisión del usuario se actualizó
también la instancia de este repo. Es seguro: al no regenerarse nunca, el
cambio no se pierde.

Esa instancia ya había divergido de la plantilla (7 pasos en vez de 6,
verificador propio, contrato de frontmatter explícito), así que se le agregaron
las mismas dos cláusulas en su propia redacción en vez de pisarla.

## Lo que NO se hizo

Un modo de re-sync de cuerpos en `update_harness` cerraría G4 para todos los
harnesses instalados de una. Se descartó por alcance: no estaba planificado y
tiene más riesgo que el resto de la cola junta. Queda nombrado como mejora
futura, no construido.

## Verificación

- `node tests/test_docs.js` -> 212/212 (era 207/207).
- `bash tests/run_tests.sh` -> ALL SUITES PASSED (30 suites).
- `./init.sh` -> exit 0.

## Notas

- Colisión de roles: mismo agente en los tres roles; ver
  [[review_harness_unblock_verbs]].
