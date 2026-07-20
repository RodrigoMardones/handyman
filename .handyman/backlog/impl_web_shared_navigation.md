---
feature: web_shared_navigation
status: implemented
role: implementer
actor: implementer-copilot-run74
updated: 2026-07-20
tags: [handyman/backlog, handyman/implementation, web]
---

# Implementation: web_shared_navigation

## Summary

Se reemplazaron las siete barras globales divergentes por un unico Server
Component `AppNav`. La barra publica Fleet, Activity, Find, Draft y Ask en ese
orden, mantiene una sola instancia cliente de `ToolboxShell` y usa props
explicitos para el destino activo y para `aria-current="page|location"`.

## Files Changed

- `apps/web/components/AppNav.tsx`
- `apps/web/components/AppNav.module.css`
- `apps/web/components/ToolboxShell.module.css`
- `apps/web/app/fleet/page.tsx`
- `apps/web/app/fleet/page.module.css`
- `apps/web/app/timeline/page.tsx`
- `apps/web/app/timeline/page.module.css`
- `apps/web/app/search/page.tsx`
- `apps/web/app/search/page.module.css`
- `apps/web/app/intake/page.tsx`
- `apps/web/app/intake/page.module.css`
- `apps/web/app/ask/page.tsx`
- `apps/web/app/ask/page.module.css`
- `apps/web/app/harness/[name]/page.tsx`
- `apps/web/app/harness/[name]/page.module.css`
- `apps/web/app/harness/[name]/new/page.tsx`
- `apps/web/lib/palette.ts`
- `tests/test_web_navigation.sh`
- `tests/test_web_timeline_search.sh`
- `tests/run_tests.sh`

## Design Notes

- `APP_NAV_ITEMS` es la unica fuente de los cinco enlaces renderizados por
  AppNav. Una sola funcion deriva dos listas: `desktopLinks` fuera del
  disclosure y `mobileLinks` dentro de `details/summary`.
- Desktop conserva una fila sticky sin wrap y oculta el `details`. A 760px se
  oculta `desktopLinks` y el disclosure nativo expone `mobileLinks` sin
  listeners adicionales. Ambas variantes calculan `aria-current` con la misma
  funcion; solo la variante del breakpoint activo puede ser visible.
- Summary, links moviles, palette y theme controls conservan objetivos de 44px,
  foco visible y la paleta/radios/tokens existentes.
- Fleet, Activity, Find, Draft y Ask usan `currentKind="page"`. Las dos rutas
  harness usan Fleet con `currentKind="location"` y mantienen breadcrumb,
  nombre de harness, New feature y Add feature como contexto local.
- Se eliminaron solo los selectores de navegacion duplicados de los modulos de
  pagina. La vista new sigue compartiendo el modulo CSS del padre.
- `PALETTE_VIEWS` replica los cinco labels/hrefs. Sus keywords incluyen el
  pathname para que consultas historicas como `timeline` sigan encontrando
  Activity; los atajos `g f`, `g t` y `g s` no cambiaron.

## Fix round 1

El leader reprodujo un defecto real con Playwright a 1440x900: Fleet,
Activity, Find, Draft y Ask devolvian `isVisible=false`, y el snapshot accesible
solo mostraba toolBox y `ToolboxShell`. La causa era estructural: la unica lista
estaba dentro de un `<details>` cerrado; `display: contents` no anula el
ocultamiento nativo de los descendientes del disclosure.

La correccion mueve `desktopLinks` fuera de `details`, mantiene `mobileLinks`
dentro y reemplaza `display: contents` por visibilidad mutuamente exclusiva en
CSS. El test estructural ahora comprueba las dos posiciones DOM, una sola
iteracion sobre `APP_NAV_ITEMS`, dos renderizados desde la misma funcion y las
reglas CSS desktop/mobile. No afirma visibilidad de navegador; esa evidencia
queda en la verificacion Playwright del leader.

## Verification

- Primer test dedicado, antes de implementar: 1/7 passed, 6 failed por AppNav
  ausente, adopcion pendiente y palette antigua (rojo esperado).
- Primer corte AppNav + Fleet: 5/7 passed, 2 failed por las seis paginas y la
  palette pendientes (rojo parcial esperado).
- `bash tests/test_web_navigation.sh`: 9/9 passed.
- `bash tests/test_web_timeline_search.sh`: 18/18 passed.
- `bash tests/test_web_intake_ask.sh`: 19/19 passed.
- `bash tests/test_web_fleet.sh`: 10/10 passed.
- `bash tests/test_web_harness.sh`: 14/14 passed.
- `pnpm --filter @handyman/web typecheck`: passed.
- `pnpm --filter @handyman/web build`: passed; conserva el warning NFT
  preexistente de `apps/web/lib/runner.ts`.
- `find handyman/scripts tests -name '*.sh' -print0 | xargs -0 shellcheck -S warning`:
  passed sin warnings.
- `bash tests/run_tests.sh`: ALL SUITES PASSED.
- `./init.sh`: VERIFIER all gates passed; preflight final `status: ok`.
- Playwright/screenshots no se ejecutaron por instruccion del leader; la
  validacion visual en 1440x900 y 390x844 queda para su fase de cierre.

### Fix round 1 verification

- Baseline previo al fix: `bash tests/test_web_navigation.sh` paso 9/9 pese al
  defecto Playwright, confirmando el falso negativo estructural.
- Primera validacion inmediata: 8/9; la nueva comprobacion CSS detecto un escape
  incorrecto en su propio matcher. Tras corregir solo ese matcher: 9/9.
- Regresiones focalizadas: timeline/search 18/18, intake/ask 19/19, fleet 10/10
  y harness 14/14.
- `pnpm --filter @handyman/web typecheck`: passed.
- `pnpm --filter @handyman/web build`: passed; conserva el warning NFT
  preexistente de `apps/web/lib/runner.ts`.
- ShellCheck sobre `init.sh`, `handyman/scripts` y `tests`: passed.
- `bash tests/run_tests.sh`: ALL SUITES PASSED.