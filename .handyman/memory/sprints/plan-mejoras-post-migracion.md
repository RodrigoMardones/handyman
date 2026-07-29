---
type: Sprint
---

# Plan de mejoras post-migración toolBox → Next.js

**Fecha:** 2026-07-18 · **Contexto:** cierre de la migración strangler del observer Node a `apps/web` (Next 16). Este doc recoge lo concluido, las decisiones pendientes y las mejoras futuras priorizadas. Fuente: auditoría de código muerto con verificación adversarial (47 agentes, 40 candidatos, 12 confirmados muertos, 10 a decidir).

---

## 1. Concluido en esta sesión

### Bugs de la plataforma (verificados end-to-end en el standalone de producción)
- **Navegación a harness desde /fleet**: la fila enlaza `<a href="/harness/<name>">` (`apps/web/app/fleet/fleetHtml.ts` — archivo eliminado con apps/web el 2026-07-28).
- **Tabs current/history/checkpoints/workspace MOC (404)**: los tokens de `/api/md` ahora son los que `resolveMd` acepta (`current`/`history`/`checkpoints`/`index`), no filenames (`apps/web/app/harness/harnessHtml.ts` — eliminado).
- **Buscador /search**: los resultados son estado derivado (`useMemo`) en vez de `innerHTML` manual que React sobrescribía (`apps/web/components/SearchClient.tsx` — eliminado).

### Código muerto eliminado
- **Borrado:** `apps/web/lib/toolboxCore.ts` (smoke de feature 42, 0 importadores, superseded por `lib/runtime.ts`); `handyman/src/toolbox_ask.ts` y `handyman/src/toolbox_summary.ts` (shims sin ningún importador/test/export — revisa la nota de feature 50 que los listaba como "entrypoints estables": es falso para estos dos; `toolbox_llm`/`toolbox_draft` **sí** están vivos vía deep-import de tests, se conservan).
- **Reducido:** `apps/web/proxy.ts` — removido el forward muerto (`fetch` → `TOOLBOX_UPSTREAM`/`:8765`, el observer Node ya no existe). **Se conserva** `proxy()` + `hostAllowed()` (guard anti-DNS-rebinding, verificado vivo: Host inválido → 403) y `NEXT_HANDLED_*` (8 suites lo asertan). `export` huérfanos `FAVICON_LINK`/`HTML_STYLE` en `handyman/src/toolbox.ts` degradados a const internas.
- **Resultado:** ruta desconocida pasó de `500` (ECONNREFUSED al :8765 muerto) a `404` nativo de Next. Cero dependencia de servicio externo en runtime.

---

## 2. Decisiones pendientes (acopladas a feature 50 — requieren una definición)

| # | Ítem | Estado |
|---|------|--------|
| D1 | `NEXT_HANDLED_*` en `proxy.ts` + las 8 suites `test_web_*.sh` que lo grepean | ✅ **Resuelto** (2026-07-18, cambio coordinado único). `proxy.ts` quedó solo con el host-guard; las 11 aserciones en 8 suites pasaron de "el string está en el manifiesto" a `[ -f app/**/page.tsx \| route.ts ]` — estrictamente más fuerte: aserta que la ruta existe, no que aparezca en una lista muerta. `PROXY=` removido de las 7 suites donde quedó sin uso; `test_web_runtime.sh` conserva la variable y ahora aserta la higiene inversa (`hostAllowed` + 403 presentes, `NEXT_HANDLED`/`TOOLBOX_UPSTREAM`/`fetch(` ausentes). |
| D2 | `@types/dompurify` (devDep) | ✅ **Resuelto** (verificado 2026-07-19): la devDep está declarada en `apps/web/package.json`, documentada en `architecture.md` y aseverada por `test_web_intake_ask.sh`. Los tres puntos coinciden, así que no hay nada suelto que limpiar: se **conserva** como devDep nominal. |
| D3 | Runbook dual-boot en `plan-migracion-toolbox-nextjs.md:78-90` | ✅ **Resuelto** (2026-07-19): **anotado como SUPERSEDED** con un aviso arriba del bloque. Se conserva el runbook como historia honesta de cómo se verificó la paridad (feature 38), pero queda explícito que `toolbox_serve.js` ya no existe y que hoy el arranque es un solo proceso. Nadie lo va a correr por accidente. |
| D4 | Wiring del host-guard | ✅ **Resuelto** (2026-07-18): decidido **conservar el guard y pinnearlo**. Caso nuevo en `tests/test_toolbox_serve.sh` contra el servidor real ya booteado: `Host: evil.example` → 403 y `Host: localhost` → 200. Verde en el gate. Ya no está en limbo: borrar el guard rompe la suite. |

---

## 3. Mejoras futuras priorizadas

### ~~P1 · Extraer un hook `useLiveHtml` compartido~~ — ✅ hecho 2026-07-19
`apps/web/lib/useLiveHtml.ts` es dueño de la suscripción SSE y del estado; las vistas derivan el HTML con `render(state)` y **React vuelve a ser dueño del nodo**. El `ref` y el swap manual desaparecieron de `FleetLive`, `HarnessLive` y `TimelineLive` (eran **cuatro** sitios contando `SearchClient`, no tres como decía este doc: `TimelineLive` hacía el mismo swap).

Dos hallazgos del camino:
- **Los tres `node.dataset.*Pulse = Date.now()` eran código muerto.** Ningún CSS ni test los leía: el "row flash on swap" que el comentario de `FleetLive` anunciaba nunca se implementó (los `@keyframes *-pulse` animan el punto de estado, no las filas). Se borraron con el swap.
- Cada suite ganó un caso de regresión que grepea que la vista **no** escribe `innerHTML` a mano, más un caso que fija el contrato de reconnect/announce del hook — justo el escenario que estaba sin cobertura.

### ~~P1 · Definir el wiring del host-guard + test~~ — ✅ hecho 2026-07-18
Ver D4. Guard conservado y pinneado con un caso end-to-end en `tests/test_toolbox_serve.sh`.

### ~~P2 · Publicar `MD_TOKENS` desde `@handyman/toolbox-core`~~ — ✅ hecho 2026-07-18 (con un matiz)
`resolveMd` se refactorizó sobre un mapa `MD_TOKEN_PATHS` y el core exporta `MD_TOKENS` (`packages/toolbox-core/src/state.ts`). **Matiz:** `harnessHtml.ts` NO importa la constante — las suites lo transpilan standalone y lo requieren desde `os.tmpdir()`, así que un import de `@handyman/toolbox-core` rompería ese arnés. En vez de reescribir el arnés, la unión se fija con un test: `test_web_harness.sh` renderiza el HTML, extrae cada `data-api-md="<token>"` y exige que los bare tokens estén en `MD_TOKENS` (los prefijados, que su kind sea `backlog`/`docs`). No es "imposible que deriven", pero derivar **falla la suite** — verificado inyectando el bug original (`current` → `current.md`): el caso falla con el token exacto. Trade consciente (lente ponytail): el arnés de renderer puro se conserva.

### P2 · Barrer los comentarios stale "toolbox_serve.ts / Node upstream" — esfuerzo S (parcial)
**Hecho:** el pointer factualmente equivocado "toolbox_serve.ts buildState" → `buildState` vive en `handyman/src/toolbox_state.ts` (`fleetHtml.ts`, `harnessHtml.ts`), y una nota autoritativa en `architecture.md` § Intake y toolBox que declara el archivo borrado y marca el resto de las menciones como **proveniencia histórica**.
**Pendiente (decidido no hacer ahora):** las ~12 menciones "byte-parity con `toolbox_serve.ts`" en `state/route.ts`, `events/route.ts`, `lib/runtime.ts`, `lib/relay.ts`, `lib/respond.ts`, `lib/changeHub.ts`, `HarnessLive.tsx`, `FleetLive.tsx`, `next.config.ts`. Son afirmaciones ciertas sobre un archivo que existió y documentan de dónde salió el contrato; reescribirlas es churn en 12 sitios contra un beneficio que la nota de `architecture.md` ya entrega. No tocar la convención de mirror-comments de `changeHub.ts` sin acordar que va toda.

### ~~P2 · Registrar `test_web_timeline_search.sh` en `run_tests.sh`~~ — ✅ hecho 2026-07-18
Registrada tras `test_web_intake_ask.sh`. El gate pasó de 25 a 26 suites; los 16 casos ya corrían verdes en aislado.

---

## 4. Secuencia sugerida
1. ~~**Cerrar feature 50** con su gate, incorporando D1–D4 como end-state de la decomisión.~~ ✅ Gate verde 2026-07-18 (`bash tests/run_tests.sh` → ALL SUITES PASSED, 26 suites; `./init.sh` → exit 0). D1 y D4 incorporados; D2/D3 quedan fuera del scope de la 50 (ver §2).
2. ~~`MD_TOKENS` y el registro de `test_web_timeline_search.sh` como quick-wins.~~ ✅ hechos.
3. ~~**El hook `useLiveHtml` (P1)**: hacerlo antes de la próxima vista live, para no re-introducir el clobber.~~ ✅ hecho 2026-07-19, **antes** de las cuatro features LLM (32-35) justamente para que nacieran encima y no hubiera que aplicarlo en siete sitios.
4. ~~**D2 / D3** y el resto del barrido de comentarios (§3).~~ ✅ resueltos 2026-07-19 (ver §2 y §6).

## 5. Regresión de CSP encontrada al cerrar la feature 50 (2026-07-18)

El reviewer independiente rechazó el primer cierre (`CHANGES_REQUESTED`) y encontró una **regresión de seguridad real** que el propio test enmascaraba:

- El observer Node aplicaba `CSP_HEADER` a su HTML vía `send()`. Al borrarlo, las páginas de Next quedaron **sin CSP** (`/`, `/fleet`, `/timeline`, `/search`, `/intake`, `/ask`). Medido en vivo: cero headers CSP en HTML, sólo las APIs JSON la llevaban.
- El caso del oráculo se había re-apuntado de `/` a `/api/state` con el razonamiento "las superficies críticas son las respuestas de API". Está invertido: CSP es un control a nivel de **documento**; sobre JSON es casi inerte. El caso quedó verde mientras la superficie protegida estaba desprotegida.
- **Fix:** `HTML_CSP_HEADER` en el core (derivado de `CSP_HEADER` por `.replace`, sólo agrega `https://picsum.photos` a `img-src`) aplicado con `headers()` en `next.config.ts` sobre `/((?!api/|events).*)`. Las APIs conservan el `CSP_HEADER` estricto; `/events` no lleva CSP (byte-parity con el observer, e inerte sobre SSE).
- El caso ahora aserta **las dos direcciones** en `/`, `/fleet` y `/api/state`: que las páginas SÍ llevan la concesión picsum y que las APIs NO. Sin esa primera mitad, un `.replace` que dejara de aplicar en silencio pasaría verde con las imágenes bloqueadas — la misma forma de fallo. Negative-testeado.

**Lección transferible:** re-apuntar una aserción a otra ruta para que "vuelva a pasar" es cómo una regresión entra en verde. Si un caso cambia de superficie, hay que preguntarse qué propiedad protegía en la superficie original y si esa propiedad sigue cubierta por alguien.

## 6. Notas de higiene encontradas de paso (2026-07-18)
- `handyman/src/toolbox.ts` contiene **4 bytes NUL literales** (separadores de clave en template literals, líneas ~805 y ~817). `grep` clasifica el archivo como binario y lo salta en silencio — cualquier suite o herramienta que lo grepee falla abierta sin avisar. Pre-existente (también en HEAD), no es regresión de la 50. Fix trivial: `\0` escapado en vez del byte crudo. No hecho para no mezclarlo con el gate de la 50.


---

## 6. Barrido de higiene (2026-07-19)

### NUL bytes en `handyman/src/toolbox.ts` — ✅ corregido

Cuatro bytes NUL **crudos** hacían de separador en la clave de dedup del
timeline (`${project_root}\0${feature}\0${date}`). El problema no era el
separador — es una técnica válida — sino que `file(1)` clasificaba el archivo
como *binary data* y **`grep` lo saltaba en silencio**: `grep -c export
handyman/src/toolbox.ts` devolvía nada. Cualquier suite que lo grepeara
**fallaba abierta**: pasaba por no encontrar nada, no por estar bien.

Fix: los 4 bytes crudos pasaron al escape de dos caracteres `\0`. La cadena en
runtime es idéntica (verificado: `charCodeAt` sigue siendo 0 y el escape
compara `===` contra un NUL real) y el archivo volvió a ser texto plano — ahora
`grep` encuentra sus 24 `export`.

Guard: caso nuevo en `tests/test_toolbox.sh` que recorre los `.ts`/`.tsx` de
`handyman/src`, `packages/toolbox-core/src` y `apps/web` y falla si alguno trae
un NUL crudo. La detección usa `tr -d '\000' | cmp -s`, **no** `grep`: una
cadena de shell no puede contener un NUL, así que `grep $'\x00'` degenera en un
patrón vacío que matchea todos los archivos (se probó: reportaba los 100).
Negative-testeado inyectando un NUL en un archivo temporal.

### Menciones de proveniencia a `toolbox_serve.ts` — se **conservan** (decisión)

Son ~12 y viven casi todas en `backlog/impl_*.md` y `progress/history.md`, que
son **registro histórico**: reescribirlas sería falsificar lo que pasó. Las que
están en comentarios de `apps/web/**` ya están explicadas en
`docs/architecture.md` como "procedencia histórica, no referencias vivas".
No valen el churn; queda anotado para que no se vuelva a preguntar.
