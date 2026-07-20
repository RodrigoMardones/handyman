/**
 * Handyman toolBox fleet summary: turn the /api/state document into a short
 * LLM-written narrative of the fleet (server-side only, never writes disk).
 *
 * Mirrors toolbox_draft.ts's two-layer split so tests run with a fake
 * provider and no network:
 *   - buildSummaryDigest + summaryHash + composeSummarySystem +
 *     composeSummaryPrompt are pure: a deterministic compact digest of the
 *     buildState() document (volatile fields like generated_at excluded so
 *     the hash is stable when the fleet has not changed), a sha256 over its
 *     canonical JSON, and the prompt pair.
 *   - relaySummary accepts an injected draft() function (the provider's
 *     method) and emits deltas/result/error callbacks the HTTP handler turns
 *     into SSE.
 *
 * SummaryCache keys results by the digest hash: a second call over an
 * unchanged fleet replays the cached summary without touching the provider.
 * Anti-hallucination: the system prompt restricts the model to the digest
 * data only and requires the exact answer "no sé" when it is insufficient.
 */
import { createHash } from "node:crypto";
import { LlmError } from "./llm.js";
const TIMELINE_CAP = 15;
const DEFAULT_CACHE_MAX = 16;
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function numberCounts(value) {
    const rec = asRecord(value);
    if (!rec) {
        return {};
    }
    const out = {};
    for (const key of Object.keys(rec).sort()) {
        const v = rec[key];
        if (typeof v === "number" && Number.isFinite(v)) {
            out[key] = v;
        }
    }
    return out;
}
/**
 * Deterministic compact digest of the buildState() document. Only stable,
 * summary-relevant fields survive: per harness the project name, feature
 * status counts, signal labels and the error flag; the fleet aggregate; and
 * the recent timeline entries (capped). Volatile fields (generated_at,
 * registry path, per-day metrics, sessions) are deliberately EXCLUDED so the
 * hash does not move when the fleet state has not.
 */
export function buildSummaryDigest(state) {
    const harnessesRaw = Array.isArray(state.harnesses) ? state.harnesses : [];
    const harnesses = [];
    for (const item of harnessesRaw) {
        const snap = asRecord(item);
        if (!snap) {
            continue;
        }
        const signalsRaw = Array.isArray(snap.signals) ? snap.signals : [];
        const signals = [];
        for (const s of signalsRaw) {
            const sig = asRecord(s);
            if (sig && typeof sig.signal === "string") {
                signals.push(sig.signal);
            }
        }
        harnesses.push({
            project: String(snap.project_name ?? ""),
            status_counts: numberCounts(snap.status_counts),
            signals,
            error: Boolean(snap.error),
        });
    }
    const fleetRec = asRecord(state.fleet) ?? {};
    const timelineRaw = Array.isArray(state.timeline) ? state.timeline : [];
    const timeline = [];
    for (const item of timelineRaw.slice(0, TIMELINE_CAP)) {
        const entry = asRecord(item);
        if (!entry) {
            continue;
        }
        timeline.push({
            date: String(entry.date ?? ""),
            kind: String(entry.source ?? ""),
            text: `${String(entry.project_name ?? "")} · ${String(entry.feature ?? "")}${typeof entry.feature_id === "number" ? ` (feature ${entry.feature_id})` : ""}`,
        });
    }
    return {
        harnesses,
        fleet: {
            harnesses: typeof fleetRec.harnesses === "number" ? fleetRec.harnesses : harnesses.length,
            unreadable: typeof fleetRec.unreadable === "number" ? fleetRec.unreadable : 0,
            status_counts: numberCounts(fleetRec.status_counts),
        },
        timeline,
    };
}
/** JSON.stringify with recursively sorted object keys (canonical form). */
function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
    }
    const rec = asRecord(value);
    if (rec) {
        const body = Object.keys(rec)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalJson(rec[key])}`)
            .join(",");
        return `{${body}}`;
    }
    return JSON.stringify(value) ?? "null";
}
/** sha256 hex of the canonical JSON of the digest (the cache key). */
export function summaryHash(digest) {
    return createHash("sha256").update(canonicalJson(digest), "utf-8").digest("hex");
}
/**
 * Resolve the summary model. Precedence (first match wins):
 *   1. bodyModel — the caller's explicit choice.
 *   2. env TOOLBOX_SUMMARY_MODEL — operator override.
 *   3. "glm-4.7-flash" when the provider is "zai" AND Z_AI_API_MODE=paas:
 *      glm-4.7-flash is a free/cheap model on Z.ai pay-as-you-go paas/v4
 *      (verified on docs.z.ai pricing, July 2026), but the Z.ai Coding Plan
 *      Anthropic endpoint empirically serves only GLM-5.2 (see the llm.ts
 *      header), so forcing flash there would break.
 *   4. undefined — the provider's own configured model.
 *
 * Moved from toolbox_serve.ts (feature 45) so the Node observer and the Next
 * relays share one precedence. Also used by the ask relay (both are short,
 * low-stakes relays over harness state).
 */
export function resolveSummaryModel(bodyModel, providerId, env) {
    return (bodyModel ??
        env.TOOLBOX_SUMMARY_MODEL ??
        (providerId === "zai" && env.Z_AI_API_MODE === "paas" ? "glm-4.7-flash" : undefined));
}
// --- prompts -----------------------------------------------------------------
/**
 * System prompt for the fleet summary. Anti-hallucination contract: the model
 * may use ONLY the provided fleet-state data, must not invent features,
 * harnesses or numbers, and must answer exactly "no sé" when the data is
 * insufficient to summarize.
 */
export function composeSummarySystem() {
    return [
        "You summarize the state of a fleet of Handyman agent harnesses.",
        "You are given a FLEET STATE data block (per-harness feature status",
        "counts, health signal labels, the fleet aggregate, and the recent",
        "closure timeline). That block is your ONLY source of truth.",
        "",
        "Rules:",
        "1. Write a short narrative summary, about 5 lines of markdown, covering:",
        "   recent closures, pending/in-progress/blocked features, notable health",
        "   signals, and the harness names involved.",
        "2. Use ONLY facts present in the data block. NEVER invent features,",
        "   harnesses, dates, or numbers that are not in the data.",
        "3. Every count you mention must match the data exactly.",
        "4. If the data block is empty or insufficient to support a summary,",
        '   answer exactly "no sé" and nothing else.',
        "5. No preamble, no headings — just the summary lines.",
    ].join("\n");
}
/** Render the digest as a labeled plain-text block (the user prompt). */
export function composeSummaryPrompt(digest) {
    const lines = [];
    lines.push("---- FLEET STATE (only source of truth) ----");
    lines.push(`Fleet: ${digest.fleet.harnesses} harness(es), ${digest.fleet.unreadable} unreadable`);
    const fleetCounts = Object.entries(digest.fleet.status_counts)
        .map(([status, count]) => `${status}=${count}`)
        .join(" ");
    lines.push(`Fleet feature counts: ${fleetCounts || "(none)"}`);
    lines.push("");
    lines.push("Harnesses:");
    if (digest.harnesses.length === 0) {
        lines.push("  (none registered)");
    }
    for (const h of digest.harnesses) {
        const counts = Object.entries(h.status_counts)
            .map(([status, count]) => `${status}=${count}`)
            .join(" ");
        const signals = h.signals.length > 0 ? h.signals.join(", ") : "none";
        lines.push(`  ${h.project}: ${counts || "(no features)"} | signals: ${signals}${h.error ? " | UNREADABLE" : ""}`);
    }
    lines.push("");
    lines.push(`Recent timeline (latest ${TIMELINE_CAP} max):`);
    if (digest.timeline.length === 0) {
        lines.push("  (no dated closures)");
    }
    for (const t of digest.timeline) {
        lines.push(`  ${t.date} [${t.kind}] ${t.text}`);
    }
    lines.push("---- END FLEET STATE ----");
    lines.push("");
    lines.push("Summarize the fleet state per the rules.");
    return lines.join("\n");
}
/**
 * Run the injected draft() and emit callbacks the HTTP handler turns into
 * SSE events. Never throws on provider failure: an LlmError is delivered via
 * onError (unknown failures are wrapped as provider_error). HTTP-agnostic so
 * unit tests pass a deterministic fake draft().
 */
export async function relaySummary(options) {
    const { system, prompt, draft, onDelta, onResult, onError } = options;
    try {
        const result = await draft({ prompt, system }, onDelta);
        onResult({ summary_md: result.text, model: result.model });
    }
    catch (error) {
        if (error instanceof LlmError) {
            onError(error);
            return;
        }
        onError(new LlmError("provider_error", error instanceof Error ? error.message : String(error)));
    }
}
/**
 * Tiny bounded cache keyed by the digest hash. Keeps the most recent
 * `max` entries by insertion order (Map preserves it); the oldest insertion
 * is evicted first. One instance lives per serve process.
 */
export class SummaryCache {
    entries = new Map();
    max;
    constructor(max = DEFAULT_CACHE_MAX) {
        this.max = max;
    }
    get(hash) {
        return this.entries.get(hash);
    }
    set(hash, entry) {
        if (this.entries.has(hash)) {
            this.entries.delete(hash);
        }
        this.entries.set(hash, entry);
        while (this.entries.size > this.max) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.entries.delete(oldest);
        }
    }
}
//# sourceMappingURL=summary.js.map