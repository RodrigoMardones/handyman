/**
 * Retro / lessons from closed features (feature 35, item 2.6 of
 * docs/analisis-tareas-llm-toolbox.md).
 *
 * Mines progress/history.md plus the backlog docs of features that are already
 * `done`, and proposes recurring patterns and anti-patterns as SUGGESTIONS for
 * docs/conventions.md. It never writes that file: a human promotes what is
 * worth promoting. This is an automated digest of the harness's own memory.
 *
 * The anti-generalisation rule is the whole point. A "pattern" backed by one
 * feature is an anecdote, so the system prompt demands at least two source
 * features per pattern AND `parseRetroPatterns` enforces it deterministically -
 * a model that ignores the instruction does not get to smuggle anecdotes
 * through. Dropped patterns are counted, never silently swallowed.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { LlmError } from "./llm.js";
import { readFeatures, readText } from "./state.js";
/** Minimum source features before a claim counts as a pattern. */
export const RETRO_MIN_EVIDENCE = 2;
/** How much of each closed backlog doc goes into the prompt. */
export const RETRO_EXCERPT_CHARS = 1200;
/** Upper bound on patterns returned, matching the 3-5 the analysis asks for. */
export const RETRO_MAX_PATTERNS = 5;
/** progress/history.md plus the backlog of every `done` feature. */
export function readRetroCorpus(workspace) {
    const history = readText(join(workspace, "progress", "history.md")) ?? "";
    const closed = readFeatures(workspace)
        .filter((f) => f.status === "done" && f.name)
        .map((f) => f.name);
    const closedSet = new Set(closed);
    let names;
    try {
        names = readdirSync(join(workspace, "backlog")).filter((n) => n.endsWith(".md"));
    }
    catch {
        return { history, docs: [], closed };
    }
    names.sort();
    const docs = [];
    for (const name of names) {
        const feature = name.replace(/^(impl|review|explore)_/, "").replace(/\.md$/, "");
        if (!closedSet.has(feature)) {
            continue; // open work is not a lesson yet
        }
        docs.push({
            id: name,
            feature,
            excerpt: (readText(join(workspace, "backlog", name)) ?? "").slice(0, RETRO_EXCERPT_CHARS),
        });
    }
    return { history, docs, closed };
}
export function composeRetroSystem() {
    return [
        "Destilas lecciones de las features ya cerradas de un harness Handyman.",
        "",
        "Responde SOLO un objeto JSON, sin texto alrededor y sin bloque de codigo:",
        '{"patterns":[{"titulo":"<frase corta>","tipo":"patron|antipatron",' +
            '"features":["<nombre de feature>","<otro>"],"detalle":"<que se repitio y por que importa>"}]}',
        "",
        "Reglas duras:",
        `- Entre 3 y ${RETRO_MAX_PATTERNS} patrones. Ni uno mas.`,
        `- Cada patron necesita AL MENOS ${RETRO_MIN_EVIDENCE} features distintas como`,
        "  evidencia, citadas por nombre en 'features'. Un patron con una sola",
        "  feature es una anecdota: DESCARTALO en vez de generalizarlo.",
        "- Usa solo nombres de features que aparezcan en el material recibido.",
        "- Si el material no da para 3 patrones con esa evidencia, devuelve menos.",
        "  Es correcto decir que no hay suficiente historia todavia.",
        "- No propongas editar docs/conventions.md: son sugerencias, decide un humano.",
    ].join("\n");
}
export function composeRetroPrompt(corpus) {
    const docs = corpus.docs
        .map((d) => `--- ${d.id} (feature: ${d.feature})\n${d.excerpt}`)
        .join("\n\n");
    return [
        `Features cerradas (${corpus.closed.length}): ${corpus.closed.join(", ") || "(ninguna)"}`,
        "",
        "---- progress/history.md",
        corpus.history || "(sin historia registrada)",
        "",
        `---- backlog de features cerradas (${corpus.docs.length})`,
        docs || "(sin documentos de backlog cerrados)",
    ].join("\n");
}
/**
 * Tolerant JSON extraction plus the evidence bar. Returns the surviving
 * patterns and how many were dropped for lack of support.
 */
export function parseRetroPatterns(raw) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced?.[1] ?? raw;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) {
        return { patterns: [], discarded: 0 };
    }
    let data;
    try {
        data = JSON.parse(candidate.slice(start, end + 1));
    }
    catch {
        return { patterns: [], discarded: 0 };
    }
    const list = data?.patterns;
    if (!Array.isArray(list)) {
        return { patterns: [], discarded: 0 };
    }
    const patterns = [];
    let discarded = 0;
    for (const entry of list) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            discarded += 1;
            continue;
        }
        const e = entry;
        const titulo = typeof e.titulo === "string" ? e.titulo.trim() : "";
        const features = Array.isArray(e.features)
            ? [...new Set(e.features.filter((f) => typeof f === "string" && f.length > 0))]
            : [];
        // The anti-generalisation bar, enforced rather than merely requested.
        if (!titulo || features.length < RETRO_MIN_EVIDENCE) {
            discarded += 1;
            continue;
        }
        patterns.push({
            titulo,
            tipo: e.tipo === "antipatron" ? "antipatron" : "patron",
            features,
            detalle: typeof e.detalle === "string" ? e.detalle : "",
        });
    }
    if (patterns.length > RETRO_MAX_PATTERNS) {
        discarded += patterns.length - RETRO_MAX_PATTERNS;
        patterns.length = RETRO_MAX_PATTERNS;
    }
    return { patterns, discarded };
}
/** Same shape as the other relays: HTTP-agnostic, never throws. */
export async function relayRetro(options) {
    const { system, prompt, draft, onDelta, onResult, onError } = options;
    try {
        const result = await draft({ prompt, system }, onDelta);
        const { patterns, discarded } = parseRetroPatterns(result.text);
        onResult({ patterns, discarded, model: result.model });
    }
    catch (error) {
        if (error instanceof LlmError) {
            onError(error);
            return;
        }
        onError(new LlmError("provider_error", error instanceof Error ? error.message : String(error)));
    }
}
//# sourceMappingURL=retro.js.map