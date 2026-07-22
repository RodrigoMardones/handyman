---
type: Implementation Log
feature: okf_memoria_alignment
status: implemented
role: implementer
actor: agente-local (leader/implementer)
updated: 2026-07-19
tags: [handyman/role/implementer, handyman/feature/okf_memoria_alignment, handyman/topic/okf]
---

# Implementation Report: okf_memoria_alignment

Cambio mínimo conformante con OKF v0.1 según `[[explore_okf_memoria]]`, con la
ontología decidida por el humano (2026-07-19): **los reportes de cierre son
logs** (`impl_*` → `Implementation Log`, `review_*` → `Review Log`) y **la
investigación es conocimiento** (`explore_*` → `Explore Report`). Sin mover
archivos: la semántica va solo en el frontmatter, así el contrato de rutas del
harness (`backlog/impl_<feature>.md`, etc.) queda intacto.

## Files Changed

Writers y plantillas (archivos nuevos nacen conformantes):

- `handyman/assets/backlog-impl.template.md` — `type: Implementation Log`.
- `handyman/assets/backlog-review.template.md` — `type: Review Log`.
- `handyman/assets/backlog-explore.template.md` — `type: Explore Report`.
- `handyman/assets/sprint.template.md` — `type: Sprint`.
- `handyman/assets/progress-current.template.md` y `progress-history.template.md` — `type: Session Log`.
- `handyman/assets/docs-{business,architecture,conventions,verification}.template.md` y `feature-request.template.md` — frontmatter mínimo `type: Doc`.
- `handyman/assets/index.template.md` — sin frontmatter y links markdown (archivo reservado OKF).
- `handyman/src/feature.ts` — `SESSION_TEMPLATE` emite `type: Session Log` (current.md se escribe por código, no desde plantilla).
- `handyman/src/index_md.ts` — `buildIndex` ya no emite frontmatter y todos los links internos son markdown relativos (`[stem](ruta.md)`) en Docs/Progress/Backlog; docstring actualizado.

Tests (mismo nivel de riesgo que el cambio):

- `tests/test_backlog.sh` — B1/B2/B4 exigen el `type:` correcto por rol.
- `tests/test_feature.sh` — F1 exige `type: Session Log` en current.md.
- `tests/test_sprint.sh` — el doc de cierre exige `type: Sprint`.
- `tests/test_index.sh` — I1 sin frontmatter (primera línea = título, sin `---`), I2/I6 links markdown y cero `[[`.
- `tests/test_docs.js` — contrato Obsidian: `type:` pasa a clave requerida en plantillas, `handyman/moc` deja de exigirse, check nuevo de que `index.template.md` no arranca con frontmatter.

Migración one-shot del workspace vivo (script en el reporte, ver Design Notes):

- 331 .md con frontmatter recibieron `type:` como primera clave.
- 14 huérfanos (docs/, handoffs, planes de sprint, templates) recibieron frontmatter mínimo `type:` — exactamente los 14 que listó el explore report.
- `index.md` regenerado con `node handyman/dist/index_md.js --root .`.
- Resultado: 345/345 .md del bundle (excluyendo `.upgrade-backups/` e `index.md`) con `type:` no vacío.

## Design Notes

- `type:` va como primera clave del frontmatter por visibilidad; valores en
  inglés y libres (OKF no registra valores; consumers deben tolerar claves
  desconocidas, así que `feature`/`role`/`status`/`updated` sobreviven intactos).
- Regla determinista de tipos por ruta: `backlog/impl_*` → Implementation Log,
  `backlog/review_*` → Review Log, `backlog/explore_*` → Explore Report,
  `docs/sprints/*` → Sprint, `progress/*` → Session Log, resto → Doc.
- `index.md` es archivo reservado OKF: listado de directorio **sin frontmatter**.
  Obsidian renderiza links markdown igual que wikilinks, el vault no pierde nada.
  La sección `## Notes` y su preservación no cambian.
- El MOC de flota del toolBox (`toolbox.js moc`, `$HANDYMAN_ROOT/index.md`) queda
  fuera de alcance: no es parte del bundle `.handyman`.
- Los wikilinks en cuerpos de reportes viejos se quedan (los consumers OKF
  toleran links rotos; el grafo grueso vive en index.md, ya conformante).
- One-shot ejecutado (no persiste como comando; el código quedó aquí):
  inserta `type:` tras el fence de apertura si el bloque no lo tiene, o
  antepone `---\ntype: <T>\n---\n\n` a los huérfanos; excluye
  `.upgrade-backups/` e `index.md`.

```js
// okf_type_oneshot.mjs (resumen ejecutado el 2026-07-19)
for (const p of walk(WS)) {
  const rel = relative(WS, p);
  if (rel === "index.md") continue;
  const t = typeFor(rel); // regla por ruta, ver arriba
  const lines = readFileSync(p, "utf-8").split("\n");
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (!lines.slice(1, close).some((l) => /^type:\s*\S/.test(l))) {
      lines.splice(1, 0, `type: ${t}`);
      writeFileSync(p, lines.join("\n"));
    }
  } else {
    writeFileSync(p, `---\ntype: ${t}\n---\n\n` + lines.join("\n"));
  }
}
```

Mejoras futuras nombradas, no construidas (lente ponytail): `okf_lint` en
`validate_harness` (hoy un .md nuevo sin `type` no avisa), conversión
wikilink→markdown en cuerpos, proyección de `feature_list.json` a conceptos
`type: Feature`, `timestamp:` ISO en writers, `log.md` raíz derivado de
`progress/history.md`, smoke de interop con el `visualize` del reference agent
de Google.

## Test Output

```text
./init.sh -> exit 0 (post-cambio y post-migración)
Doc-structure suite: 219 run, 219 passed, 0 failed
Verifier-contract suite: 28 run, 28 passed, 0 failed
Updater-contract suite: 12 run, 12 passed, 0 failed
Feature-CLI suite: 40 run, 40 passed, 0 failed
Backlog-generator suite: 12 run, 12 passed, 0 failed
Index-MOC suite: 6 run, 6 passed, 0 failed
Upgrade-check suite: 10 run, 10 passed, 0 failed
Tools-discovery suite: 16 run, 16 passed, 0 failed
(resto de suites del verifier: 0 failed; exit global 0)

Conformancia del bundle:
  345 .md (sin .upgrade-backups/ ni index.md) / 345 con `type:` no vacío
  index.md: sin frontmatter, 0 wikilinks
```
