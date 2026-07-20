/**
 * Backlog triage + evidence debt (feature 32, item 2.3 of
 * docs/analisis-tareas-llm-toolbox.md).
 *
 * Two halves with deliberately different trust levels:
 *
 * - **Evidence debt is COMPUTED, never inferred.** "Which features are done
 *   but have no backlog/review_<name>.md" is a filesystem fact. Asking a model
 *   would be both wasteful and unreliable, and §6 of the analysis is explicit
 *   that the LLM does not decide state. validate_harness does not check this
 *   today, which is the hole this feature closes.
 * - **Classification is SUGGESTED.** Grouping/dedup of backlog docs is fuzzy,
 *   so the model proposes {id, categoria, duplicado_de?, confianza} and a
 *   human merges with mv/git. Nothing here auto-merges or writes disk.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { LlmError } from "./llm.js";
import { readFeatures, readText } from "./state.js";

/** How much of each backlog doc goes into the prompt. Enough for a title and
 *  the opening context; the classifier does not need the whole report. */
export const TRIAGE_EXCERPT_CHARS = 800;

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

function classify(name: string): { kind: BacklogKind; feature: string } {
  for (const prefix of ["impl", "review", "explore"] as const) {
    if (name.startsWith(`${prefix}_`)) {
      return { kind: prefix, feature: name.slice(prefix.length + 1).replace(/\.md$/, "") };
    }
  }
  return { kind: "other", feature: name.replace(/\.md$/, "") };
}

/** Every backlog/*.md of a harness workspace, with a bounded excerpt. */
export function listBacklogDocs(workspace: string): BacklogDoc[] {
  let names: string[];
  try {
    names = readdirSync(join(workspace, "backlog")).filter((n) => n.endsWith(".md"));
  } catch {
    return []; // no backlog/ yet: nothing to triage
  }
  names.sort();
  return names.map((name) => {
    const body = readText(join(workspace, "backlog", name)) ?? "";
    return { id: name, ...classify(name), excerpt: body.slice(0, TRIAGE_EXCERPT_CHARS) };
  });
}

/**
 * Features marked `done` whose backlog has no review_<name>.md. Pure disk +
 * feature_list.json; the model never sees this computation, only its result.
 */
export function computeEvidenceDebt(workspace: string): EvidenceDebtEntry[] {
  const present = new Set(listBacklogDocs(workspace).filter((d) => d.kind === "review").map((d) => d.feature));
  return readFeatures(workspace)
    .filter((f) => f.status === "done" && f.name && !present.has(f.name))
    .map((f) => ({ id: f.id, name: f.name, missing: `review_${f.name}.md` }));
}

export function composeTriageSystem(): string {
  return [
    "Eres un clasificador de backlog de un harness Handyman.",
    "Clasificas documentos backlog/*.md y senalas posibles solapes.",
    "",
    "Responde SOLO un objeto JSON, sin texto alrededor y sin bloque de codigo:",
    '{"report":[{"id":"<nombre de archivo>","categoria":"impl|review|explore|other",' +
      '"duplicado_de":"<id de otro doc, opcional>","confianza":<0.0-1.0>}]}',
    "",
    "Reglas:",
    "- Un entry por documento recibido, usando su id exacto.",
    "- duplicado_de solo si el solape es real y sustantivo; si dudas, omitelo.",
    "- confianza es tu certeza en la clasificacion, no en el duplicado.",
    "- No propongas fusionar ni borrar nada: un humano decide con mv/git.",
    "- Si no hay evidencia suficiente para clasificar, usa categoria 'other' y confianza baja.",
  ].join("\n");
}

export function composeTriagePrompt(docs: BacklogDoc[]): string {
  const body = docs
    .map((d) => `--- ${d.id} (prefijo: ${d.kind})\n${d.excerpt}`)
    .join("\n\n");
  return `Documentos del backlog (${docs.length}):\n\n${body}`;
}

/**
 * Tolerant JSON extraction: models wrap objects in prose or fences even when
 * told not to. Anything unparseable yields an empty report rather than
 * throwing - evidence_debt is still worth returning on its own.
 */
export function parseTriageReport(raw: string): TriageReportEntry[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return [];
  }
  const report = (data as Record<string, unknown> | null)?.report;
  if (!Array.isArray(report)) {
    return [];
  }
  return report
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && !Array.isArray(e))
    .filter((e) => typeof e.id === "string" && e.id.length > 0)
    .map((e) => {
      const entry: TriageReportEntry = {
        id: String(e.id),
        categoria: typeof e.categoria === "string" ? e.categoria : "other",
        confianza: typeof e.confianza === "number" ? e.confianza : 0,
      };
      if (typeof e.duplicado_de === "string" && e.duplicado_de.length > 0) {
        entry.duplicado_de = e.duplicado_de;
      }
      return entry;
    });
}

export type TriageDraftFn = (
  req: { prompt: string; system?: string },
  onDelta: (text: string) => void,
) => Promise<{ text: string; model: string; stopReason: string | null }>;

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
export async function relayTriage(options: RelayTriageOptions): Promise<void> {
  const { system, prompt, draft, evidenceDebt, onDelta, onResult, onError } = options;
  try {
    const result = await draft({ prompt, system }, onDelta);
    onResult({
      report: parseTriageReport(result.text),
      evidence_debt: evidenceDebt,
      model: result.model,
    });
  } catch (error) {
    if (error instanceof LlmError) {
      onError(error);
      return;
    }
    onError(new LlmError("provider_error", error instanceof Error ? error.message : String(error)));
  }
}
