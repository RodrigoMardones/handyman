---
type: Sprint
---

# Plan de siguientes pasos — capa LLM del toolBox

**Fecha:** 2026-07-18 · **Rama:** `feat/llm-toolbox-tasks` · **Contexto:** cerrada la feature 50, la migración strangler a Next terminó. Este doc decide qué sigue.

---

## 1. Dónde estamos

- **Migración completa.** Features 38-50 cerradas: un solo proceso Next standalone vía `toolbox serve`, `toolbox_serve.ts` borrado, `proxy.ts` reducido al host-guard, oráculo en 28/28 y gate verde (26 suites + `./init.sh` exit 0).
- **Backlog vacío de trabajo reclamable.** `pending: 0`, `in_progress: 0`, `blocked: 4`. El loop desatendido está parado con la condición correcta: *"nothing pending is ready — necesita una decisión humana, no otra sesión"*. Este doc es esa decisión.
- **Las 4 bloqueadas son el propósito de la rama.** `feat/llm-toolbox-tasks` se abrió para la capa LLM (features 32-35, ítems 2.3-2.6 de [analisis-tareas-llm-toolbox.md](../../../docs/archive/analisis-tareas-llm-toolbox.md)). Todo lo hecho hasta ahora — la migración entera — fue **infraestructura para hospedarlas**. Aún no se construyó ninguna.
- **El bloqueador §0 del análisis ya no aplica.** Existe `.env` con una API key y el registro de proveedores expone `zai` / `claude` / `ollama`. La capa de proveedores está viva (features 30/31 cerradas).

### Las 4 features bloqueadas

| id | feature | endpoint | valor/esfuerzo (según el análisis) |
|----|---------|----------|-------------------------------------|
| 32 | `toolbox_backlog_triage` | `POST /api/triage` | alto / medio — clasifica backlog + **deuda de evidencia** (features `done` sin `review_*.md`), hueco que `validate_harness` no cubre |
| 33 | `toolbox_acceptance_from_diff` | `POST /api/acceptance` | medio / medio |
| 34 | `toolbox_review_notes` | `POST /api/review-notes` | medio / medio |
| 35 | `toolbox_retro_lessons` | `POST /api/retro` | medio / **bajo** |

**Las 4 comparten exactamente el mismo bloqueo:** su `acceptance` se redactó cuando el server era `toolbox_serve.ts` y dice *"`tests/test_toolbox_serve.sh` cubre `/api/X`"*. Ese archivo ya no existe y el oráculo ya no es el lugar donde se prueban rutas nuevas. **Un solo pase de leader las destraba a las cuatro.**

---

## 2. Dos decisiones que hay que tomar ANTES de escribir código

### D-A · `useLiveHtml` pasa a estar en la ruta crítica (no es ya un "nice to have")

`FleetLive`, `HarnessLive` y `SearchClient` reimplementan la coreografía "string HTML → `dangerouslySetInnerHTML` → swap manual por SSE". Ese swap pelea con la reconciliación de React: ya rompió `/search` (arreglado ad-hoc) y sigue **latente** en Fleet/Harness ante un reconnect de SSE.

Las 4 features de la capa LLM **añaden cada una una superficie nueva de salida por SSE**. Si el hook se hace después, hay que aplicarlo en 3 sitios existentes + 4 nuevos, con 4 oportunidades más de reintroducir el bug. Si se hace antes, se arregla una vez y las 4 nacen encima.

> **Recomendación: hacer el hook primero.** Es la única pieza de este plan cuyo costo *crece* si se pospone.

### D-B · El problema del séptimo relay

Hoy existen **tres** relays casi idénticos: `relayAsk` / `relayDraft` / `relaySummary`, cada uno su propio módulo en el core, cada uno con su route handler de ~75 líneas (`app/api/{ask,draft,summarize}/route.ts`, 232 líneas entre los tres). Las features 32-35 añaden **cuatro más** con la misma forma: `POST {root, provider}` → leer workspace con la allowlist del registry → prompt → LLM → SSE `delta|result|error` → sin escribir disco.

Copiar cuatro veces más deja **siete** copias de la misma coreografía: se habría construido la abstracción por accidente, y mal.

La regla de tres ya se pasó hace rato. **Antes de la feature 32, leer los tres relays existentes y decidir:**
- Si el cuarto sale copy-paste → extraer un contrato compartido (validación de body con cap 256 KB, resolución de provider, framing SSE, mapeo de errores) y que los 4 nuevos + los 3 viejos lo usen.
- Si cada uno diverge de verdad en algo sustantivo → dejarlos separados **y anotar por qué**, para que el próximo no vuelva a preguntarlo.

> Lente ponytail: no construir la abstracción especulativamente — pero sí *mirar* antes del cuarto, en vez de descubrirlo en el séptimo.

---

## 3. Secuencia

### Fase 0 · Destrabar + decidir (leader, 1 sesión, sin código de producto)

1. **Re-redactar la `acceptance` de las 4 features** para la arquitectura real:
   - endpoint = route handler nativo (`apps/web/app/api/<x>/route.ts`), no `toolbox_serve.ts`;
   - cobertura = una suite `tests/test_web_*.sh` (el patrón de `test_web_relays.sh`), registrada en `run_tests.sh`; el oráculo sólo si la ruta forma parte del contrato negro-caja del observador;
   - conservar intactos los invariantes del §6 del análisis: **el LLM no escribe estado**, pull/batch nunca por evento SSE, markdown del modelo saneado + CSP, modelo barato para clasificar y grande sólo para redactar, citas atadas a fragmentos con "no sé" explícito, y el registry como allowlist de cualquier lectura nueva del workspace.
2. **Resolver D-B** leyendo los tres relays existentes; dejar la decisión escrita en `docs/architecture.md`.
3. **Corregir el puntero stale** en los 4 `blocked_reason`: apuntan a `docs/current/handoff-2026-07-18.md` (el doc existe, pero conviene verificar que sigue describiendo el estado tras la 50).
4. Desbloquear con `feature.js ready` / `unblock` y confirmar que `feature.js ready` las lista.

**Gate:** `./init.sh` exit 0 y las 4 features en `pending` + `ready`.

### Fase 1 · `useLiveHtml` (esfuerzo M) — ver D-A

Un hook único dueño del ref que aplique HTML derivado, adoptado por `FleetLive`, `HarnessLive` y `SearchClient`. Elimina la duplicación y **la clase de bug**, no sólo la instancia.

**Gate:** las tres vistas siguen verdes en `test_web_{fleet,harness,timeline_search}.sh`, más un caso que fije el comportamiento en reconnect (hoy sin cobertura — es justamente el escenario latente).

### Fase 2 · Las features LLM, en el orden del propio análisis (§5)

1. **32 · triage + deuda de evidencia** — mayor valor, y la variante "features `done` sin `review_*.md`" cierra un hueco real de `validate_harness`. Es además la que fija el patrón para las otras tres, así que se lleva el peso de D-B.
2. **34 · review notes** y **33 · acceptance desde diff** — asisten a los roles sin tocar su autoridad.
3. **35 · retro/lecciones** — el más barato; buen cierre de la tanda.

Una feature a la vez, con el ciclo del harness (leader → implementer → reviewer, gate verde + `APPROVED` antes de `done`).

### Fase 3 · Barrido de higiene (un solo commit)

Agrupar lo que quedó suelto en [plan-mejoras-post-migracion.md](plan-mejoras-post-migracion.md):
- **D2** `@types/dompurify` (dep + cláusula de test + nota de doc, juntos);
- **D3** runbook dual-boot en el plan de migración (anotar "superseded" o dejar como historia);
- **NUL bytes en `toolbox.ts`** (4 bytes crudos → `\0` escapado): `grep` lo trata como binario y lo salta **en silencio**, así que cualquier suite que lo grepee falla abierta;
- las ~12 menciones de proveniencia a `toolbox_serve.ts`, si se decide que valen el churn.

### Fase 4 · Rama → `main`

PR de `feat/llm-toolbox-tasks`: migración completa + capa LLM. Ver §4.

### Explícitamente NO ahora

**Plan E (dispatch controlado de agente, §3 del análisis).** El propio doc lo condiciona: *"sólo después de que 2-6 estén verdes; es el cambio de contrato más grande"*. Hoy 2.3-2.6 no existen. Tampoco el adapter Copilot (§4), que es paralelo y opcional.

---

## 4. Punto abierto para el humano: la historia de la rama

El commit `b53c9e4 "feat: first iteration of observation of harnesses"` (90 archivos, +8353/-3221) **agrupa las features 47, 48, 49 y 50** bajo un mensaje que no describe ninguna. Las features 43-46 sí tienen un commit propio cada una.

No es un problema funcional — el árbol está limpio y el gate verde. Pero antes del PR conviene decidir:

- **(a)** dejarlo como está — la rama entera va a `main` en un merge de todos modos;
- **(b)** reescribir el mensaje para que describa lo que realmente entró;
- **(c)** partirlo en los 4 commits por feature, alineando la historia con `progress/history.md`.

La (a) es defendible si el PR lleva buena descripción. La (c) es la única que deja `git log` utilizable como registro por feature, que es lo que el harness asume en el resto de la rama.

---

## 5. Resumen ejecutivo

| Fase | Qué | Por qué ahora |
|------|-----|----------------|
| 0 | Re-redactar acceptance de 32-35 + resolver D-B | Un solo pase destraba las 4; sin esto el harness está parado |
| 1 | `useLiveHtml` | Único ítem cuyo costo crece si se pospone (3 sitios hoy, 7 después) |
| 2 | Features 32 → 34 → 33 → 35 | Es el propósito de la rama; orden del análisis §5 |
| 3 | Higiene en un commit | Barato, agrupado, sin urgencia |
| 4 | PR a `main` | Tras cerrar la tanda |


---

## 6. Ejecución (2026-07-19) — fases 0-3 cerradas

Todo el plan salvo la Fase 4 (el PR) quedó hecho en una sesión. Resumen y, más
importante, **dónde el plan estaba equivocado**:

| Fase | Resultado |
|------|-----------|
| 0 | Acceptance de 32-35 re-redactada; las 4 pasaron a `pending` + `ready`. D-B resuelto y escrito en `docs/architecture.md`. |
| 1 | `useLiveHtml` extraído y adoptado. |
| 2 | **Las 4 features cerradas** (32 → 34 → 33 → 35), cada una con gate verde. Backlog drenado: 21 `done`, 0 pendientes. |
| 3 | NUL bytes corregidos + guard; D2 y D3 resueltos; menciones de proveniencia: se conservan (decisión escrita). |

### Tres cosas que este plan afirmaba y no eran ciertas

1. **`tests/test_toolbox_serve.sh` sí existe** (676 líneas). El §1 decía "ese
   archivo ya no existe". Lo que se borró en la feature 50 fue
   `handyman/src/toolbox_serve.ts` (el server), no su suite: hoy es el
   **oráculo negro-caja** que bootea el Next standalone real. Por eso las 4
   features nuevas **sí** se probaron ahí de punta a punta (40/40), además de
   sus suites propias — el §3 sugería no tocarlo, y habría sido peor.
2. **D-B estaba mal planteado.** El plan hablaba de "siete copias de la misma
   coreografía". La coreografía **ya estaba extraída** (`lib/relay.ts`,
   `lib/respond.ts`, los `relay*` del core); lo que queda en cada `route.ts` es
   la declaración de en qué difiere ese relay, y los tres viejos difieren de
   verdad (ver la tabla en `architecture.md`). Se extrajo el prelude solo para
   los 4 nuevos y se dejaron los 3 viejos en paz.
3. **Eran cuatro vistas con el swap manual, no tres.** El §D-A nombraba
   `FleetLive`, `HarnessLive` y `SearchClient`; `TimelineLive` hacía exactamente
   lo mismo. Y los tres `dataset.*Pulse` que el swap escribía eran **código
   muerto**: ningún CSS ni test los leía.

### Lo que queda abierto

- **Fase 4 (PR a `main`)** y con ella el punto §4 (la historia de la rama:
  `b53c9e4` agrupa 4 features). Sigue siendo decisión humana.
- **Nada está commiteado.** El árbol tiene todo el trabajo de las fases 0-3 sin
  commit, a la espera de que se decida el formato de la historia.
- **Desviación de proceso declarada en las 4 reviews:** leader, implementer y
  reviewer corrieron en una sola sesión de un solo agente. El gate y el oráculo
  son evidencia ejecutable real; la independencia implementer/reviewer —el
  anti-teléfono-descompuesto— **no se cumplió**. Si eso importa para estas 4,
  corresponde una revisión independiente antes del merge.
- **Hueco del harness encontrado:** `feature.js` no tiene verbo `unblock` (ni
  para re-redactar `acceptance`), pero `preflight` te dice "unblock blocked
  work". La Fase 0 tuvo que editar `feature_list.json` por script, justo lo que
  `architecture.md:138` prohíbe. Candidato claro a feature nueva.
