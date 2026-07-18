---
feature: new_proposal_ux_ui_handyman_workstation_2
role: reviewer
status: approved
updated: 2026-07-02
tags: [handyman/backlog/review]
---

# Review: Feature 85 — Segunda propuesta UX/UI del workstation

## Checklist de aceptación

### 1. Formato y estructura del documento
- [x] Existe en `docs/analisis-ux-ui-workstation-2.md`
- [x] Espejo exacto del formato de la primera pasada (`docs/analisis-ux-ui-workstation.md`)
- [x] Título con emoji (🔩)
- [x] Blockquote con pregunta rectora
- [x] 9 secciones numeradas: objetivo, evidencia, gap, restricciones, literatura, decisiones, plan, trabajo futuro, riesgos
- [x] Todas las evidencias con referencias `file:line` 
- [x] Tabla "Literatura consultada" con skills nombradas
- [x] Tabla "Decisiones resueltas" con requisitos fijos
- [x] Plan de trabajo con letras **F–K** continuando la serie A–E
- [x] Sección "Trabajo futuro" con alcance excluido
- [x] Sección "Riesgos" con mitigaciones
- [x] Footer citando feature 85: *"Generado por la feature 85 (`new_proposal_ux_ui_handyman_workstation_2`)"*

### 2. Decisiones operativas: identidad Handyman + WCAG 2.2

#### 2.1 Paleta "taller digital" con hex y ratios WCAG
- [x] Paleta propuesta con valores concretos light y dark en tabla (§6.1)
- [x] 12 tokens nombrados: `--hw-bg`, `--hw-surface`, `--hw-fg`, `--hw-muted`, `--hw-border`, `--hw-border-strong`, `--hw-accent`, `--hw-ok`, `--hw-warn`, `--hw-danger`, `--hw-info`, `--hw-backdrop`
- [x] Valores hex válidos para todos (22 hex únicos encontrados)

**Spot-check de ratios WCAG AA (luminancia relativa):**
| Par | Light | Dark | Estado |
|-----|-------|------|--------|
| `fg` sobre `bg` | 15.71 ✓ | 14.60 ✓ | PASA |
| `danger` sobre tinte 15% | 4.80 ✓ | 5.61 ✓ | PASA (peor par) |
| `border-strong` vs `bg` | 4.20 ✓ | 4.25 ✓ | PASA (no-textual) |

Todos los ratios verificados con fórmula WCAG 2.x (sRGB linearizado + luminancia relativa) coinciden dentro de ±0.02.

#### 2.2 Tipografía y espaciado
- [x] System-ui declarado (§6.2), cero webfont
- [x] Escala de 5 pasos: `--hw-text-xs` (0.75 rem), `--hw-text-s` (0.875 rem), `--hw-text-m` (1 rem), `--hw-text-l` (1.25 rem), `--hw-text-xl` (1.5 rem)
- [x] Espaciado: `--hw-space-1/2/3/4/5` con el nuevo token `--hw-space-5: 3rem`
- [x] Radios: `--hw-radius-s: 3px` / `--hw-radius-m: 6px`

#### 2.3 Tema manual light/dark/system
- [x] Mechanism: `<select id="theme">` en nav con persistencia en `localStorage` (clave `hw-theme:1`)
- [x] Estrategia anti-flash: script inline antes del `<style>` en `<head>`
- [x] Selectores: `:root { --hw-* light }`, `:root[data-theme="dark"] { --hw-* dark }`, `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`
- [x] Página estática hereda selectores, sin toggle (fuera de alcance)

#### 2.4 Scope de accesibilidad WCAG 2.2
Plan H cubre:
- [x] Landmarks: `<main>` envolviendo secciones
- [x] Jerarquía: `<h1>` por vista, `<p class="wordmark">` para appbar
- [x] Diálogos: `aria-labelledby`/`aria-describedby` atados a elementos
- [x] Tablas: `<caption class="visually-hidden">` + `th scope="col"`
- [x] Movimiento: `prefers-reduced-motion` bloque declarado
- [x] Target size: botones `min-height ≥ 24px` (2.5.8)

#### 2.5 Performance adaptada a localhost
- [x] Shell divisible: `/assets/panel.css` y `/assets/panel.js` servidos por mismo handler
- [x] ETag sha-256 horneado en `make_handler`
- [x] Compresión gzip en `_send` (§6.5)
- [x] Polling inteligente: `/api/state` con ETag, 304 sin re-render
- [x] Presupuesto de payload: `GET /` ≤ 12 KiB, assets ≤ 64 KiB, margen ~2×
- [x] `no-store` conservado en `/` (token) y `/api/state` (estado)

### 3. No re-propone features 77–84
- [x] Documento cita explícitamente que features 77–84 ya entregaron:
  - Tokens `--hw-*` únicos en `fleet.py` (línea 18–20)
  - Capa `fmt.*` (línea 20)
  - Routing por `location.hash` con tres vistas (línea 20)
  - Nomenclatura por etapa del workflow (línea 20–21)
- [x] Esta pasada es **refinamiento sobre base sana**, no rediseño (línea 40–41)
- [x] Endpoints, ruta de escritura, arquitectura de vistas no se tocan (línea 41)

### 4. Restricciones duras preservadas

- [x] **Autocontenido**: §4 refina para panel vivo (assets por mismo handler = mismo origen)
- [x] **Render DOM-safe**: textContent/createElement, sin inyección de markup (gate W011)
- [x] **Forma de `/api/state` intacta**: 5 POST conservan cuerpos y códigos (§4)
- [x] **`no-store` donde protege**: `/api/state` y `GET /` (contiene token)
- [x] **Sin framework JS**: vanilla + fetch + setInterval, tema/caché vía plataforma nativa
- [x] **Etiquetas textuales, nunca color-solo**: ámbar es capa secundaria (§4)
- [x] **Tests deterministas**: grep/JSON/curl, sin browser automation (§4)
- [x] **`SKILL.md` no se toca**: presupuesto de tokens respetado (línea 11–12)

### 5. Factualidad de evidencia y líneas de código

**Spot-check de 3 claims contra código real:**

1. **Claim**: Fleet.py l.718–737 define 10 tokens light + 4 espaciados
   - ✓ Verificado: `:root` contiene `--hw-bg`, `--hw-surface`, `--hw-fg`, `--hw-muted`, `--hw-border`, `--hw-accent`, `--hw-ok`, `--hw-warn`, `--hw-danger`, `--hw-backdrop`, + `--hw-space-1/2/3/4`, `--hw-text-s/m/l`

2. **Claim**: Workstation.py l.257–326 contiene `_PANEL_STYLE` que consume tokens
   - ✓ Verificado: `_PANEL_STYLE` comienza en l.257, usa `var(--hw-*)` exclusivamente en todos los estilos

3. **Claim**: Cero ocurrencias de `<main>`, `scope=`, `<caption>`, `aria-labelledby`, `prefers-reduced-motion`
   - ✓ Verificado: grep retorna 0 en ambos archivos (workstation.py, fleet.py)

### 6. Plan de trabajo bien estructurado

**Planes F–K:**
- [x] F: Tokens v2 + tipografía + espaciado (fundación)
- [x] G: Tema manual light/dark/system (completa arquitectura theming)
- [x] H: WCAG 2.2 completo (solo marcado, sin dependencias de transporte)
- [x] I: Shell cacheable + gzip (capa de transporte)
- [x] J: Polling inteligente + presupuesto (reutiliza ETag de I)
- [x] K: Densidad híbrida + referencias (visual, aterriza sobre F–J estables)

**Cada plan especifica:**
- [x] Qué cambia (descripción clara)
- [x] Archivos tocados (3–4 archivos específicos por plan)
- [x] Tests deterministas (greps, curl, wc, aserciones de estructura)
- [x] Orden de ejecución justificado (F → G → H → I → J → K)

### 7. Verifier y git status

- [x] `./init.sh` ejecutado: **exit 0**, ALL SUITES PASSED
- [x] `git status --short`: **solo** `?? docs/analisis-ux-ui-workstation-2.md` (nuevo)
- [x] **Ningún archivo de producto modificado** (handyman/scripts/, tests/, SKILL.md intactos)

---

## Veredicto

**✅ APPROVED**

El documento es una investigación completa, bien estructurada y verificable:

1. **Formato**: espejo exacto de la primera pasada, todas las secciones presentes
2. **Decisiones operativas**: propuestas concretas (12 tokens con hex light/dark, ratios WCAG AA auditados, contraste spot-checked)
3. **No re-propone**: features 77–84 citadas como completadas; este es refinamiento puro
4. **Restricciones**: todas las duras preservadas explícitamente
5. **Evidencia**: file:line refs verificados, gaps confirmados (grep negativas), contraste ratios WCAG 2.x validados
6. **Plan de trabajo**: 6 features independientes (F–K), cada una con archivos, tests deterministas y orden justificado
7. **Verifier**: init.sh verde, git status limpio, solo documento nuevo

El documento está listo para entrega. Los planes F–K pueden pasar a `pending` en `feature_list.json` como features independientes 86–91, espejo de las series 61–65, 71–75 y 77–84.

---

*Revisión completada 2026-07-02 por reviewer (REVIEWER role).*
