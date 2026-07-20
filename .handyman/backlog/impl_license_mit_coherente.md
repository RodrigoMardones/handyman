---
type: Implementation Log
feature: license_mit_coherente
status: implemented
role: implementer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/implementer, handyman/feature/license_mit_coherente]
---

# Implementation Report: license_mit_coherente

## Files Changed

- `handyman/package.json` — `"license": "Apache-2.0"` → `"MIT"` (una de las dos
  únicas declaraciones Apache del repo).
- `packages/toolbox-core/package.json` — ídem.
- `package.json` (raíz) y `apps/web/package.json` — se agrega `"license": "MIT"`;
  no declaraban licencia y el footer del panel ya decía "MIT licensed".

## Design Notes

- Decisión de negocio del 2026-07-19 (auditoría OSS): todo MIT. La evidencia era
  unánime salvo esas dos líneas: LICENSE raíz, NOTICE, handyman/LICENSE,
  README.md:222, SKILL.md:91 y apps/web/app/page.tsx:545 ya contaban MIT.
- Apache-2.0 no aportaba nada real acá (la cláusula de patentes es irrelevante
  para tooling de orquestación de un autor individual) y converger a Apache
  habría costado 6+ archivos y headers SPDX.

## Test Output

```text
grep '"license"' en los 4 package.json del workspace → 4x "MIT"
./init.sh: exit 0 (corrido por feature.js done)
```
