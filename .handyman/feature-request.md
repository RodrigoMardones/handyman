---
type: Doc
---

[Implementation]
## Feature
- name: toolbox_next_landing
- title: toolbox: Landing page en Next.js (tasteskill v2)

## Context
Aprovechando el scaffold de Next.js 16 estrangulado (feature #38) y los proveedores LLM (#37), la tarea pide generar la mayor cantidad de funcionalidad posible para la app web creando una landing page. La página se construye siguiendo estrictamente las reglas de diseño de "tasteskill v2", incluyendo auditorías de em-dash, layout y disciplina del hero.

## Scope
- Includes: apps/web/app/page.tsx (o alias /home), componentes de UI bajo apps/web/components/ (si aplica), imágenes generadas/vía Picsum, implementación de las 4 auditorías de tasteskill.

## Acceptance criteria (observable and testable)
- Exists `apps/web/app/page.tsx` serving a landing page with at least 8 sections and 4 different layout families.
- The page contains strictly zero em-dashes (U+2014) and zero en-dashes (U+2013) verifiable via a regex/lint test.
- The "Pre-Flight Check" (Section 14 of tasteskill) is documented in a commit message or comment with every box marked Pass or Fail with a one-line justification.
- Section-Layout-Repetition and Hero discipline audits are documented passing in the repository.
- The Next.js app builds successfully without type errors (`pnpm --filter @handyman/web build` or `npm run build` inside `apps/web`).
- bash tests/run_tests.sh passes

## Verification
- Gate that must stay green: ./init.sh
- Functional check: running `cd apps/web && pnpm run build` outputs a successful Next.js compilation without TS errors, and a node script asserting `!/[—–]/.test(pageSource)` passes.

## Considerations
- Apego estricto a tasteskill v2: layouts limpios, uso de imágenes reales (gen-tool primero, Picsum-seed después).
- Si el ambiente no tiene API keys para el gen-tool de imágenes, caer inmediatamente a Picsum-seed.
- Mantener el proxy.ts intacto para no romper el strangler pattern. possible overlap with #39 (fleet view), aunque este request prioriza la landing sobre /fleet.

## Post-feature
- Actualizar HARNESS_WORKSPACE/docs/ con el resultado de las auditorías (Pre-Flight Check, Section-Layout-Repetition, Hero discipline).
```

<!-- intake context files: apps/web/app/layout.tsx, apps/web/next-env.d.ts, apps/web/next.config.ts, apps/web/package.json, apps/web/proxy.ts, apps/web/tsconfig.json -->

