---
type: Sprint
---

# Plan: huecos del harness + peticiones a modelos desde el CLI

**Fecha:** 2026-07-19 · **Rama:** `feat/llm-toolbox-tasks` (commit `6f08840`, árbol limpio)
**Contexto:** cerradas las features 32-35, el backlog quedó drenado (21 `done`, 0 pendientes). Este doc decide qué sigue, y sale de dos cosas distintas: los **huecos del harness** que aparecieron mientras se ejecutaba el plan anterior, y la pregunta abierta de **cómo hacer peticiones a modelos por toolBox**.

Todo lo que se afirma acá está verificado contra el árbol en `6f08840`; cada hueco lleva su evidencia.

---

## 1. Los huecos del harness

### G1 · No existe verbo para desbloquear ni para re-redactar `acceptance` (severidad: alta)

**Evidencia.** `feature.js` expone `{add, start, block, done, ready, log, next}`. No hay `unblock`, y no hay forma de tocar `acceptance` de una feature ya creada. Pero `preflight` imprime literalmente:

```
next: add features, finish their dependencies, or unblock blocked work
```

El harness **te pide una operación que no ofrece**. La Fase 0 del plan anterior tuvo que editar `feature_list.json` con un script — exactamente lo que `docs/architecture.md:138` lista bajo *What Not To Do*: «Editar `feature_list.json` a mano».

**Por qué importa.** No es cosmético: es el único camino por el que un leader puede destrabar trabajo, y hoy obliga a violar una regla escrita del propio harness. Cualquiera que siga el plan anterior al pie de la letra choca con esto.

**Forma propuesta.** Dos verbos, mismo estilo atómico que los demás:

```
feature.js unblock <name>                 # blocked -> pending, borra blocked_reason
feature.js acceptance <name> --from FILE  # reemplaza la lista de acceptance
```

`--from FILE` (una bala por línea) en vez de `--set "texto"` repetido: las acceptance son multilínea y con comillas, y pelear con el quoting del shell es justo donde se cuelan los errores.

### G2 · La deuda de evidencia se calcula pero no compuerta nada (severidad: media)

**Evidencia.** `validate_harness.ts:318-374` (`checkFrontmatterAdvisory`) recorre `impl_`/`review_`/`explore_` **que existen** y sólo avisa sobre su frontmatter. Nunca pregunta si una feature `done` **tiene** su `review_<name>.md`. Verificado leyendo la función completa: no hay ningún cruce contra `feature_list.json`.

La feature 32 sí calcula eso (`computeEvidenceDebt`), pero vive detrás de `POST /api/triage`: hay que levantar el server y hacer un POST para enterarte. **El gate no lo ve.** Se puede cerrar una feature sin review y el verificador pasa verde.

**Forma propuesta.** Reusar `computeEvidenceDebt` (ya está en el core, ya está testeada) desde `validate_harness` como **NOTE no bloqueante**, igual que el advisory de frontmatter. No como gap que rompa el exit code: hay harnesses históricos con deuda legítima y romperles el gate de golpe es hostil. Si más adelante se quiere endurecer, es cambiar una línea.

> Nota incómoda y pertinente: las 4 features que cerré (32-35) **sí** tienen su `review_`, pero los firmé yo mismo. Ver G3.

### G3 · La independencia de roles no es verificable (severidad: media, pero es la de fondo)

**Evidencia.** Las features 32, 33, 34 y 35 se cerraron con leader, implementer y reviewer corriendo en **una sola sesión de un solo agente**. El harness no lo detectó ni lo registró: el `feature.js done` sólo exige que el verificador salga 0. La desviación quedó declarada **en prosa**, dentro de los propios `review_*.md` que escribió el mismo agente que implementó.

Eso es precisamente el *teléfono descompuesto* que el harness dice prevenir, y hoy no hay nada que lo impida ni que lo deje en el registro estructurado.

**Qué NO proponer.** Un chequeo que intente adivinar "¿fue el mismo agente?" es fácil de engañar y da falsa seguridad. No vale la pena.

**Forma propuesta (mínima y honesta).** Que `impl_`/`review_` lleven un campo de frontmatter `actor:` (quién lo produjo — modelo/sesión/humano) y que `validate_harness` avise con un NOTE cuando `impl_` y `review_` de una misma feature comparten `actor`. No bloquea, no adivina: sólo hace **visible en el registro** algo que hoy sólo existe si alguien lo confiesa en prosa.

### G4 · La capa LLM está desconectada del harness (severidad: media — y conecta con la §2)

**Evidencia.** `grep -rln "toolbox" .github/agents/` no devuelve nada: **ningún rol menciona el toolBox**. Las 4 features nuevas (triage, acceptance, review-notes, retro) están diseñadas exactamente para asistir a esos roles, y ninguno sabe que existen.

Es la consecuencia natural de §2: hoy usarlas exige levantar un server y hacer HTTP a mano, cosa que un rol no va a hacer.

---

## 2. Investigación: peticiones a modelos por toolBox

### 2.1 Cómo es hoy

La única forma de que un modelo conteste algo a través de toolBox:

```bash
node handyman/dist/toolbox.js serve            # levanta el Next standalone, puerto 8765
curl -X POST http://127.0.0.1:8765/api/triage \
  -H 'Content-Type: application/json' \
  -d '{"root":"/ruta/al/harness","provider":"zai"}'
```

Dos hechos verificados que definen el problema:

- **`buildProviders` tiene exactamente UN consumidor:** `apps/web/lib/runtime.ts:62`. Nada más en el repo construye proveedores.
- **Ningún subcomando de `toolbox.js` toca un modelo.** Son `{register, unregister, list, discover, status, health, heartbeat, timeline, moc, serve}`.

O sea: **toda la capa LLM es inalcanzable sin arrancar un servidor web.** Para un harness cuyo trabajo ocurre en la terminal, eso es la barrera equivocada.

### 2.2 El hallazgo: el trabajo difícil ya está hecho

Los `relay*` del core son **HTTP-agnósticos por diseño**: reciben un `draft()` inyectado y emiten `onDelta` / `onResult` / `onError`. No saben qué es una Response ni un SSE — el framing lo pone la ruta.

La prueba no es teórica: **las 4 suites unitarias ya los llaman sin ningún servidor** — 34 call sites entre `test_toolbox_{triage,retro,acceptance,review_notes}.js`, todas con un `draft()` falso, todas verdes en el gate.

Y todo lo que un CLI necesitaría ya está exportado del core (verificado importando `dist/index.js`):

```
OK  buildProviders   OK  loadDotEnv      OK  handymanRoot
OK  relayTriage      OK  relayRetro      OK  relayAcceptance
OK  relayReviewNotes OK  relayAsk        OK  resolveWorkspace
OK  isRegisteredRoot OK  composeTriageSystem
```

**Un subcomando CLI es: construir proveedores del entorno → resolver el root → componer → llamar al relay → imprimir.** Sin servidor, sin puerto, sin HTTP, sin abstracción nueva.

### 2.3 Opciones

| | Qué | Costo | Veredicto |
|---|---|---|---|
| **A** | Subcomandos `toolbox.js` que llaman al core directo | **Bajo** — el core ya es agnóstico y está exportado | ✅ **Recomendada** |
| B | `toolbox call <ruta>` como cliente HTTP contra el server | Medio | ❌ Exige el server arriba y duplica transporte para nada |
| C | Servidor MCP exponiendo los relays como tools | Alto | ⏸ Interesante para agentes, pero es otra conversación |

**Recomendación: A.** B invierte la relación (mete HTTP donde no hace falta); C es un contrato nuevo con el que no conviene empezar. A además **destraba G4**: un rol puede correr `toolbox review-notes --root . --feature X` sin tocar un browser.

### 2.4 La trampa a evitar (aprendizaje directo de D-B)

Si el CLI compone su propio prompt y contexto, quedan **dos** sitios haciendo "resolver root → leer workspace → componer → relay": el `route.ts` y el subcomando. Es la misma clase de duplicación que D-B, en otro eje — y esta vez conviene verla **antes** de escribir el segundo, no en el séptimo.

**Restricción de diseño para la Fase 2:** antes del segundo subcomando, extraer al core un `runTriage(root, provider, model)` (y sus hermanos) que devuelva el resultado ya armado, y que **la ruta y el CLI sean dos presentaciones de esa misma función**. La ruta se queda sólo con el framing SSE; el CLI, sólo con imprimir. Si el primer subcomando muestra que no calza, se anota por qué y se dejan separados.

### 2.5 Detalles que hay que decidir al implementar

- **Salida:** texto en streaming a stdout por defecto (`--json` para consumo por máquina). Los roles del harness van a querer `--json`.
- **Guard del registry:** el CLI **mantiene** `isRegisteredRoot`. Aunque corra local, el registry sigue siendo la allowlist de toda lectura del workspace (§6 del análisis).
- **Claves:** `loadDotEnv` desde el cwd, misma precedencia que `runtime.ts` (el entorno existente gana).
- **Sin red en tests:** mismo patrón que ya funciona — proveedor `ollama` apuntado a un mock local.

---

## 3. Secuencia propuesta

### Fase 1 · Los dos verbos que faltan (G1) — esfuerzo S

`feature.js unblock` + `feature.js acceptance --from FILE`, con su suite en `test_feature.sh`. Es lo más barato y lo que hoy obliga a violar una regla escrita.

**Gate:** `./init.sh` exit 0; casos nuevos que verifiquen `blocked → pending` sin `blocked_reason`, y que `acceptance --from` reemplace la lista y valide contra el schema.

### Fase 2 · Un subcomando LLM, no cinco (§2) — esfuerzo M

**Empezar por `toolbox review-notes`**: es el de mayor valor para un rol (el reviewer lo usa como semilla) y el que mejor prueba la forma, porque necesita workspace + diff + proveedor. Con ése verde se decide 2.4 y recién ahí salen los otros cuatro.

**Gate:** `./init.sh` exit 0; suite nueva contra el mock local, sin red; el subcomando corre **sin** `toolbox serve` levantado.

### Fase 3 · Conectar la capa con los roles (G4) — esfuerzo S

Con al menos un subcomando vivo, anotar en `.github/agents/reviewer.agent.md` (y los que correspondan) que existe y es **opcional y asistivo**: la firma del reviewer sigue apoyándose en el verificador y el diff, nunca en la salida del modelo.

### Fase 4 · Higiene de registro (G2 + G3) — esfuerzo S

Los dos NOTE no bloqueantes de `validate_harness`: deuda de evidencia y colisión de `actor`. Van juntos porque tocan la misma función y comparten la misma decisión de diseño (avisar, no romper).

### Explícitamente NO ahora

- **MCP (opción C)** — contrato nuevo, sin demanda todavía.
- **Endurecer el gate con la deuda de evidencia** — primero que avise; romper gates ajenos de entrada es hostil.
- **UI para `/api/retro`** — la ruta existe y está probada; nadie pidió vista.
- **Los otros 4 subcomandos LLM** — salen de la Fase 2, no antes.

---

## 4. Puntos abiertos para el humano

1. **¿Las features 32-35 necesitan revisión independiente antes del merge a `main`?** Se cerraron con los tres roles colapsados en un agente. La evidencia ejecutable es real (gate verde, oráculo 40/40), pero la independencia implementer/reviewer no se cumplió. Yo no puedo suplirla revisándome a mí mismo. Es la decisión más importante de este doc.

2. **La historia de la rama sigue abierta.** El plan anterior planteaba tres opciones para `b53c9e4` (90 archivos, 4 features); ahora se suma `6f08840`, que agrupa las fases 0-3 completas — 4 features más, el hook y el barrido. Si `git log` va a servir como registro por feature, esto se decide antes del PR.

3. **¿`actor:` en el frontmatter (G3) vale el costo?** Toca la plantilla de reportes y el advisory. Es la única propuesta de este doc que cambia un formato que ya usan harnesses instalados.

---

## 5. Resumen

| # | Qué | Por qué |
|---|-----|---------|
| G1 | `unblock` + `acceptance` en `feature.js` | El harness pide una operación que no ofrece; obliga a violar `architecture.md:138` |
| G2 | Deuda de evidencia como NOTE en `validate_harness` | Hoy se calcula sólo por HTTP; el gate no la ve |
| G3 | `actor:` + aviso de colisión impl/review | La independencia de roles hoy sólo existe si alguien la confiesa en prosa |
| G4 | Los roles no saben que el toolBox existe | Se resuelve solo cuando haya CLI (Fase 2 → 3) |
| §2 | Subcomando LLM sin servidor | El core ya es HTTP-agnóstico y está exportado: el trabajo difícil está hecho |
