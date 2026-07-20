import { LlmError } from "./llm.js";
/** How much of each backlog doc goes into the prompt. Enough for a title and
 *  the opening context; the classifier does not need the whole report. */
export declare const TRIAGE_EXCERPT_CHARS = 800;
export type BacklogKind = "impl" | "review" | "explore" | "other";
export interface BacklogDoc {
    /** File name inside backlog/, e.g. "impl_toolbox_next_fleet_view.md". */
    id: string;
    kind: BacklogKind;
    /** The feature name the file refers to, i.e. the id minus prefix/suffix. */
    feature: string;
    excerpt: string;
}
export interface EvidenceDebtEntry {
    id: number | null;
    name: string;
    /** The artifact the harness expects but cannot find. */
    missing: string;
}
export interface TriageReportEntry {
    id: string;
    categoria: string;
    duplicado_de?: string;
    confianza: number;
}
export interface TriageResult {
    report: TriageReportEntry[];
    evidence_debt: EvidenceDebtEntry[];
    model: string;
}
/** Every backlog/*.md of a harness workspace, with a bounded excerpt. */
export declare function listBacklogDocs(workspace: string): BacklogDoc[];
/**
 * Features marked `done` whose backlog has no review_<name>.md. Pure disk +
 * feature_list.json; the model never sees this computation, only its result.
 */
export declare function computeEvidenceDebt(workspace: string): EvidenceDebtEntry[];
export declare function composeTriageSystem(): string;
export declare function composeTriagePrompt(docs: BacklogDoc[]): string;
/**
 * Tolerant JSON extraction: models wrap objects in prose or fences even when
 * told not to. Anything unparseable yields an empty report rather than
 * throwing - evidence_debt is still worth returning on its own.
 */
export declare function parseTriageReport(raw: string): TriageReportEntry[];
export type TriageDraftFn = (req: {
    prompt: string;
    system?: string;
}, onDelta: (text: string) => void) => Promise<{
    text: string;
    model: string;
    stopReason: string | null;
}>;
export interface RelayTriageOptions {
    system: string;
    prompt: string;
    draft: TriageDraftFn;
    /** Computed server-side; passed through to the result untouched. */
    evidenceDebt: EvidenceDebtEntry[];
    onDelta: (text: string) => void;
    onResult: (event: TriageResult) => void;
    onError: (error: LlmError) => void;
}
/**
 * Same shape as relaySummary: run the injected draft(), emit callbacks the
 * route turns into SSE frames, never throw on provider failure. HTTP-agnostic
 * so unit tests inject a deterministic fake draft().
 */
export declare function relayTriage(options: RelayTriageOptions): Promise<void>;
