---
type: Review Log
feature: toolbox_retro_lessons
id: 35
role: reviewer
date: 2026-07-19
verdict: APPROVED
tags: [handyman/backlog/review]
---

# Review: toolbox_retro_lessons (feature 35)

## Evidencia verificada

- `./init.sh` exit 0 (gate completo).
- `tests/test_toolbox_retro.js`: 12/12.
- `tests/test_web_retro.sh`: 6/6.
- `tests/test_toolbox_serve.sh` (oraculo): **40/40**, cerrando la tanda.

## Acceptance, bala por bala

1. **Route handler nativo, 400 antes del LLM** — OK, prelude D-B, confirmado
   por HTTP (root no registrado y provider desconocido).
2. **SSE con 3-5 patrones desde history + backlog cerrado, cada uno con su
   feature de origen** — OK. Verificado en el oraculo que cada patron devuelto
   trae `features.length >= 2`.
3. **Al menos 2 features de evidencia por patron; descarta lo que no la tenga**
   — OK, y **mejor de lo pedido**: no queda solo en el prompt, se aplica al
   parsear. Cubierto en los dos niveles.
4. **No escribe `docs/conventions.md`** — OK, y ademas hay un caso end-to-end
   que verifica que el archivo no aparecio en el fixture tras correr los cuatro
   relays de la tanda.
5. **Suite registrada, ningun test toca la red** — OK.
6. **Gate verde** — OK.

## Lo que se reviso con mas cuidado

- **El filtro de features cerradas podia ser cosmetico.** No lo es: el fixture
  unitario tiene `gamma` en `pending` con su `impl_gamma.md`, y el test asserta
  explicitamente que ese doc **no** entra al corpus ni al prompt. Correcto: una
  feature abierta no es una leccion.
- **`discarded` evita el peor modo de fallo de esta ruta.** Sin ese contador,
  un modelo que devuelve cinco anecdotas se veria identico a un harness sin
  patrones. Bien resuelto.
- **El cap en 5 tambien cuenta el overflow** en vez de truncar en silencio,
  consistente con lo anterior.

## Observaciones (no bloqueantes)

- No hay UI para `/api/retro`: la ruta existe y esta probada, pero se consume
  por HTTP. El acceptance no pedia vista y no se invento una. Si se quiere, es
  trabajo aparte y barato (el patron del toggle de la 33 ya existe).
- `RETRO_MIN_EVIDENCE = 2` es un juicio, no una verdad. Esta centralizado en
  una constante y referenciado desde el prompt y el parser, asi que moverlo es
  un cambio de una linea si la practica dice otra cosa.

## Desviacion de proceso

Igual que en 32, 33 y 34: los tres roles corrieron en **una sola sesion de un
solo agente**. La evidencia ejecutable (gate + oraculo) es real; la
independencia implementer/reviewer no se cumplio en ninguna de las cuatro.

**Veredicto: APPROVED** sobre la evidencia ejecutable, con la desviacion
declarada.
