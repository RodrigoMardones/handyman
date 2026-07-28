---
type: Implementation Log
feature: flue_stable_server
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/flue_stable_server]
---

# Implementation Report: flue_stable_server

## Files Changed

- `agents/flue-handyman/src/db.ts` (nuevo) — `export default
  sqlite('./data/flue.db')` (descubierto por el build en src/db.ts y cableado
  al entry generado; contrato `PersistenceAdapter.connect()` verificado en
  `@flue/cli/dist/flue.js` y docs/guide/database.md del paquete).
- `agents/flue-handyman/src/flue/index.ts` — el barrel re-exporta `sqlite` de
  `@flue/runtime/node` (la regla anti-volatilidad tambien cubre db.ts).
- `agents/flue-handyman/src/agents/handyman-leader.ts` — **fix real**:
  REPO_ROOT deja de derivarse de `import.meta.url` (se rompe al bundlear:
  `dist/server.mjs` queda mas bajo que `src/agents/` y el server compilado
  crasheaba al boot buscando `handyman/assets/` fuera del repo). Ahora ancla
  en `process.cwd()` (ambos flujos documentados corren con cwd = dir del
  paquete) con override `HANDYMAN_REPO_ROOT`.
- `agents/flue-handyman/package.json` — scripts `build` (ya existia) +
  `start`: `PORT=3583 node dist/server.mjs` (el server compilado lee
  `process.env.PORT || 3000`; se fija 3583 para alinear con `flue dev`,
  el driver y los evals).
- `package.json` (raiz) — `agents:build` + `agents:start`.
- `agents/flue-handyman/.gitignore` — += `data/`.
- `agents/flue-handyman/README.md` — seccion "Servidor estable": runbook
  (build/start, puerto y override, durabilidad, recovery tras kill, abort por
  feature, regla de un proceso vivo por instancia, precauciones de data/).
- `tests/test_flue_agents.sh` — caso TFA12 (db.ts + sqlite file + data/
  ignorado + scripts en paquete y raiz).

## Design Notes

- Evidencia de boot real (smoke, no solo build): `pnpm build` -> dist/server.mjs;
  `pnpm start` -> `[flue] Server listening on http://localhost:3583`;
  `GET /` -> 404 (sin ruta raiz, esperado); `POST /agents/handyman-leader/x`
  -> 400 (ruta viva, rechaza body vacio); `data/flue.db` (+shm/wal) creada en
  el boot -> sqlite persistente cableado; `logs/` creada vacia (sin eventos
  sin trafico). dist/ y data/ quedan en disco pero gitignored.
- El crash de boot encontrado en el smoke es exactamente la clase de bug que
  el watcher de `flue dev` escondia (vite sirve desde src/); queda documentado
  en el comentario del agente.
- Un proceso vivo por instancia y paralelizacion por feature (no por replica):
  regla de Flue documentada en el runbook.

## Test Output

```text
tests/test_flue_agents.sh: 12/12 (TFA12 nuevo)
pnpm build: OK; pnpm start: boot verde en :3583 (smoke arriba)
./init.sh → exit 0 (verificado en feature.js done)
```
