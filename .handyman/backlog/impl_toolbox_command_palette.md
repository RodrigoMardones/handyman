---
feature: toolbox_command_palette
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/backlog/impl]
---

# Impl: toolbox_command_palette (feature 23, Plan E)

## Cambios

### `handyman/assets/toolbox_panel.js`

- **`buildActions(state, openMd)`**: acciones derivadas del estado vivo — 3
  vistas (fleet/timeline/search), "go to project X" por harness, y por
  harness legible los 4 md rápidos (current/history/checkpoints/MOC) + 4
  docs de dominio. Harness con error solo expone su acción de navegación.
- **`rankActions(actions, query)`**: MiniSearch (el mismo UMD ya cargado
  para search) con `prefix + fuzzy 0.2`, reconstruido por pulsación (decenas
  de acciones, más barato que sincronizar un índice con el estado SSE);
  fallback substring si el vendor no cargó; query vacía → top 12.
- **`CommandPalette`**: `<dialog>` nativo controlado — `showModal()` atrapa
  el foco y `close()` devuelve el foco al elemento anterior gratis (contrato
  de la aceptación); input `#palette-input` + listbox con `aria-selected`;
  `scrollIntoView({block:"nearest"})` (instantáneo, sin smooth) mantiene la
  selección visible; click en fila ejecuta (ruta ratón).
- **`HelpDialog`** (`?`): tabla estática de atajos con `<kbd>`.
- **Listener ÚNICO** `document.addEventListener("keydown")` en `App` (los
  valores del render actual llegan por `uiRef`, sin re-suscripción):
  - `⌘K/Ctrl+K` alterna el palette desde cualquier sitio (campos incluidos).
  - Palette abierto: `↓/↑` mueven selección (y `j/k` solo si el foco NO está
    en el input — ahí son letras), `Enter` ejecuta, `Esc` cierra (nativo del
    dialog). Ninguna otra tecla global actúa mientras esté abierto.
  - Guard de campos: `input/textarea/select/contentEditable` → atajos
    globales inertes.
  - `/` → `#/search` + focus en `#global-search`; `?` → ayuda; `g` arma una
    secuencia de 900ms y `f/t/s` navega (`gArmedRef`).
- Botón `⌘K` en la nav (descubribilidad + ruta de click).

### `handyman/src/toolbox_serve.ts`

- CSS del palette/help/kbd sobre tokens `--hw-*` existentes (selección con
  `color-mix` del accent, mismo patrón que los badges).

### `tests/test_toolbox_serve.sh` (+2 casos, TS1d)

1. La página servida trae los marcadores del palette (dialog, input-guard,
   `metaKey`, ruta MiniSearch `rankActions`).
2. Exactamente **1** `addEventListener("keydown")` en el asset + guard
   `isContentEditable` + `showModal` + `global-search` + secuencia g +
   tabla de ayuda.

## Evidencia

- Suite toolbox: **23 run, 23 passed** (21 previos + 2 nuevos).
- `./init.sh`: **exit 0** en el tree completo.
- Simulación node con MiniSearch real: 13 acciones para 2 harnesses (1 con
  error), "time"→timeline, "docs business" rankea business primero,
  "handy" prefix encuentra el harness, garbage → 0 matches (fila "no
  matching action").

## Notas de diseño

- `j/k` dentro del input del palette escriben (son letras); la navegación
  primaria ahí son las flechas — cumple el "j/k **or** arrows" de la
  aceptación sin robar caracteres al usuario.
- El palette reutiliza el patrón dialog de `MdDialog` y no añade listeners
  por componente: todo el teclado vive en el listener único del contrato.
