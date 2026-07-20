#!/usr/bin/env bash
# apps/web /intake + /ask + FleetSummary tests (feature
# toolbox_next_intake_ask_ui). Structural + render-contract, not a build:
# same pattern as test_web_timeline_search.sh / test_web_fleet.sh. The render
# checks transpile the pure modules (intakeHtml.ts, askHtml.ts,
# fleet/summaryHtml.ts, lib/md.ts) with the project's own typescript and run
# them in-process against fixtures. lib/md.ts takes marked + DOMPurify as
# injectable params (the security seam), so the suite injects deterministic
# fakes and asserts the policy end-to-end with zero network.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
INTAKE_PAGE="$WEB_DIR/app/intake/page.tsx"
INTAKE_PAGE_CSS="$WEB_DIR/app/intake/page.module.css"
INTAKE_HTML="$WEB_DIR/app/intake/intakeHtml.ts"
INTAKE_CLIENT="$WEB_DIR/components/IntakeClient.tsx"
INTAKE_CLIENT_CSS="$WEB_DIR/components/IntakeClient.module.css"
ASK_PAGE="$WEB_DIR/app/ask/page.tsx"
ASK_PAGE_CSS="$WEB_DIR/app/ask/page.module.css"
ASK_HTML="$WEB_DIR/app/ask/askHtml.ts"
ASK_CLIENT="$WEB_DIR/components/AskClient.tsx"
ASK_CLIENT_CSS="$WEB_DIR/components/AskClient.module.css"
SUMMARY_HTML="$WEB_DIR/app/fleet/summaryHtml.ts"
FLEET_SUMMARY_CLIENT="$WEB_DIR/components/FleetSummaryClient.tsx"
FLEET_SUMMARY_CLIENT_CSS="$WEB_DIR/components/FleetSummaryClient.module.css"
MD_LIB="$WEB_DIR/lib/md.ts"
INTAKE_ACTION="$WEB_DIR/actions/intake.ts"
WEB_PKG="$WEB_DIR/package.json"
ARCH_DOC="$REPO_ROOT/.handyman/docs/architecture.md"

# Transpile a single IMPORT-FREE pure module to CommonJS and run a JS snippet
# against its exports. Usage: run_transpiled SRC_FILE 'js code using the `mod`
# binding'. Mirrors test_web_timeline_search.sh's helper verbatim.
run_transpiled() {
  node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const code = fs.readFileSync(process.argv[2], "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "twia." + path.basename(process.argv[2]) + "." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
try {
  const mod = require(tmp);
  const snippet = new Function("mod", process.argv[3]);
  snippet(mod);
  process.exit(0);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}
' "$REPO_ROOT" "$1" "$2" 2>&1
}

# Transpile a pure module that has RELATIVE imports to other pure modules
# (the feature-48 renderers import escapeHtml from ../../lib/md) and run a JS
# snippet against the primary's exports. Each source is transpiled into a temp
# tree that MIRRORS the source layout under repo root, so a renderer's
# `require("../../lib/md")` resolves to the transpiled md.cjs in the same
# relative position. Usage:
#   run_transpiled_tree PRIMARY_SRC 'dep1.ts' 'dep2.ts' ... -- 'js snippet'
# All listed deps + the primary are transpiled into the mirrored tree; the
# snippet runs against the primary's exports as `mod`.
run_transpiled_tree() {
  node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const repoRoot = process.argv[1];
const args = process.argv.slice(2);
const sepIdx = args.indexOf("--");
const sources = args.slice(0, sepIdx);
const snippet = args.slice(sepIdx + 1).join(" ");
const primary = sources[0];
const tree = path.join(os.tmpdir(), "twia-tree." + process.pid);
fs.rmSync(tree, { recursive: true, force: true });
fs.mkdirSync(tree, { recursive: true });
try {
  for (const src of sources) {
    const abs = path.resolve(repoRoot, src);
    const code = fs.readFileSync(abs, "utf8");
    const out = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    // .js (not .cjs): the renderer relative `require("../../lib/md")` uses
    // Node classic CJS resolution which only tries .js/.json/.node for an
    // extensionless spec; the temp tree has no package.json so .js is CJS.
    const rel = path.relative(repoRoot, abs).replace(/\.ts$/, ".js");
    const dest = path.join(tree, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out);
  }
  const primaryRel = path.relative(repoRoot, path.resolve(repoRoot, primary)).replace(/\.ts$/, ".js");
  const mod = require(path.join(tree, primaryRel));
  const fn = new Function("mod", snippet);
  fn(mod);
  process.exit(0);
} finally {
  try { fs.rmSync(tree, { recursive: true, force: true }); } catch {}
}
' "$REPO_ROOT" "$@" 2>&1
}

echo "apps/web /intake + /ask + FleetSummary suite (test_web_intake_ask.sh)"

# --- TIA1: the view files exist ---------------------------------------------
start_case "intake view files exist (page, css, pure renderer, client, client css, md lib)"
if [ -f "$INTAKE_PAGE" ] && [ -f "$INTAKE_PAGE_CSS" ] && [ -f "$INTAKE_HTML" ] \
  && [ -f "$INTAKE_CLIENT" ] && [ -f "$INTAKE_CLIENT_CSS" ] && [ -f "$MD_LIB" ]; then
  pass
else
  fail "an /intake file is missing"
fi

start_case "ask view files exist (page, css, pure renderer, client, client css)"
if [ -f "$ASK_PAGE" ] && [ -f "$ASK_PAGE_CSS" ] && [ -f "$ASK_HTML" ] \
  && [ -f "$ASK_CLIENT" ] && [ -f "$ASK_CLIENT_CSS" ]; then
  pass
else
  fail "an /ask file is missing"
fi

start_case "fleet summary files exist (pure renderer, client, client css)"
if [ -f "$SUMMARY_HTML" ] && [ -f "$FLEET_SUMMARY_CLIENT" ] && [ -f "$FLEET_SUMMARY_CLIENT_CSS" ]; then
  pass
else
  fail "a fleet summary file is missing"
fi

start_case "FleetSummaryClient is mounted on /fleet (import + render)"
FLEET_PAGE="$WEB_DIR/app/fleet/page.tsx"
if grep -q 'import { FleetSummaryClient }' "$FLEET_PAGE" \
  && grep -q '<FleetSummaryClient' "$FLEET_PAGE" \
  && grep -q 'providersUrl="/api/providers"' "$FLEET_PAGE" \
  && grep -q 'summarizeUrl="/api/summarize"' "$FLEET_PAGE"; then
  pass
else
  fail "FleetSummaryClient is not mounted on /fleet (acceptance bullet 2 second half)"
fi

start_case "submitIntake server action present and exported (feat 46, untouched)"
if grep -q '"use server"' "$INTAKE_ACTION" \
  && grep -q 'export async function submitIntake' "$INTAKE_ACTION"; then
  pass
else
  fail "actions/intake.ts submitIntake contract missing"
fi

# --- TIA2: lib/md.ts policy (FORBID consts, escapeHtml, linkCitations) -------
start_case "lib/md.ts exports the FORBID consts verbatim and freeze the options block"
OUT="$(run_transpiled "$MD_LIB" '
const checks = [
  ["FORBID_TAGS exact", JSON.stringify([...mod.FORBID_TAGS]) === JSON.stringify(
    ["script","style","iframe","frame","form","input","textarea","button","select","object","embed","link","meta","base"])],
  ["FORBID_ATTR exact", JSON.stringify([...mod.FORBID_ATTR]) === JSON.stringify(
    ["onerror","onclick","onload","onmouseover","onmouseout","onsubmit","onfocus","onblur","onchange","style","formaction","srcset"])],
  ["DOMPURIFY_OPTIONS frozen", Object.isFrozen(mod.DOMPURIFY_OPTIONS)],
  ["DOMPURIFY_OPTIONS carries FORBID",
    JSON.stringify([...mod.DOMPURIFY_OPTIONS.FORBID_TAGS]) === JSON.stringify([...mod.FORBID_TAGS]) &&
    JSON.stringify([...mod.DOMPURIFY_OPTIONS.FORBID_ATTR]) === JSON.stringify([...mod.FORBID_ATTR])],
  ["DOMPURIFY_OPTIONS keeps content false", mod.DOMPURIFY_OPTIONS.KEEP_CONTENT === false],
  ["DOMPURIFY_OPTIONS disallows data attrs", mod.DOMPURIFY_OPTIONS.ALLOW_DATA_ATTR === false],
  ["DOMPURIFY_OPTIONS blocks js/data/vbs URIs",
    mod.DOMPURIFY_OPTIONS.ALLOWED_URI_REGEXP.test("https://ok.example/x") === true &&
    mod.DOMPURIFY_OPTIONS.ALLOWED_URI_REGEXP.test("javascript:alert(1)") === false &&
    mod.DOMPURIFY_OPTIONS.ALLOWED_URI_REGEXP.test("data:text/html,x") === false],
  ["MARKED_OPTIONS breaks+gfm", mod.MARKED_OPTIONS.breaks === true && mod.MARKED_OPTIONS.gfm === true],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "md.ts FORBID/options assertions failed: $OUT"; fi

start_case "escapeHtml escapes the 5 HTML-significant characters"
OUT="$(run_transpiled "$MD_LIB" '
const out = mod.escapeHtml("<script>\"'\''&>");
const again = mod.escapeHtml("<script>\"'\''&>");
const checks = [
  ["amp first", out.indexOf("&amp;") === 0 || out.includes("&amp;")],
  ["lt", out.includes("&lt;")],
  ["gt", out.includes("&gt;")],
  ["quot", out.includes("&quot;")],
  ["apos", out.includes("&#39;")],
  ["no raw <script>", !out.includes("<script>")],
  ["no raw quote", !out.includes("\"")],
  ["deterministic", out === again],
  ["null -> empty", mod.escapeHtml(null) === ""],
  ["undefined -> empty", mod.escapeHtml(undefined) === ""],
  ["number coerced", mod.escapeHtml(42) === "42"],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "escapeHtml assertions failed: $OUT"; fi

start_case "linkCitations rewrites viewable refs to #cite links, non-viewable to code chips"
OUT="$(run_transpiled "$MD_LIB" '
const viewable = mod.linkCitations("see [fuente: current] and [fuente: history]");
const backlog = mod.linkCitations("[fuente: backlog:foo.md]");
const docs = mod.linkCitations("[fuente: docs:bar.md]");
const checkpoints = mod.linkCitations("[fuente: checkpoints]");
const index = mod.linkCitations("[fuente: index]");
const nonViewable = mod.linkCitations("see [fuente: feature:xyz]");
const mixed = mod.linkCitations("[fuente: current] then [fuente: feature:zzz]");
const again = mod.linkCitations("[fuente: current] then [fuente: feature:zzz]");
const none = mod.linkCitations("no cites here");
const checks = [
  ["current -> cite link", viewable.includes("](#cite=current)")],
  ["history -> cite link", viewable.includes("](#cite=history)")],
  ["backlog encodes colon", backlog.includes("](#cite=backlog%3Afoo.md)")],
  ["docs encodes colon", docs.includes("](#cite=docs%3Abar.md)")],
  ["checkpoints link", checkpoints.includes("](#cite=checkpoints)")],
  ["index link", index.includes("](#cite=index)")],
  ["viewable keeps fuente text", viewable.includes("fuente: current")],
  ["non-viewable is code chip", nonViewable.includes("`[fuente: feature:xyz]`")],
  ["non-viewable has NO cite link", !nonViewable.includes("#cite=")],
  ["mixed handles both", mixed.includes("](#cite=current)") && mixed.includes("`[fuente: feature:zzz]`")],
  ["no cites untouched", none === "no cites here"],
  ["deterministic", mixed === again],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "linkCitations assertions failed: $OUT"; fi

start_case "renderSanitized honors deps, graceful-degrades without them, deterministic"
OUT="$(run_transpiled "$MD_LIB" '
// Deterministic fakes: marked echoes raw HTML; DOMPurify drops <script>.
const fakeMarked = { parse: (text, options) => {
  // Confirm the policy options are forwarded byte-exact.
  if (!options || options.breaks !== true || options.gfm !== true) {
    throw new Error("marked did not receive MARKED_OPTIONS");
  }
  return text;
}};
const seen = { tags: null, attr: null };
const fakeDOMPurify = { sanitize: (html, options) => {
  seen.tags = [...options.FORBID_TAGS];
  seen.attr = [...options.FORBID_ATTR];
  return html.replace(/<script>/g, "").replace(/onerror=/g, "");
}};
const out = mod.renderSanitized("hi <script>x</script> onerror=boom", { marked: fakeMarked, DOMPurify: fakeDOMPurify });
const outAgain = mod.renderSanitized("hi <script>x</script> onerror=boom", { marked: fakeMarked, DOMPurify: fakeDOMPurify });
const noMarked = mod.renderSanitized("hi\n<b>", { DOMPurify: fakeDOMPurify });
const noDompurify = mod.renderSanitized("hi\n<b>", { marked: fakeMarked });
const bothMissing = mod.renderSanitized("hi\n<b>", {});
const bothUndefined = mod.renderSanitized("hi\n<b>", { marked: undefined, DOMPurify: undefined });
const emptySrc = mod.renderSanitized("", { marked: fakeMarked, DOMPurify: fakeDOMPurify });
const nullSrc = mod.renderSanitized(null, { marked: fakeMarked, DOMPurify: fakeDOMPurify });
const checks = [
  ["deps pipeline strips script", out === "hi x</script> =boom" || (out.includes("hi ") && !out.includes("<script>"))],
  ["FORBID_TAGS forwarded to DOMPurify", JSON.stringify(seen.tags) === JSON.stringify([...mod.FORBID_TAGS])],
  ["FORBID_ATTR forwarded to DOMPurify", JSON.stringify(seen.attr) === JSON.stringify([...mod.FORBID_ATTR])],
  ["missing marked -> escape+br", noMarked === "hi<br>&lt;b&gt;"],
  ["missing dompurify -> escape+br", noDompurify === "hi<br>&lt;b&gt;"],
  ["both missing -> escape+br", bothMissing === "hi<br>&lt;b&gt;"],
  ["both undefined -> escape+br", bothUndefined === "hi<br>&lt;b&gt;"],
  ["graceful never injects raw tag", !bothMissing.includes("<b>")],
  ["empty -> empty", emptySrc === ""],
  ["null -> empty", nullSrc === ""],
  ["deterministic", out === outAgain],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "renderSanitized assertions failed: $OUT"; fi

# --- TIA3: intakeHtml.ts render (states, escaping, determinism) --------------
start_case "renderIntakePreviewHtml renders states, escapes dynamic values, deterministic"
OUT="$(run_transpiled_tree "$INTAKE_HTML" "$MD_LIB" -- '
const empty = mod.renderIntakePreviewHtml("", "", "idle", null);
const streaming = mod.renderIntakePreviewHtml("", "", "streaming", null);
const body = mod.renderIntakePreviewHtml("# hi", "<p>hi</p>", "done", { archetype: "bug <i>", possible_duplicates: [{ name: "dup <script>" }] });
const again = mod.renderIntakePreviewHtml("# hi", "<p>hi</p>", "done", { archetype: "bug <i>", possible_duplicates: [{ name: "dup <script>" }] });
const noResult = mod.renderIntakePreviewHtml("text", "<p>x</p>", "done", null);
const ok = mod.renderIntakeSubmitHtml("submitted", "written /a/b <c>.md");
const err = mod.renderIntakeSubmitHtml("submit-error", "bad <script>");
const idle = mod.renderIntakeSubmitHtml("idle", "");
const checks = [
  ["empty hint", empty.includes("draft a feature request")],
  ["streaming hint", streaming.includes("streaming")],
  ["section aria", body.includes("aria-label=\"Draft preview\"")],
  ["md body slot", body.includes("md-body") && body.includes("<p>hi</p>")],
  ["archetype escaped", body.includes("archetype:") && body.includes("&lt;i&gt;") && !body.includes("<i>")],
  ["dupes escaped", body.includes("possible duplicates:") && body.includes("&lt;script&gt;") && !body.includes("<script>")],
  ["noResult renders body", noResult.includes("<p>x</p>")],
  ["no external src", !body.includes("src=\"http") && !streaming.includes("src=\"http")],
  ["no injected script", !body.includes("<script")],
  ["submit ok escaped", ok.includes("written /a/b") && ok.includes("&lt;c&gt;") && !ok.includes("<c>")],
  ["submit err escaped", err.includes("bad") && err.includes("&lt;script&gt;") && !err.includes("<script>")],
  ["submit idle empty", idle === ""],
  ["deterministic", body === again],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "intakeHtml render assertions failed: $OUT"; fi

# --- TIA4: askHtml.ts render (placeholder/loading/empty, escaping) -----------
start_case "renderAnswerHtml renders empty/streaming/done, escapes, deterministic"
OUT="$(run_transpiled_tree "$ASK_HTML" "$MD_LIB" -- '
const empty = mod.renderAnswerHtml("", "idle", "", []);
const streaming = mod.renderAnswerHtml("", "streaming", "", []);
const done = mod.renderAnswerHtml("<p>ans</p>", "done", "glm-4 <i>", [{ ref: "docs:a.md", kind: "docs" }]);
const again = mod.renderAnswerHtml("<p>ans</p>", "done", "glm-4 <i>", [{ ref: "docs:a.md", kind: "docs" }]);
const err = mod.renderAskErrorHtml("error", "fail <script>");
const idleErr = mod.renderAskErrorHtml("idle", "");
const checks = [
  ["idle empty -> empty string", empty === ""],
  ["streaming body rendered", streaming.includes("ask-answer__body")],
  ["section aria", done.includes("aria-label=\"Answer\"")],
  ["model chip rendered", done.includes("model:") && done.includes("glm-4")],
  ["model escaped", done.includes("&lt;i&gt;") && !done.includes("<i>")],
  ["grounded line", done.includes("grounded on:") && done.includes("docs:a.md") && done.includes("(docs)")],
  ["md body slot", done.includes("md-body")],
  ["no external src", !done.includes("src=\"http")],
  ["no injected script", !done.includes("<script")],
  ["error escaped", err.includes("ask failed:") && err.includes("&lt;script&gt;") && !err.includes("<script>")],
  ["idle error empty", idleErr === ""],
  ["deterministic", done === again],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "askHtml render assertions failed: $OUT"; fi

# --- TIA5: summaryHtml.ts render ((cached) + model, escaping) ---------------
start_case "renderSummaryHtml renders (cached)+model chips, escapes, deterministic"
OUT="$(run_transpiled_tree "$SUMMARY_HTML" "$MD_LIB" -- '
const empty = mod.renderSummaryHtml("", "idle", false, "");
const streaming = mod.renderSummaryHtml("", "streaming", false, "");
const done = mod.renderSummaryHtml("<p>s</p>", "done", true, "glm-4 <i>");
const again = mod.renderSummaryHtml("<p>s</p>", "done", true, "glm-4 <i>");
const notCached = mod.renderSummaryHtml("<p>s</p>", "done", false, "glm-4");
const err = mod.renderSummaryErrorHtml("error", "fail <i>");
const idleErr = mod.renderSummaryErrorHtml("idle", "");
const checks = [
  ["idle empty -> empty string", empty === ""],
  ["streaming hint", streaming.includes("summarizing")],
  ["section aria", done.includes("aria-label=\"Fleet summary\"")],
  ["cached chip", done.includes("(cached)")],
  ["model chip rendered", done.includes("model:") && done.includes("glm-4")],
  ["model escaped", done.includes("&lt;i&gt;") && !done.includes("<i>")],
  ["md body slot", done.includes("md-body")],
  ["notCached has no cached chip", !notCached.includes("(cached)")],
  ["no external src", !done.includes("src=\"http")],
  ["no injected script", !done.includes("<script")],
  ["error escaped", err.includes("summary failed:") && err.includes("&lt;i&gt;") && !err.includes("<i>")],
  ["idle error empty", idleErr === ""],
  ["deterministic", done === again],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "summaryHtml render assertions failed: $OUT"; fi

# --- TIA6: client component structural greps --------------------------------
start_case "IntakeClient wires submitIntake, /api/providers + /api/files + /api/draft, renderSanitized"
if grep -q 'from "../actions/intake"' "$INTAKE_CLIENT" \
  && grep -q 'submitIntake' "$INTAKE_CLIENT" \
  && grep -q '/api/providers' "$INTAKE_PAGE" \
  && grep -q 'providersUrl="/api/providers"' "$INTAKE_PAGE" \
  && grep -q 'filesUrl="/api/files"' "$INTAKE_PAGE" \
  && grep -q 'draftUrl="/api/draft"' "$INTAKE_PAGE" \
  && grep -q 'fetch(providersUrl' "$INTAKE_CLIENT" \
  && grep -q 'filesUrl' "$INTAKE_CLIENT" \
  && grep -q 'draftUrl' "$INTAKE_CLIENT" \
  && grep -q 'renderSanitized' "$INTAKE_CLIENT" \
  && grep -q 'from "../lib/md"' "$INTAKE_CLIENT"; then
  pass
else
  fail "IntakeClient wiring incomplete"
fi

start_case "AskClient POSTs /api/ask, calls linkCitations+renderSanitized, delegates #cite= to MdDialog via /api/md"
if grep -q 'from "../lib/md"' "$ASK_CLIENT" \
  && grep -q 'linkCitations' "$ASK_CLIENT" \
  && grep -q 'renderSanitized' "$ASK_CLIENT" \
  && grep -q 'askUrl' "$ASK_CLIENT" \
  && grep -q '#cite=' "$ASK_CLIENT" \
  && grep -q 'MdDialog' "$ASK_CLIENT" \
  && grep -q '/api/md' "$ASK_CLIENT" \
  && grep -q 'askUrl="/api/ask"' "$ASK_PAGE" \
  && grep -q 'mdUrl="/api/md"' "$ASK_PAGE"; then
  pass
else
  fail "AskClient citation-delegation wiring incomplete"
fi

start_case "FleetSummaryClient POSTs /api/summarize and surfaces (cached) + model from result"
if grep -q 'summarizeUrl' "$FLEET_SUMMARY_CLIENT" \
  && grep -q '/api/summarize' "$FLEET_SUMMARY_CLIENT" \
  && grep -q '(cached)' "$FLEET_SUMMARY_CLIENT" \
  && grep -q 'setCached' "$FLEET_SUMMARY_CLIENT" \
  && grep -q 'model:' "$FLEET_SUMMARY_CLIENT" \
  && grep -q 'renderSanitized' "$FLEET_SUMMARY_CLIENT"; then
  pass
else
  fail "FleetSummaryClient (cached)+model wiring incomplete"
fi

# --- TIA7: cross-view invariants -------------------------------------------
start_case "exactly ONE document.addEventListener('keydown') across components/app/lib"
LISTENER_COUNT="$(grep -rc 'document.addEventListener("keydown"' "$WEB_DIR/components" "$WEB_DIR/app" "$WEB_DIR/lib" 2>/dev/null | awk -F: '{ sum += $2 } END { print sum }')"
if [ "$LISTENER_COUNT" = "1" ]; then
  pass
else
  fail "keydown listeners != 1 (got ${LISTENER_COUNT:-0}) — new components must not add another"
fi

# Scoped to feature-48-owned surfaces: the pre-existing marketing landing
# page (app/page.tsx) legitimately uses picsum.photos placeholders and is
# out of scope for this feature; the invariant verifies the new /intake,
# /ask and FleetSummary surfaces are same-origin only.
start_case "no external origins on feature-48 surfaces (intake/ask/summary/md)"
LEAKS="$(grep -rEn 'src="https?://|unpkg|cdn' \
  "$WEB_DIR/app/intake" "$WEB_DIR/app/ask" "$WEB_DIR/app/fleet/summaryHtml.ts" \
  "$INTAKE_CLIENT" "$ASK_CLIENT" "$FLEET_SUMMARY_CLIENT" "$MD_LIB" 2>/dev/null || true)"
if [ -z "$LEAKS" ]; then
  pass
else
  fail "external origin references found: $LEAKS"
fi

start_case "marked + dompurify are declared apps/web deps, justified in docs/architecture.md C3"
if grep -q '"marked"' "$WEB_PKG" && grep -q '"dompurify"' "$WEB_PKG" \
  && grep -q '"@types/dompurify"' "$WEB_PKG" \
  && grep -q 'feature 48' "$ARCH_DOC" \
  && grep -q 'marked' "$ARCH_DOC" && grep -q 'dompurify' "$ARCH_DOC"; then
  pass
else
  fail "marked/dompurify deps or C3 justification missing"
fi

# Feature 50 removed proxy.ts's route manifest along with the Node upstream it
# used to guard, so the honest assertion is the route files themselves.
start_case "/intake and /ask are native Next routes"
if [ -f "$WEB_DIR/app/intake/page.tsx" ] && [ -f "$WEB_DIR/app/ask/page.tsx" ]; then
  pass
else
  fail "app/intake/page.tsx or app/ask/page.tsx is missing: not served natively"
fi

summary
