---
type: Sprint
---

# Plan de acción · G1-G4

**Fecha:** 2026-07-19 · **Rama:** `feat/llm-toolbox-tasks` (`6f08840`, árbol limpio)
**Diagnóstico de origen:** [plan-huecos-harness-y-cli-llm.md](plan-huecos-harness-y-cli-llm.md)
**Estado del backlog:** 21 `done`, 0 pendientes, `max id = 50`, sprint abierto `2026-SP6`.

Este doc convierte los 4 huecos en trabajo reclamable: qué feature, con qué acceptance, en qué orden y con qué riesgo. Las acceptance están redactadas con el mismo contrato que exige la feature 33 — verbos observables, artefacto concreto, gate verde como última bala.

---

## 0. Cuatro huecos, cinco features (y por qué)

G1, G2 y G3 son una feature cada uno. **G4 no se puede hacer solo**: "los roles no saben que el toolBox existe" no tiene arreglo útil mientras usar el toolBox exija levantar un server y hacer curl. Necesita el CLI primero. Así que G4 se parte en dos:

| Hueco | Feature | Depende de |
|-------|---------|-----------|
| G1 | 51 · `harness_unblock_verbs` | — |
| G2 | 52 · `harness_evidence_debt_advisory` | — |
| G3 | 53 · `harness_report_actor` | — (pero **requiere decisión previa**, ver §3) |
| G4 (prerequisito) | 54 · `toolbox_cli_review_notes` | — |
| G4 (cierre) | 55 · `harness_roles_toolbox_pointer` | 54 |

---

## 1. Las features

### 51 · `harness_unblock_verbs` — esfuerzo S · riesgo bajo

> El harness imprime «unblock blocked work» y no ofrece cómo. La Fase 0 del plan anterior tuvo que editar `feature_list.json` por script, violando `architecture.md:138`.

**Descripción.** Dos verbos atómicos en `feature.js`: `unblock` (blocked → pending) y `acceptance` (reemplaza la lista). Mismo camino de escritura validada que el resto de los verbos.

**Acceptance:**
1. `node dist/feature.js unblock <name>` sobre una feature `blocked` la deja en `pending`, elimina la clave `blocked_reason` y sale 0.
2. `node dist/feature.js unblock <name>` sobre una feature que NO está `blocked` sale con código distinto de 0 y no modifica `feature_list.json`.
3. `node dist/feature.js acceptance <name> --acceptance "A" --acceptance "B"` reemplaza la lista completa de acceptance por exactamente `["A","B"]` y sale 0.
4. `node dist/feature.js acceptance <name>` sin ninguna `--acceptance` sale distinto de 0 y deja la lista intacta (no se borra una acceptance por olvido).
5. Ambos verbos validan contra `assets/schemas/feature_list.schema.json` antes de escribir: un resultado inválido aborta sin tocar el archivo.
6. `tests/test_feature.sh` cubre los 4 casos anteriores siguiendo el patrón del caso F3 (`block`).
7. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

**Notas de implementación.** `--acceptance` repetible **igual que `add`** (que ya lo hace), no `--from FILE`: cero conceptos nuevos. Si el quoting de balas largas termina doliendo en la práctica, `--from FILE` se agrega después como conveniencia — no antes de tener la molestia.

---

### 52 · `harness_evidence_debt_advisory` — esfuerzo S · riesgo bajo

> `validate_harness` sólo revisa el frontmatter de los `review_` que existen (`validate_harness.ts:318-374`); nunca cruza contra `feature_list.json`. La feature 32 calcula esa deuda pero sólo detrás de `POST /api/triage`: **el gate no la ve**.

**Descripción.** Llevar `computeEvidenceDebt` (ya en el core, ya testeada) al verificador como NOTE no bloqueante, mismo contrato que el advisory de frontmatter.

**Acceptance:**
1. `validate_harness` imprime un `NOTE:` por cada feature en estado `done` cuyo backlog carece de `review_<name>.md`, nombrando el archivo faltante.
2. Ese NOTE **no** cambia el exit code: un harness con deuda de evidencia sigue saliendo 0 (mismo contrato que el advisory de frontmatter existente).
3. Un harness sin deuda no imprime ningún NOTE de deuda: el caso limpio es silencioso.
4. La comprobación reusa `computeEvidenceDebt` de `@handyman/toolbox-core` (dependencia ya declarada en `handyman/package.json`); no re-implementa el cruce.
5. `tests/test_init.sh` cubre las dos direcciones: un fixture con una feature `done` sin review imprime el NOTE y sale 0; un fixture limpio no lo imprime.
6. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

**Por qué NOTE y no gap.** Romper el exit code de harnesses instalados que ya arrastran deuda legítima es hostil. Que avise primero; endurecerlo después es cambiar una línea, y con datos.

**Efecto secundario a esperar.** Este harness va a empezar a imprimir NOTEs por features viejas sin `review_`. Es información correcta, no una regresión.

---

### 53 · `harness_report_actor` — esfuerzo M · riesgo **medio** · ⚠️ requiere decisión previa

> Las features 32-35 se cerraron con leader, implementer y reviewer colapsados en un solo agente. El harness no lo detectó ni lo registró: la desviación existe sólo porque se escribió en prosa, en reviews firmadas por el mismo agente que implementó.

**Descripción.** Un campo `actor:` en el frontmatter de `impl_`/`review_`, y un aviso cuando ambos coinciden para una misma feature. No adivina nada: hace visible en el registro estructurado algo que hoy depende de una confesión.

**Acceptance:**
1. Las plantillas `assets/role-implementer.template.md` y `assets/role-reviewer.template.md` documentan el campo `actor:` en el frontmatter de los reportes que producen.
2. `validate_harness` imprime un `NOTE:` cuando `impl_<f>.md` y `review_<f>.md` de una misma feature declaran el mismo `actor:`.
3. El NOTE **no** cambia el exit code, y un reporte sin `actor:` no genera ruido (el campo es opcional: los reportes históricos no se invalidan).
4. `tests/test_docs.js` verifica que las plantillas documentan `actor:`; `tests/test_init.sh` cubre el NOTE de colisión y su ausencia cuando los actores difieren.
5. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

**⚠️ Riesgo real.** Es la única de las cinco que **cambia un formato que ya usan harnesses instalados**. Por eso la bala 3 hace el campo opcional. Aun así, decidir antes de empezar: ver §3.

---

### 54 · `toolbox_cli_review_notes` — esfuerzo M · riesgo bajo

> `buildProviders` tiene un solo consumidor (`apps/web/lib/runtime.ts:62`) y ningún subcomando de `toolbox.js` toca un modelo: la capa LLM es inalcanzable sin arrancar un server web.

**Descripción.** El primer subcomando LLM del CLI. Se elige `review-notes` porque es el de mayor valor para un rol y el que mejor prueba la forma (necesita workspace + diff + proveedor). **Uno, no cinco**: con éste verde se decide si extraer la composición compartida.

**Acceptance:**
1. `node dist/toolbox.js review-notes --root <path> --feature <name>` imprime el checklist en stdout **sin que haya ningún `toolbox serve` levantado** y sale 0.
2. Sale distinto de 0, con mensaje en stderr y **antes de llamar al modelo**, cuando el root no está registrado (`isRegisteredRoot`), el provider es desconocido, o falta `--feature`.
3. `--json` emite un único objeto JSON con `checklist_md`, `model` y `diff_truncated`; sin `--json` la salida es texto en streaming.
4. Reusa `relayReviewNotes` y las funciones de composición del core; no re-implementa el prompt ni la lectura del diff.
5. La ruta HTTP `POST /api/review-notes` y el subcomando comparten la composición del contexto **o** el reporte del implementer anota explícitamente por qué no se pudo (ver §4).
6. `tests/test_toolbox_cli_llm.sh` cubre el camino feliz contra el mock OpenAI-compatible local (`OLLAMA_BASE_URL`), los rechazos de la bala 2, y `--json`; el server **no** se levanta en ningún caso. Ningún test toca la red.
7. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

**Por qué es barato.** Los `relay*` ya son HTTP-agnósticos: reciben un `draft()` inyectado. Las 4 suites unitarias ya los llaman sin servidor (34 call sites), y las 11 piezas que el CLI necesita ya están exportadas de `dist/index.js` (verificado). El trabajo difícil está hecho.

---

### 55 · `harness_roles_toolbox_pointer` — esfuerzo S · riesgo bajo · depende de 54

**Descripción.** Cerrar G4: que los roles sepan que la capa existe, sin que eso erosione su autoridad.

**Acceptance:**
1. `assets/role-reviewer.template.md` menciona `toolbox.js review-notes` como ayuda **opcional y asistiva** para preparar la revisión.
2. El mismo texto deja explícito que el veredicto se firma sobre el verificador y el diff, **nunca** sobre la salida del modelo.
3. El cambio se hace en `handyman/assets/role-*.template.md`, no en `.github/agents/*.agent.md`: esos últimos son **instancias generadas** y `init.sh` los regenera.
4. `tests/test_docs.js` verifica que la plantilla del reviewer nombra el subcomando y conserva la cláusula de "la firma va sobre evidencia real".
5. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

---

## 2. Orden de ejecución

```
51 (G1) ──► 54 (G4a) ──► 55 (G4b)
52 (G2) ─┘
53 (G3) ── requiere decisión antes de entrar a la cola
```

**Secuencia recomendada: 51 → 52 → 54 → 55 → 53.**

- **51 primero.** Es el más barato y es el único que hoy obliga a violar una regla escrita del harness. Además lo va a usar el propio leader al gestionar esta cola.
- **52 segundo.** Independiente, barato, y deja de mentir el gate. Hacerlo antes que 53 evita dos features tocando `checkFrontmatterAdvisory` en paralelo.
- **54 tercero.** El de mayor valor y el que decide la pregunta de diseño de §4.
- **55 después de 54**, por dependencia real.
- **53 al final**, y sólo si se resuelve §3 — es la de más blast radius y la menos urgente.

**No paralelizar 52 y 53:** ambas tocan la misma función de `validate_harness`. La segunda debe rebasar sobre la primera.

---

## 3. Lo que hay que decidir antes de empezar

**Única decisión bloqueante: ¿entra la 53 (`actor:`)?**

Es la única propuesta que cambia un formato usado por harnesses ya instalados. Las opciones:

- **(a) Hacerla como está** — campo opcional, NOTE no bloqueante. Blast radius contenido, pero toca plantillas que otros repos ya tienen instaladas.
- **(b) Reducirla** a sólo el NOTE de colisión, sin tocar plantillas: se compara `actor:` cuando existe y no se documenta nada nuevo. Más barato, menos útil (nadie va a llenar un campo que no está documentado).
- **(c) No hacerla.** Aceptar que la independencia de roles es una convención social y no un invariante verificable, y que quede declarada en prosa como hasta ahora.

**Mi recomendación: (a)**, pero con la advertencia honesta de que resuelve *visibilidad*, no *cumplimiento*: un agente que corre los tres roles y pone tres `actor:` distintos pasa igual. Sirve para que la desviación quede en el registro, no para impedirla. Si lo que se busca es impedirla, eso es proceso (dos sesiones separadas), no código — y conviene decirlo en vez de fingir que un chequeo lo cubre.

---

## 4. La trampa de diseño que hay que mirar en la 54

Si el subcomando compone su propio prompt y contexto, quedan **dos** sitios haciendo «resolver root → leer workspace → componer → relay»: `app/api/review-notes/route.ts` y el CLI. Es D-B otra vez, en otro eje.

**Regla para la 54:** mirar antes de escribir el segundo consumidor, no en el séptimo. Lo natural es extraer al core un `runReviewNotes(root, feature, provider, model)` que devuelva el resultado armado, y que la ruta se quede sólo con el framing SSE y el CLI sólo con imprimir. Si al hacerlo se ve que no calza, **se dejan separados y se anota por qué** — que es exactamente lo que la bala 5 de su acceptance exige.

---

## 5. Registrar la cola

Los 5 `feature.js add` están listos para correr. **No los ejecuté**: pediste el plan, y registrar muta el backlog.

Dos avisos antes de correrlos:

- `feature.js add` **no asigna `sprint`** (verificado en `feature.ts:624-630`): las 5 entran sin sprint y hay que asignarlas con `sprint.js` si se quieren dentro de `2026-SP6`.
- Los ids salen secuenciales desde 51 **en el orden en que se corran los comandos**. La dependencia de la 55 asume que la 54 se agregó antes.

Decime y las registro en el orden de §2. Si preferís empezar sólo por la 51 y la 54 —las dos que realmente destraban algo— también es una opción razonable: 52 y 53 pueden esperar sin costo.
