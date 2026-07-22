---
type: Implementation Log
feature: backlog_review_reissue
status: implemented
role: implementer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/implementer, handyman/feature/backlog_review_reissue]
---

# Implementation Report: backlog_review_reissue

## Files Changed

El árbol arrastra el lote 50-55 sin commitear, así que `git diff HEAD` no delimita
esta feature. Lo suyo:

- `handyman/src/backlog.ts`
  - `reissueVerdict(text, status) -> [string, boolean]`: nueva. Re-sella los tres
    tokens del veredicto conservando el cuerpo.
  - `reviewExisting(dest, status, force)`: nueva. Las tres direcciones del caso
    «el reporte ya existe».
  - `declaredStatus(text)`: nueva. Lee `status:` del frontmatter.
  - `cmdReview`: desvía a `reviewExisting` cuando el destino existe; el camino de
    creación queda igual (`render` + `writeEntry`).
  - `ParsedArgs.force`, `parseSubArgs` acepta `--force` (sólo en `review`).
  - Header del módulo, `subUsage`, `printSubHelp` y `printMainHelp` actualizados.
- `tests/test_backlog.sh` — 4 casos: B8, B9, B10, B11.

## Bala 4: qué se eligió y por qué

La acceptance dejaba la elección al implementer entre **preservar el cuerpo** y
**reescribir desde plantilla**. Se eligió **preservar el cuerpo**.

Reescribir desde plantilla destruiría los hallazgos, la evidencia y el `Required
Changes` que el reviewer escribió — que es *el* contenido del reporte. `writeEntry`
tiene una política explícita de no sobreescribir contenido project-owned, y existe
para proteger exactamente eso. Un `--force` que la violara estaría descartando la
revisión mientras dice que la actualiza.

Sólo cambian los tres tokens que codifican el veredicto, que son los mismos tres que
`cmdReview` voltea al renderizar la plantilla:

1. `status:` en el frontmatter — la única clave que lee algún consumidor
   (`feature.js done` vía `reviewVerdict`, `metrics.ts`, `sprint.ts`,
   `validate_harness.ts`).
2. El tag `handyman/review/<status>`, para que la lista de tags no contradiga al
   frontmatter.
3. El marcador humano bajo `## Verdict`.

**Consecuencia verificada:** un reporte re-emitido queda **byte-idéntico** a uno
generado de cero con ese veredicto. B11 lo fija comparando contra el generador en
vez de contra una expectativa escrita a mano.

## Design Notes

- **Un defecto encontrado y corregido durante la implementación.** La plantilla trae
  un comentario-guía que nombra el *otro* veredicto
  (`APPROVED   <!-- or CHANGES_REQUESTED -->`). La primera versión volteaba sólo el
  token inicial y producía `APPROVED   <!-- or APPROVED -->`: un archivo sin sentido,
  y del tipo que ningún test hubiera visto si el test se hubiera escrito mirando sólo
  la primera palabra. La regla correcta es intercambiar ambos tokens en esa línea;
  ninguno es subcadena del otro, así que el swap no es ambiguo. B11 existe por esto.
- **Tres direcciones, porque «ya existe» no es una sola situación.** Mismo veredicto
  sin bandera es idempotencia (0); veredicto contradicho sin bandera es error (1);
  `--force` re-sella. La bala 2 es el cambio de contrato: antes salía 0 y quien
  llamaba no podía distinguir el no-op de una escritura.
- **El mensaje de error nombra los dos veredictos y el archivo**, para que el no-op
  deje de ser silencioso también para un humano.
- **`bodyFlipped`.** Si el `## Verdict` no tiene marcador reconocible —un reporte
  reestructurado a mano— el frontmatter se actualiza igual y la salida imprime un
  NOTE diciendo que no había marcador que tocar. No se inventa coherencia que no se
  pudo producir. (El único caso sin cobertura de suite; ver el review.)
- **Parsing propio en vez de `parseFrontmatter` del core.** `reissueVerdict` tiene
  que *reescribir* líneas preservando el resto del archivo byte a byte;
  `parseFrontmatter` devuelve un objeto y perdería el cuerpo. `declaredStatus`
  recorre las mismas líneas y evita una segunda forma de leer lo mismo. Sin deps
  nuevas y sin import nuevo.
- **`--force` sólo se acepta en `review`**, igual que `--status`: `impl` y `explore`
  no tienen veredicto que re-emitir.

## Test Output

```text
tests/test_backlog.sh
  PASS review: the same --status on an existing report exits 0 and leaves it alone
  PASS review: a differing --status without --force exits non-zero, naming both
  PASS review: --force flips the verdict tokens and preserves the body
  PASS review: a reissued report is byte-identical to a freshly generated one

Summary: 11 run, 11 passed, 0 failed

bash tests/run_tests.sh -> ALL SUITES PASSED
```
