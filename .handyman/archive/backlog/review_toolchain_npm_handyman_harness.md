---
type: Review Log
feature: toolchain_npm_handyman_harness
status: approved
role: reviewer
updated: 2026-07-19
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/toolchain_npm_handyman_harness]
---

# Review: toolchain_npm_handyman_harness

## Verdict

APPROVED

Auto-firma según decisión humana 2026-07-19 (sin review independiente
pedida); la garantía extra acordada — scan de secretos del tarball — corrió
y salió limpia. **El cierre de la feature queda gateado por el humano:** no
se publica hasta su OK, con tests verdes en local y en GitHub Actions.

## Stage 1: Spec Compliance

- [x] Acceptance 1: `npm pack` autocontenido — 54 entradas, sin
      `workspace:*`, sin `.env`, 12 verbos + dispatcher ejecutables
      (guards en `pack_npm.mjs` + 12 casos en `tests/test_npm_pack.sh`).
- [x] Acceptance 2: `npx --yes -p <tarball> handyman feature ready` en un
      directorio fuera del monorepo → exit 3 con output correcto (equivale a
      `npx handyman-harness ...` post-publish; el publish es acción humana).
- [x] Acceptance 3: versión 3.0.0 en repo y manifest de publish; la suite
      falla si reaparece 2.1.1.
- [x] Scope: solo empaquetado + dispatcher; el fix de `core/schema.ts` es
      consecuencia directa (el bundle aplanado rompía la resolución del
      schema — ENOENT reproducido y corregido con sonda de dos rutas).
- [x] El implementation report existe y coincide con el diff.

## Stage 2: Code Quality

- [x] Architecture: los dos dist conviven; el tsc del repo sigue siendo el
      oráculo (las suites bash no cambiaron ni un grep).
- [x] Conventions: observation shape `status: ok|error` en `pack_npm.mjs`;
      suite con `lib/assert.sh` y shellcheck limpio.
- [x] Tests meaningful: la suite fija el contrato del tarball (inventario,
      manifest, smoke sin node_modules) y corre igual en local y CI.
- [x] Verifier exits 0: `./init.sh` → ALL SUITES PASSED (2026-07-19).
- [x] Seguridad: 0 hits del valor real de `Z_AI_API_KEY` y de patrones de
      API key en el tarball extraído; 0 entradas `.env`.

## Required Changes

None.
