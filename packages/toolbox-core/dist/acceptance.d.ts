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
export declare const ACCEPTANCE_SPEC_MAX_CHARS = 60000;
export declare function composeAcceptanceSystem(): string;
export declare function composeAcceptancePrompt(source: AcceptanceSource, content: string, truncated: boolean): string;
/**
 * Does the last markdown bullet name the green gate? Tolerant about the exact
 * wording (models re-punctuate) but strict about naming a real gate command.
 */
export declare function lastBulletIsGreenGate(md: string): boolean;
export type AcceptanceDraftFn = (req: {
    prompt: string;
    system?: string;
}, onDelta: (text: string) => void) => Promise<{
    text: string;
    model: string;
    stopReason: string | null;
}>;
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
export declare function relayAcceptance(options: RelayAcceptanceOptions): Promise<void>;
