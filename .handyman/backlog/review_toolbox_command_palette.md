---
feature: toolbox_command_palette
status: approved
role: reviewer
updated: 2026-07-17
tags: [handyman/backlog/review]
---

# Review: toolbox_command_palette (feature 23, Plan E)

Contra [[impl_toolbox_command_palette]], `docs/conventions.md`,
`docs/architecture.md` y CHECKPOINTS.md.

## Aceptación, criterio por criterio

1. **⌘K/Ctrl+K abre `<dialog>` nativo con showModal(); Esc cierra y el foco
   vuelve** — CUMPLE. showModal/close nativos (el retorno de foco es
   comportamiento de spec del dialog, mismo patrón ya validado en MdDialog);
   el toggle funciona también con el foco dentro de un campo.
2. **El input filtra/rankea con MiniSearch; Enter ejecuta; j/k o flechas
   mueven la selección** — CUMPLE. Verificado con MiniSearch real en node
   (prefix/fuzzy, business rankea primero, 0 matches muestra fila vacía).
   Flechas siempre; j/k cuando el foco no está en el input (ahí son
   caracteres) — dentro de la latitud del "or" de la aceptación.
3. **Atajos globales inertes en campos y dentro del palette salvo sus teclas
   de navegación** — CUMPLE. Con el palette abierto la rama retorna antes de
   los atajos globales; el guard cubre input/textarea/select/contentEditable.
4. **Un único listener keydown a nivel de documento** — CUMPLE. El test
   TS1d cuenta exactamente 1 `addEventListener("keydown")` en el asset; los
   valores del render llegan por `uiRef` sin re-suscripción.
5. **Test de markup servido + init.sh exit 0** — CUMPLE. Suite 23/23;
   `./init.sh` exit 0 en el tree completo.

## Convenciones / arquitectura

- Sin dependencias nuevas (C3): el ranker es el MiniSearch ya servido desde
  node_modules; cmdk/kbar siguen descartados (ESM-only, sin bundler).
- CSS sobre tokens `--hw-*`; selección con `color-mix` como los badges.
- Sin conflicto con Plan D: el palette no toca las live regions ni añade
  superficies aria-live (el test TS1c de "exactamente 1 aria-live" sigue
  verde), y su scroll usa block:nearest instantáneo (guard reduced-motion
  intacto).

## Observaciones menores (no bloqueantes)

- Doble `g` desarma la secuencia (tercera `g` re-arma); comportamiento
  aceptable y raro de encontrar.
- El palette no anuncia cambios de selección a lectores de pantalla más allá
  de `aria-selected`; si algún día hace falta, la región polite de Plan D es
  el punto natural.

## Veredicto

**APPROVED** — listo para cierre con `feature.js done toolbox_command_palette`.
