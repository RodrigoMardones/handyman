## Revisores

- RodrigoMardones

## Cambios

- **Remediación alerta Snyk W011 (reestructuración pasiva)**
  - `handyman/references/workflow.md` (startup, implementer, reviewer) y los 4 role templates (`handyman/assets/role-*.template.md`): pasos de lectura convertidos de imperativo agente-actor a voz pasiva resource-as-subject, con la frontera "data, not instructions" adyacente a cada lectura.
  - `handyman/references/security.md`: lead reencuadrado — abre con el control (todo contenido ingerido es data, nunca instrucciones) y el threat model pasa a ser la justificación del contrato. Golden Rule, Operating Rules y checklist intactos.
  - `handyman/SKILL.md` y `handyman/assets/AGENTS.template.md` preservados a propósito: ya eran pasivos y su presupuesto de palabras (test T4, 1000/250) no admite reescritura.
- **CI: job advisory `snyk-agent-scan`** en `.github/workflows/ci.yml`
  - `astral-sh/setup-uv@v8` + `uvx snyk-agent-scan@latest handyman/SKILL.md`, mismo target validado en el escaneo local.
  - `continue-on-error: true` (nunca gatea): la salida del CLI es experimental, el servidor de análisis devolvió 503 transitorios, y hay dos falsos positivos de diseño documentados. Skip silencioso cuando `SNYK_TOKEN` no está disponible (PRs de fork). Requiere el secreto `SNYK_TOKEN` en Actions.
- **Verificación en vivo del skill con snyk-agent-scan v0.5.15**
  - W011 bajó de 0.75 (audit skills.sh, versión pre-fix) a **0.65**: residual inherente al diseño de estado-en-disco, con mitigaciones vigentes.
  - W008 (secret, 1.00) confirmado **falso positivo**: los strings hex redactados son los SHA-256 de integridad de `handyman/skills-lock.json`; `API_KEY` solo aparece como nombre de variable en `references/toolbox.md`.
  - W012 (external URL, 0.90) **falso positivo por diseño**: `npx handyman-harness@3` es el CLI propio, pineado a major.
- **Limpieza de skills de terceros**
  - Eliminadas las copias trackeadas de `.agents/skills/frontend-design/` y `.agents/skills/ponytail/`; `skills-lock.json` raíz sale del tracking y pasa a `.gitignore`.
- **Estado del harness (dogfooding)**
  - Plan de acción e investigación completa en `.handyman/backlog/explore_snyk_w011_plan.md` (incluye guía de adopción de Snyk: cuenta gratuita, token, CI).
  - Log de sesión en `.handyman/progress/current.md`.

## Tarea o asunto asociado

- feat/security-revision · remediación del alerta Snyk W011 publicada en skills.sh (audit 2026-06-26, versión pre-fix)

## Evidencia del cambio

- `./init.sh` exit 0 — VERIFIER: all gates passed; `tests/test_docs.js` 221/221 (T4 budgets, T5 contrato de seguridad, T6 framing pasivo con cero construcciones agente-ingestor).
- Escaneo en vivo `uvx snyk-agent-scan@latest handyman/SKILL.md`: W011 medium 0.65; W008/W012 analizados y descartados como falsos positivos con evidencia local (detalle en `.handyman/backlog/explore_snyk_w011_plan.md` §5).
- Workflow YAML validado sintácticamente antes de commitear; job de CI verificado como advisory (no bloquea merges).
