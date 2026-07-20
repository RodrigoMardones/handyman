/**
 * Pure markdown sanitization seam for the unified observer (feature 48).
 *
 * This module is the single source of the FORBID_TAGS / FORBID_ATTR policy
 * for the unified app. It is the byte-exact port of the legacy panel's
 * `renderMd` + `linkCitations` (handyman/assets/toolbox_panel.js), so the
 * new client components (IntakeClient, AskClient, FleetSummaryClient)
 * inherit the same policy the legacy panel shipped - and when the panel is
 * retired in feature 49, this module is the only place the policy lives.
 *
 * PURITY (load-bearing): the module itself MUST stay import-clean of
 * `marked` / `dompurify`. Both libs are real platform deps (decision D2),
 * but taking them as injectable parameters turns `renderSanitized` into a
 * pure function the transpiled suite can exercise deterministically against
 * fakes (see tests/test_web_intake_ask.sh). The client components pass the
 * real libs (imported once at the top of each "use client" file); RSCs and
 * route handlers never call renderSanitized (security: LLM markdown is only
 * ever rendered on the client, after hydration).
 *
 * Security model: marked turns agent markdown into HTML; DOMPurify strips
 * anything executable before it ever reaches `dangerouslySetInnerHTML`. If
 * either lib is unavailable (graceful-degrade fallback), the text is HTML-
 * escaped and newlines become <br> - never raw markup. The renderers in
 * intakeHtml.ts / askHtml.ts / summaryHtml.ts build the OUTER HTML shell and
 * escape every dynamic value; this module only owns the inner markdown body.
 */

/**
 * Tags the policy forbids outright (removed with KEEP_CONTENT:false, so
 * their text is dropped too). Mirrors the legacy panel's `renderMd`. Any
 * element capable of executing script, loading remote resources or
 * presenting a form is forbidden.
 */
export const FORBID_TAGS = [
  "script",
  "style",
  "iframe",
  "frame",
  "form",
  "input",
  "textarea",
  "button",
  "select",
  "object",
  "embed",
  "link",
  "meta",
  "base",
] as const;

/**
 * Attributes the policy strips from any surviving tag. Inline event
 * handlers, presentation style, and form/remote-resource plumbing are all
 * forbidden. `srcset` is included so a `<img>` can never smuggle a fetch.
 */
export const FORBID_ATTR = [
  "onerror",
  "onclick",
  "onload",
  "onmouseover",
  "onmouseout",
  "onsubmit",
  "onfocus",
  "onblur",
  "onchange",
  "style",
  "formaction",
  "srcset",
] as const;

/**
 * DOMPurify options block reused verbatim by `renderSanitized`. Exported so
 * the transpiled suite can confirm the policy is wired through unchanged.
 */
export const DOMPURIFY_OPTIONS = Object.freeze({
  FORBID_TAGS: [...FORBID_TAGS],
  FORBID_ATTR: [...FORBID_ATTR],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?!(?:javascript|data|vbscript):)/i,
  KEEP_CONTENT: false,
});

/**
 * marked options reused by `renderSanitized`. `breaks:true` turns single
 * newlines into <br> (matches how the legacy panel rendered agent drafts
 * where authors press Enter once between paragraphs).
 */
export const MARKED_OPTIONS = Object.freeze({ breaks: true, gfm: true });

/** Citation matcher: `[fuente: <ref>]` (whitespace-tolerant, ref non-greedy). */
export const CITE_RE = /\[fuente:\s*([^\]]+?)\s*\]/g;

/**
 * Refs that GET /api/md can actually serve (the resolveMd allowlist of the
 * observer). `feature:<name>` exists only in the corpus and never resolves
 * to a file, so it is intentionally NOT viewable and linkCitations turns it
 * into a code chip instead.
 */
export const VIEWABLE_REF_RE =
  /^(current|history|checkpoints|index|backlog:[\w.-]+\.md|docs:[\w.-]+\.md)$/;

/** HTML-escape every dynamic value. Mirrors the panel contract. */
export function escapeHtml(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Rewrite `[fuente: <ref>]` citations inside LLM markdown so that viewable
 * refs become a markdown link whose href carries the ref (`#cite=<ref>`),
 * and non-viewable refs become highlighted inline code (the original match
 * preserved verbatim). DOMPurify keeps `<a href="#cite=...">` (same-origin
 * fragment) and the sanitize config is unchanged.
 *
 * The link text is `[\[fuente: <ref>\]]`: the leading backslash escapes the
 * bracket inside markdown so marked renders the brackets literally (and
 * DOMPurify keeps the resulting `<a>`), matching the legacy panel's exact
 * rendering. ONE delegated click handler on the answer container reads the
 * href and opens the source through the shared /api/md dialog.
 *
 * Pure (no DOM, no deps): the transpiled suite asserts deterministic
 * rewriting for viewable refs, non-viewable refs and missing input.
 */
export function linkCitations(markdown: unknown): string {
  return String(markdown ?? "").replace(CITE_RE, (match, ref: string) =>
    VIEWABLE_REF_RE.test(ref)
      ? `[\\[fuente: ${ref}\\]](#cite=${encodeURIComponent(ref)})`
      : `\`${match}\``,
  );
}

/**
 * Minimal shape of `marked.parse` we depend on. The real `marked` lib fits
 * this (marked v12's `parse` is overloaded and returns `string |
 * Promise<string>`; we NEVER pass `async:true`, so it always resolves to a
 * synchronous string at runtime - `renderSanitized` narrows accordingly).
 * The transpiled suite injects a deterministic fake whose `parse` returns a
 * plain string (assignable to `string | Promise<string>`).
 */
export interface MarkedLike {
  parse(
    text: string,
    options?: { breaks?: boolean; gfm?: boolean },
  ): string | Promise<string>;
}

/**
 * Minimal shape of `DOMPurify.sanitize` we depend on. The real `dompurify`
 * lib fits this (its options bag is structural - the fake in the suite only
 * needs to honor FORBID_TAGS / FORBID_ATTR for the assertions).
 */
export interface DOMPurifyLike {
  sanitize(html: string, options: Record<string, unknown>): string;
}

/**
 * Render LLM markdown into sanitized HTML.
 *
 *  - When `deps.marked` and `deps.DOMPurify` are both provided (the only
 *    path the client components use), the pipeline is exactly the legacy
 *    panel's: `marked.parse(text, MARKED_OPTIONS)` then
 *    `DOMPurify.sanitize(html, DOMPURIFY_OPTIONS)`.
 *  - When either dep is missing, graceful-degrade: HTML-escape the input and
 *    turn newlines into `<br>`. NEVER inject raw markup. This branch is the
 *    transpiled-suite's deterministic fallback case.
 *
 * Callers that want citation linking MUST call `linkCitations` themselves
 * BEFORE `renderSanitized` (citation rewriting is a render-layer concern:
 * intake drafts and summaries do not link, only ask answers do).
 *
 * Pure given the deps: same input + same deps => same output.
 */
export function renderSanitized(
  text: unknown,
  deps: { marked?: MarkedLike; DOMPurify?: DOMPurifyLike },
): string {
  const source = text === null || text === undefined ? "" : String(text);
  if (!source) {
    return "";
  }
  const markedLib = deps.marked;
  const dompurifyLib = deps.DOMPurify;
  if (!markedLib || !dompurifyLib) {
    return escapeHtml(source).replace(/\r?\n/g, "<br>");
  }
  const parsed = markedLib.parse(source, MARKED_OPTIONS);
  // MARKED_OPTIONS never sets async:true, so marked always returns a string
  // synchronously; the guard keeps the type honest and degrades safely.
  const raw = typeof parsed === "string" ? parsed : String(parsed);
  return dompurifyLib.sanitize(raw, DOMPURIFY_OPTIONS);
}
