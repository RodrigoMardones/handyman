/**
 * Acceptance from a diff or a spec (feature 33, item 2.4 of
 * docs/archive/analisis-tareas-llm-toolbox.md).
 *
 * Given the working diff of an in-progress feature, or a raw spec/issue, draft
 * the observable acceptance bullets. Read-only: it generates text the human
 * pastes into feature-request.md through the existing intake flow.
 *
 * Two deliberate choices:
 *
 * - **The spec arrives in the body, not as a path.** source='spec' takes the
 *   text itself (bounded by the relay's 256 KB cap). Accepting a filename
 *   would mean a second workspace-read allowlist next to /api/md's, for no
 *   gain - the client already has the document open.
 * - **Gate compliance is CHECKED, not trusted.** The system prompt demands the
 *   green gate as the last bullet; `lastBulletIsGreenGate` then verifies it
 *   deterministically and the result reports `gate_last`. The model is not
 *   censored or retried - the caller is told, which is the honest contract
 *   (§6: the LLM does not decide, it drafts).
 */
import { LlmError } from "./llm.js";

export type AcceptanceSource = "diff" | "spec";

export interface AcceptanceResult {
  acceptance_md: string;
  model: string;
  source: AcceptanceSource;
  /** True when the last bullet names the green gate, per the contract in
   *  docs/archive/analisis-feature-request-md.md. Reported, never enforced. */
  gate_last: boolean;
  /** Only meaningful for source='diff'. */
  diff_truncated: boolean;
}

/** Spec budget: the same order as the diff budget, still well under the relay
 *  body cap so a pasted design doc fits. */
export const ACCEPTANCE_SPEC_MAX_CHARS = 60_000;

export function composeAcceptanceSystem(): string {
  return [
    "Redactas los criterios de aceptacion de una feature para un harness Handyman.",
    "",
    "Salida: una lista markdown de balas, nada mas. Sin preambulo ni cierre.",
    "",
    "Reglas duras:",
    "- Cada bala debe ser OBSERVABLE y TESTEABLE: usa verbos verificables",
    "  (corre, sale con exit 0, grepea, devuelve, responde 400, escribe el archivo X).",
    "- PROHIBIDO lo vago: nada de 'deberia funcionar', 'esta bien integrado',",
    "  'es robusto', 'mejora la experiencia'. Si no se puede verificar desde",
    "  afuera, no es un criterio de aceptacion.",
    "- Cada bala nombra el artefacto concreto (ruta, comando, archivo, endpoint).",
    "- La ULTIMA bala debe ser siempre el gate verde, exactamente:",
    "  'bash tests/run_tests.sh passes y ./init.sh exits 0.'",
    "- Si el material no alcanza para justificar un criterio, no lo inventes:",
    "  di que falta evidencia para esa parte.",
  ].join("\n");
}

export function composeAcceptancePrompt(
  source: AcceptanceSource,
  content: string,
  truncated: boolean,
): string {
  const header =
    source === "diff"
      ? "---- diff de trabajo (git diff HEAD): deduce que cambio y que se puede observar"
      : "---- especificacion / issue crudo: deduce los criterios observables que la cumplen";
  const body =
    content.length > 0
      ? content
      : source === "diff"
        ? "(diff vacio o el root no es un repo git)"
        : "(especificacion vacia)";
  const parts = [header, body];
  if (truncated) {
    parts.push("");
    parts.push("[el material fue truncado por tamano: no afirmes nada sobre lo que no viste]");
  }
  return parts.join("\n");
}

/**
 * Does the last markdown bullet name the green gate? Tolerant about the exact
 * wording (models re-punctuate) but strict about naming a real gate command.
 */
export function lastBulletIsGreenGate(md: string): boolean {
  const bullets = md
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line));
  const last = bullets[bullets.length - 1];
  if (!last) {
    return false;
  }
  return last.includes("./init.sh") || last.includes("tests/run_tests.sh");
}

export type AcceptanceDraftFn = (
  req: { prompt: string; system?: string },
  onDelta: (text: string) => void,
) => Promise<{ text: string; model: string; stopReason: string | null }>;

export interface RelayAcceptanceOptions {
  system: string;
  prompt: string;
  draft: AcceptanceDraftFn;
  source: AcceptanceSource;
  truncated: boolean;
  onDelta: (text: string) => void;
  onResult: (event: AcceptanceResult) => void;
  onError: (error: LlmError) => void;
}

/** Same shape as the other relays: HTTP-agnostic, never throws. */
export async function relayAcceptance(options: RelayAcceptanceOptions): Promise<void> {
  const { system, prompt, draft, source, truncated, onDelta, onResult, onError } = options;
  try {
    const result = await draft({ prompt, system }, onDelta);
    onResult({
      acceptance_md: result.text,
      model: result.model,
      source,
      gate_last: lastBulletIsGreenGate(result.text),
      diff_truncated: truncated,
    });
  } catch (error) {
    if (error instanceof LlmError) {
      onError(error);
      return;
    }
    onError(new LlmError("provider_error", error instanceof Error ? error.message : String(error)));
  }
}
