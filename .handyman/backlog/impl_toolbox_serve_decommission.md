---
type: Implementation Log
feature: toolbox_serve_decommission
status: implemented
role: implementer
updated: 2026-07-18
tags: [handyman/backlog/impl]
---

# Impl: toolbox_serve_decommission (feature 50, Phase 4)

> **Note de leader:** este reporte lo redacta el leader como evidencia de
> coordinacion despues de dos delegaciones al implementer cuyo canal de
> respuesta fue truncado por el artifact de renderizado (`cache_control`).
> Todo el codigo y los tests los escribio el implementer; el leader solo
> verifica y documenta. La autoridad sigue siendo la acceptance de
> `feature_list.json` y `docs/architecture.md`.

## Summary

Fase 4 del plan strangler Next.js: se eliminó el servidor Node heredado
`handyman/src/toolbox_serve.ts` (776 líneas) y `node dist/toolbox.js serve`
pasa a orquestar **un único proceso** — el Next.js standalone
(`apps/web/.next/standalone/apps/web/server.js`) que ya hospeda toda la UI
unificada y todos los endpoints migrados. El wrapper elige puerto
(`--port N` y `--port 0` OS-asignado), verifica el build standalone, copia
los statics si falta, hace spawn del hijo con el entorno correcto
(`HOSTNAME=127.0.0.1`, `PORT`, `HANDYMAN_ROOT`, `TOOLBOX_REPO_ROOT`,
`NEXT_TELEMETRY_DISABLED`), **espera a que el servidor acepte conexiones**
antes de anunciarlo, imprime el contrato `toolBox observer: <URL>` que el
oráculo parsea, y reenvía SIGINT/SIGTERM. `proxy.ts` quedó solo con el
Host guard (sin upstream). El oráculo de paridad
(`tests/test_toolbox_serve.sh`) ahora bootea por defecto contra el wrapper
Next, con sus 2 aserciones de carve-out (`GET /` y CSP) re-escritas para el
contenido de Next. `run_tests.sh` construye apps/web + handyman dist antes
de las suites. El plan de migración se cerró a `docs/sprints/`.

## Files changed

### Source (producto)

- **`handyman/src/toolbox.ts`** — `serveMain` reescrita: `findRepoRoot()`
  (walk-up con override `TOOLBOX_REPO_ROOT`), `parseServePort` (`--port N`
  / `--port 0`, default 8765), `ephemeralPort()` (libera el puerto efímero
  para el hijo), `waitForReady()` (probe HTTP a `/api/state`, retry cada
  100ms hasta ~10s) y `boot(port)` que spawn-a, adjunta signal handlers
  ANTES del probe, y solo imprime `toolBox observer:` cuando Next responde.
  El `case "serve"` del switch y el guard de ejecución directa actualizados.
- **`handyman/src/toolbox_serve.ts`** — **eliminado** (era el server
  `node:http` de 776 líneas). Verificado que ningún `import` queda vivo.
- **`apps/web/proxy.ts`** — podado: queda `hostAllowed()` (DNS-rebinding
  guard) y `return`; removidos `TOOLBOX_UPSTREAM`, `NEXT_HANDLED_*`,
  `NEXT_INTERNAL` y el `fetch()` forward (ya no hay upstream Node). Doc
  actualizado.
- **`apps/web/app/{fleet,harness/[name]}/{page,*Html}.tsx`**,
  `apps/web/app/layout.tsx`, `apps/web/app/globals.css`,
  `apps/web/package.json`, `apps/web/components/**`, `apps/web/lib/**`,
  `apps/web/app/{ask,intake,search,timeline}/**` — sin cambios de feature
  50 (son churn heredado de features 47/48/49 ya hechos pero no commiteados).
- **`handyman/src/{toolbox_ask,toolbox_assets,toolbox_draft,toolbox_llm,toolbox_state,toolbox_summary}.ts`**
  — solo comentarios/shims que referenciaban `toolbox_serve.ts`
  actualizados (los entrypoints `dist/` históricos se mantienen estables).

### Tests

- **`tests/test_toolbox_serve.sh`** — default boot repuntado de
  `node dist/toolbox_serve.js` a `node dist/toolbox.js serve` (nuevo
  `SERVE_SUBCMD="serve"`; `TOOLBOX_SERVE_CMD` override intacto). Dos
  aserciones re-escritas para contenido Next:
  - `GET / serves the unified Next.js landing (no UMD vendors, same-origin only)`
    — reemplaza el chequeo del placeholder de retiro por el contrato
    estructural de la landing (sin vendors UMD retirados react/htm/marked/
    dompurify/minisearch, sin `id="root"`, sin `<script src="https?://"`).
  - `server responses carry Content-Security-Policy default-src 'self'`
    — re-apuntada de headers de `GET /` (la landing SSR no lleva CSP) a
    headers de `/api/state` (Next sí la aplica vía `respond.ts` byte-parity).
  - Las aserciones de `/api/state` (snapshots, métricas), `/api/md`,
    `/events`, relays y `/api/intake` **no se tocaron** — pasan solas con
    el fix de readiness.
- **`tests/test_web_intake.sh`**, **`tests/test_web_readapi.sh`**,
  **`tests/test_web_relays.sh`** — `SERVE=.../toolbox_serve.ts` (borrado)
  re-apuntado al archivo actual donde vive el símbolo:
  `packages/toolbox-core/src/intake.ts` (writeIntake/intakeHttp),
  `handyman/src/toolbox_assets.ts` (assets), etc.
- **`tests/run_tests.sh`** — nuevo bloque de prerequisites al inicio:
  `cd handyman && npm run build`, `pnpm run web:build`, copia de statics a
  `apps/web/.next/standalone/apps/web/.next/static/`, aborta con mensaje
  claro si algo falla. `cd "$REPO_ROOT" || exit 1` (shellcheck SC2164).

### Docs / npm

- **`handyman/package.json`** — script `toolbox:serve` alineado con el
  wrapper unificado.
- **`.handyman/docs/architecture.md`** — bullet "Observador (toolBox)"
  actualizado: el proceso único Next standalone vía `toolbox serve`; ya no
  hay server Node heredado ni placeholder de retiro.
- **`.handyman/docs/verification.md`** — oraculo de paridad y "Required
  Commands" reflejan el nuevo default (`toolbox serve`) + la dependencia
  del build de apps/web.
- **`.handyman/docs/sprints/plan-migracion-toolbox-nextjs.md`** — movido
  (git rename) desde `docs/current/`; 10 referencias literales
  `current/plan-migracion-toolbox-nextjs` re-escritas a `sprints/...`
  (feature_list.json, progress/current.md, progress/history.md,
  docs/verification.md, index.md, 5 backlog/*). Cierre de la Fase 4.

## Design notes

### El contrato stdout del oráculo y la carrera spawn→URL

El oráculo extrae la URL con `sed -n 's/^toolBox observer: //p'` en cuanto
aparece en stdout y dispara las aserciones en el mismo instante. La
implementación ingenua imprime la línea inmediatamente después de
`spawn()`. Medicion directa del leader (antes del fix): la URL aparecía a
los ~200ms pero `/api/state` respondía 200 recién a los ~300ms — una
ventana de ~100ms donde el oráculo golpeaba un puerto que Next aún no
escuchaba, produciendo bodies vacíos / `000` y 3-4 fails aparentes de
contenido que en realidad eran de timing.

`waitForReady(port)` resuelve la carrera: un probe `http.get` a
`/api/state` cada 100ms (100 intentos, ~10s total); `ECONNREFUSED`/
`ECONNRESET` → reintentar; cualquier respuesta HTTP → listo. Los signal
handlers (SIGINT/SIGTERM) y el child-exit handler se adjuntan ANTES del
probe, así Ctrl+C durante el boot mata al hijo limpio. Solo después del
probe se imprime `toolBox observer:`. Medicion post-fix: URL y `/api/state`
200 aparecen simultáneamente a los ~250ms.

### ¿Por qué 2 aserciones del oráculo se reescribieron y 4 no?

Feature 49 (panel retirement) dejó un carve-out interino: el oráculo
asumía default = server Node, y `GET /` servía un placeholder CSP-safe
mientras el strangler corría dual. Feature 50 invierte ese default: el
proceso único ES Next. Por eso:

- `GET /` sirve ahora la **landing de marketing** (`apps/web/app/page.tsx`,
  feature `toolbox_next_landing`), no el placeholder. La aserción se
  reescribió para el contrato estructural de la landing (mismo espíritu
  de seguridad: same-origin, sin vendors UMD retirados).
- La aserción de CSP se re-apuntó de `GET /` (la landing SSR no lleva CSP
  header) a `/api/state`, que Next sí sirve con CSP vía la paridad
  byte-a-byte de `apps/web/lib/respond.ts` con el `sendJson` del server
  borrado.
- Las aserciones de `/api/state carries snapshots|per-harness metrics`,
  `/api/md`, `/events`, los relays y `/api/intake` **no cambiaron** — sus
  fallos previos eran puro timing (resueltos por `waitForReady`), no de
  contenido. Confirmado: pasan sin editar aserción.

### El wrapper como único entrypoint

`node dist/toolbox.js serve` es ahora la única manera de levantar el
observador. No hay flag para arrancar el server Node (no existe). El
wrapper: (a) localiza el repo root (`TOOLBOX_REPO_ROOT` override o walk-up
buscando `handyman/dist/toolbox_state.js`); (b) verifica que exista
`apps/web/.next/standalone/apps/web/server.js` (error claro apuntando al
build si falta); (c) warning si los statics no están copiados; (d) resuelve
puerto; (e) spawn con entorno; (f) espera readiness; (g) anuncia URL; (h)
reenvía signals; (i) sale con el código del hijo.

## Verification

### typecheck + builds

```
> handyman@2.1.1 typecheck
> tsc --noEmit
typecheck_exit=0

> handyman@2.1.1 build
> tsc -b
build_exit=0

ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
web_build_exit=0
```

### Readiness smoke (la carrera cerrada)

```
HANDYMAN_ROOT="$(mktemp -d)" node handyman/dist/toolbox.js serve --port 0 &
# probe cada 50ms:
URL appeared at ~250ms, /api/state 200 at ~250ms
--- first probe right after URL is visible should be 200 (not 000):
POST-URL /api/state=200
# SIGINT → exit 130 limpio
```

### Oraculo de paridad (default mode = wrapper Next)

```
=== test_toolbox_serve.sh (summary) ===
  PASS serve boots on an ephemeral port and prints the URL
  PASS GET / serves the unified Next.js landing (no UMD vendors, same-origin only)
  PASS /api/state carries snapshots, signals, features, fleet and timeline
  PASS /api/state carries per-harness metrics (throughput, verdicts, coverage)
  PASS /api/md serves whitelisted files and refuses everything else
  ... (24 más) ...
Summary: 27 run, 27 passed, 0 failed
```

### Suite completa

```
=== run_tests.sh ===
... (25 suites) ...
Summary: 19 run, 19 passed, 0 failed   # test_web_intake_ask.sh (última)
-> suite OK
==============================================
ALL SUITES PASSED
```

### Shellcheck

```
$ find handyman/scripts tests -name '*.sh' -print0 | xargs -0 shellcheck -S warning
EXIT=0   # (0 warnings; SC2164 de run_tests.sh corregido con `cd ... || exit 1`)
```

### Verifier del harness

```
$ ./init.sh
INIT_EXIT=0
==> preflight: stability report complete (read-only; exit 0)
status: ok
```

## Acceptance check

1. ✅ `node dist/toolbox.js serve` levanta UN solo proceso Next standalone en
   127.0.0.1 con `--port N`/`--port 0`, imprime `toolBox observer: <URL>`,
   Ctrl+C lo detiene limpio.
2. ✅ `toolbox_serve.ts` eliminado; `proxy.ts` conserva solo el Host guard;
   shims podados/comentados.
3. ✅ Oraculo completo verde via el wrapper default (sin `TOOLBOX_BASE_URL`);
   conteo re-apuntado; `run_tests.sh` integra el build de apps/web.
4. ✅ `docs/architecture.md` + `docs/verification.md` reflejan el proceso
   único; `plan-migracion-toolbox-nextjs.md` cerrado a `docs/sprints/`;
   script npm `toolbox:serve` alineado.
5. ✅ `bash tests/run_tests.sh` → ALL SUITES PASSED; `./init.sh` → exit 0.
