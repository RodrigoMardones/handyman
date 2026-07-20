#!/usr/bin/env bash
# apps/web /harness/[name]/new tests (feature 71, new_feataure_view;
# formatFeatureName unit coverage added in feature 72, runner_observer).
#
# Three layers, mirroring test_web_feature.sh (structural) + test_web_run.sh
# (black-box boot for the register->run chain) + test_web_fleet.sh (pure
# module transpile + require):
#   - STRUCTURAL: the page exists, links from /harness/[name], is a plain
#     React sibling (no innerHTML), and ships no external assets.
#   - UNIT: lib/featureName.ts's formatFeatureName, transpiled with the
#     project's own typescript and required in-process (no Next boot).
#   - BLACK-BOX: two boots of the real server (handyman/dist/toolbox.js
#     serve) against a temp registered harness. Boot A (TOOLBOX_RUNNER=0)
#     proves the runner-off path: the page shows the opt-in hint and a
#     register never triggers /api/run. Boot B (TOOLBOX_RUNNER=1 +
#     TOOLBOX_RUNNER_CMD=fixture) proves refs land in feature_list.json's
#     description and that a register->run chain (the two POSTs the page
#     itself would issue) reaches the fixture agent.
# No test opens a real network socket beyond curl against 127.0.0.1: no
# outbound requests, no real agent process.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
PAGE="$WEB_DIR/app/harness/[name]/page.tsx"
NEW_PAGE="$WEB_DIR/app/harness/[name]/new/page.tsx"
FORM="$WEB_DIR/components/NewFeatureForm.tsx"
FEATURE_NAME_LIB="$WEB_DIR/lib/featureName.ts"
SUBMIT_LIB="$WEB_DIR/lib/submitNewFeature.ts"
FORM_CSS="$WEB_DIR/components/NewFeatureForm.module.css"
SERVE="$REPO_ROOT/handyman/dist/toolbox.js"

echo "apps/web new-request suite (test_web_new_feature.sh)"

# Source with comments stripped (same technique as test_web_feature.sh: a
# docstring naming what the code avoids would otherwise false-positive a
# negative grep).
code_only() {
  node -e '
const fs = require("node:fs");
const src = fs.readFileSync(process.argv[1], "utf8");
process.stdout.write(
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, ""),
);
' "$1"
}

# --- TWN1: the page exists and links from /harness/[name] -------------------
start_case "the /new page exists and /harness/[name] links to it"
if [ -f "$NEW_PAGE" ] \
  && grep -q 'export default async function' "$NEW_PAGE" \
  && grep -q "force-dynamic" "$NEW_PAGE" \
  && grep -qE '/harness/\$\{encodeURIComponent\(name\)\}/new' "$PAGE"; then
  pass
else
  fail "new page missing or not linked from $PAGE"
fi

# --- TWN2: the form is a React sibling, ships no external assets ------------
start_case "NewFeatureForm exists, never writes innerHTML, no external asset src"
if [ -f "$FORM" ] \
  && grep -q 'export function NewFeatureForm' "$FORM" \
  && ! code_only "$FORM" | grep -qE 'innerHTML|insertAdjacentHTML' \
  && ! code_only "$NEW_PAGE" | grep -qE 'src="https?://' \
  && ! code_only "$FORM" | grep -qE 'src="https?://'; then
  pass
else
  fail "form must be a plain sibling with no external assets"
fi

# --- TWN3: refs travel inside description as a Refs: section ----------------
start_case "the form composes description from selected refs (Refs: section)"
if code_only "$FORM" | grep -q 'Refs:' \
  && code_only "$FORM" | grep -q 'submitNewFeature' \
  && code_only "$SUBMIT_LIB" | grep -qE '["'"'"']/api/feature["'"'"']' \
  && code_only "$SUBMIT_LIB" | grep -qE '["'"'"']/api/run["'"'"']'; then
  pass
else
  fail "form must POST /api/feature with a Refs: description and chain /api/run"
fi

# --- TWN4: the runner toggle only offers itself when enabled ----------------
start_case "the run-agent toggle is gated by the runnerEnabled prop"
if grep -q 'runnerEnabled' "$FORM" && grep -q 'runnerEnabled' "$NEW_PAGE"; then
  pass
else
  fail "runner toggle must be driven by the server-resolved TOOLBOX_RUNNER flag"
fi

# --- TWN5: NewFeatureForm derives name from title via formatFeatureName -----
start_case "NewFeatureForm imports and uses formatFeatureName from lib/featureName"
if [ -f "$FEATURE_NAME_LIB" ] \
  && grep -q 'export function formatFeatureName' "$FEATURE_NAME_LIB" \
  && grep -q 'formatFeatureName' "$FORM"; then
  pass
else
  fail "expected lib/featureName.ts's formatFeatureName consumed by NewFeatureForm"
fi

start_case "reference search has a persistent accessible name and remove target is at least 24x24"
if grep -q 'aria-label="Search reference files"' "$FORM" \
  && grep -q 'min-width: 24px' "$FORM_CSS" \
  && grep -q 'min-height: 24px' "$FORM_CSS"; then
  pass
else
  fail "reference controls must keep an accessible name and a 24x24 remove target"
fi

start_case "a launch failure is rendered as an explicit error alert after registration"
if grep -q 'Feature registered, but agent was not launched:' "$FORM" \
  && grep -q 'runPhase === "error" ? styles.error : styles.ok' "$FORM" \
  && grep -q 'runPhase === "error" ? "alert" : "status"' "$FORM"; then
  pass
else
  fail "run failure must say registration succeeded and render as an error alert"
fi

# ============================================================================
# Unit: formatFeatureName, transpiled with the project's own typescript and
# required in-process (same technique as test_web_fleet.sh's renderFleetHtml
# check). No JSX in lib/featureName.ts, so this needs no Next boot.
# ============================================================================
start_case "formatFeatureName: lowercases, strips diacritics, maps non [A-Za-z0-9_-] to _, collapses/trims _"
UNIT_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const src = path.join(process.argv[1], "apps/web/lib/featureName.ts");
const code = fs.readFileSync(src, "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "featureName.test." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
try {
  const { formatFeatureName } = require(tmp);
  const cases = [
    ["Add Metrics Endpoint", "add_metrics_endpoint"],
    ["  Leading And Trailing  ", "leading_and_trailing"],
    ["Anadir Metricas de Runner", "anadir_metricas_de_runner"],
    ["___a___b___", "a_b"],
    ["Weird!!! Chars??", "weird_chars"],
    ["", ""],
  ];
  const namePattern = /^[A-Za-z0-9_-]*$/;
  let failures = [];
  for (const [input, expected] of cases) {
    const got = formatFeatureName(input);
    if (got !== expected) failures.push(`input=${JSON.stringify(input)} want=${JSON.stringify(expected)} got=${JSON.stringify(got)}`);
    if (!namePattern.test(got)) failures.push(`input=${JSON.stringify(input)} result ${JSON.stringify(got)} does not match ^[A-Za-z0-9_-]*$`);
  }
  // Diacritics case (Anadir -> without accents already covered above);
  // explicitly check accented input maps to the unaccented ascii form.
  const accented = formatFeatureName("Añadir Métricas");
  if (accented !== "anadir_metricas") failures.push(`accented input got ${JSON.stringify(accented)}, want "anadir_metricas"`);
  if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
  console.log("OK");
} catch (e) {
  console.log("EXCEPTION: " + (e && e.stack || e));
  process.exit(1);
}
' "$REPO_ROOT" 2>&1)"
if [ "$UNIT_OUT" = "OK" ]; then pass; else fail "$UNIT_OUT"; fi

start_case "client orchestration registers first and runs only after success with runner and toggle"
ORCHESTRATION_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const src = path.join(process.argv[1], "apps/web/lib/submitNewFeature.ts");
const code = fs.readFileSync(src, "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "submitNewFeature.test." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);

const response = (ok, payload, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => payload,
});

async function exercise(submitNewFeature, runnerEnabled, runAgent, responses) {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return responses.shift();
  };
  const result = await submitNewFeature({
    root: "/tmp/project",
    name: "client_case",
    title: null,
    acceptance: ["x"],
    description: null,
    runnerEnabled,
    runAgent,
  }, fetcher);
  return { calls, result };
}

(async () => {
  try {
    const { submitNewFeature } = require(tmp);
    const failures = [];
    const chained = await exercise(submitNewFeature, true, true, [
      response(true, { ok: true, id: 2 }),
      response(true, { ok: true }),
    ]);
    if (chained.calls.join(",") !== "/api/feature,/api/run") {
      failures.push(`success order=${chained.calls.join(",")}`);
    }

    const rejected = await exercise(submitNewFeature, true, true, [
      response(false, { ok: false, error: "duplicate" }, 409),
    ]);
    if (rejected.calls.join(",") !== "/api/feature" || rejected.result.feature.ok) {
      failures.push(`failed registration calls=${rejected.calls.join(",")}`);
    }

    const runnerOff = await exercise(submitNewFeature, false, true, [
      response(true, { ok: true, id: 3 }),
    ]);
    if (runnerOff.calls.join(",") !== "/api/feature") {
      failures.push(`runner off calls=${runnerOff.calls.join(",")}`);
    }

    const toggleOff = await exercise(submitNewFeature, true, false, [
      response(true, { ok: true, id: 4 }),
    ]);
    if (toggleOff.calls.join(",") !== "/api/feature") {
      failures.push(`toggle off calls=${toggleOff.calls.join(",")}`);
    }

    if (failures.length) {
      console.log(failures.join("\n"));
      process.exit(1);
    }
    console.log("OK");
  } catch (error) {
    console.log("EXCEPTION: " + (error && error.stack || error));
    process.exit(1);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
})();
' "$REPO_ROOT" 2>&1)"
if [ "$ORCHESTRATION_OUT" = "OK" ]; then pass; else fail "$ORCHESTRATION_OUT"; fi

# ============================================================================
# Black-box: boot the real server against a temp registered harness.
# ============================================================================
T="$(mktemp -d)"
FR="$T/toolboxroot"
H1="$T/proj1"
ws="$H1/.handyman"
mkdir -p "$ws/progress" "$ws/backlog" "$ws/docs"
printf '{"install_mode":"local","project_name":"proj1","project_root":".","harness_workspace":".handyman","harness_version":"1.0.0"}\n' \
  > "$H1/harness.config.json"
printf '{"project":"proj1","features":[
  {"id":1,"name":"alpha","title":"Alpha feature","status":"done"}
]}\n' > "$ws/feature_list.json"
printf -- '---\nfeature: none\nstatus: idle\nrole: leader\nupdated: 2026-07-20\ntags: [x]\n---\n# Current\n' \
  > "$ws/progress/current.md"
# A taggable file inside the target workspace, so GET /api/files?root= (the
# picker this view drives) has something real to return.
mkdir -p "$H1/src"
printf 'export const x = 1;\n' > "$H1/src/main.ts"
HANDYMAN_ROOT="$FR" node "$SERVE" register "$H1" --date 2026-07-20 >/dev/null 2>&1

FAKE="$T/fakerunner.sh"
cat > "$FAKE" <<'FAKEEOF'
#!/usr/bin/env bash
printf 'FAKE_RUNNER argv:%s\n' "$*"
printf 'FAKE_RUNNER done\n'
FAKEEOF
chmod +x "$FAKE"

SERVER_PID=""
SERVER_OUT="$T/server.out"

boot_server() {
  # $1: "off" (observer default) or "on" (runner opt-in + fixture cmd)
  : > "$SERVER_OUT"
  if [ "$1" = "on" ]; then
    HANDYMAN_ROOT="$FR" TOOLBOX_RUNNER=1 TOOLBOX_RUNNER_CMD="$FAKE" \
      node "$SERVE" serve --port 0 > "$SERVER_OUT" 2>&1 &
  else
    HANDYMAN_ROOT="$FR" TOOLBOX_RUNNER=0 \
      node "$SERVE" serve --port 0 > "$SERVER_OUT" 2>&1 &
  fi
  SERVER_PID=$!
  URL=""
  for _ in $(seq 1 50); do
    URL="$(sed -n 's/^toolBox observer: //p' "$SERVER_OUT" | tr -d '[:space:]')"
    [ -n "$URL" ] && break
    sleep 0.1
  done
}

kill_server() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1
    wait "$SERVER_PID" 2>/dev/null
    SERVER_PID=""
  fi
}

cleanup() {
  kill_server
  rm -rf "$T"
}
trap cleanup EXIT

json_field() { # parse dot-path $2 out of the JSON on stdin
  node -e '
let raw = "";
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  try {
    let v = JSON.parse(raw);
    for (const k of process.argv[1].split(".")) v = v?.[k];
    console.log(typeof v === "object" ? JSON.stringify(v) : String(v));
  } catch { console.log("PARSE_ERROR"); }
});
' "$1"
}

# --- boot A: runner off -------------------------------------------------------
boot_server off
start_case "boot A (TOOLBOX_RUNNER=0): server boots"
if [ -n "$URL" ]; then pass; else fail "no URL: $(cat "$SERVER_OUT")"; fi

start_case "the /new view renders the opt-in hint, not the run toggle"
PAGE_BODY="$(curl -s "${URL}harness/proj1/new")"
if printf '%s' "$PAGE_BODY" | grep -q 'TOOLBOX_RUNNER=1' \
  && ! printf '%s' "$PAGE_BODY" | grep -q 'Run agent on this feature'; then
  pass
else
  fail "runner-off view should show the opt-in hint only"
fi

start_case "registering with runner off never reaches /api/run (feature stays pending, no run started)"
BODY="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"name\":\"off_case\",\"title\":null,\"acceptance\":[\"x\"],\"description\":null}" \
  "${URL}api/feature")"
OK="$(printf '%s' "$BODY" | json_field ok)"
RUN_STATUS="$(curl -s "${URL}api/run")"
RUN_PHASE="$(printf '%s' "$RUN_STATUS" | json_field phase)"
if [ "$OK" = "true" ] && [ "$RUN_PHASE" = "idle" ]; then
  pass
else
  fail "register ok=$OK, run phase=$RUN_PHASE (want true/idle)"
fi

kill_server

# --- boot B: runner on with the fixture command ------------------------------
boot_server on
start_case "boot B (TOOLBOX_RUNNER=1 + fixture cmd): server boots"
if [ -n "$URL" ]; then pass; else fail "no URL: $(cat "$SERVER_OUT")"; fi

start_case "GET /api/files?root= returns the target workspace's taggable file"
FILES_BODY="$(curl -s "${URL}api/files?root=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$H1")")"
if printf '%s' "$FILES_BODY" | grep -q 'src/main.ts'; then
  pass
else
  fail "picker source missing src/main.ts: $FILES_BODY"
fi

start_case "no refs selected -> description has no Refs section"
BODY="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"name\":\"no_refs\",\"title\":null,\"acceptance\":[\"x\"],\"description\":null}" \
  "${URL}api/feature")"
OK="$(printf '%s' "$BODY" | json_field ok)"
DESC="$(node "$SUITE_DIR/lib/jsonget.js" read "$ws/feature_list.json" \
  "(d.features.find(f=>f.name==='no_refs')||{}).description||''")"
if [ "$OK" = "true" ] && [ "$DESC" = "" ]; then
  pass
else
  fail "expected empty description with no refs, got ok=$OK desc='$DESC'"
fi

start_case "refs selected -> description carries a Refs: section with the relative path"
BODY="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"name\":\"with_refs\",\"title\":null,\"acceptance\":[\"x\"],\"description\":\"Refs:\nsrc/main.ts\"}" \
  "${URL}api/feature")"
OK="$(printf '%s' "$BODY" | json_field ok)"
DESC="$(node "$SUITE_DIR/lib/jsonget.js" read "$ws/feature_list.json" \
  "(d.features.find(f=>f.name==='with_refs')||{}).description||''")"
case "$DESC" in
  *"Refs:"*"src/main.ts"*) DESC_OK=yes ;;
  *) DESC_OK=no ;;
esac
if [ "$OK" = "true" ] && [ "$DESC_OK" = "yes" ]; then
  pass
else
  fail "expected a Refs: section with src/main.ts, got ok=$OK desc='$DESC'"
fi

start_case "register->run chain: POST /api/feature then POST /api/run reaches the fixture agent"
BODY="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"name\":\"chained\",\"title\":null,\"acceptance\":[\"x\"],\"description\":null}" \
  "${URL}api/feature")"
REG_OK="$(printf '%s' "$BODY" | json_field ok)"
RUN_BODY="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"chained\"}" "${URL}api/run")"
RUN_OK="$(printf '%s' "$RUN_BODY" | json_field ok)"
SPAWNED="$(printf '%s' "$RUN_BODY" | json_field spawned_process)"
PHASE=""
for _ in $(seq 1 50); do
  STATUS_JSON="$(curl -s "${URL}api/run")"
  PHASE="$(printf '%s' "$STATUS_JSON" | json_field phase)"
  [ "$PHASE" = "exited" ] && break
  sleep 0.1
done
TAIL="$(printf '%s' "$STATUS_JSON" | json_field log_tail)"
case "$TAIL" in
  *chained*) PROMPT_OK=yes ;;
  *) PROMPT_OK=no ;;
esac
if [ "$REG_OK" = "true" ] && [ "$RUN_OK" = "true" ] && [ "$SPAWNED" = "true" ] \
  && [ "$PHASE" = "exited" ] && [ "$PROMPT_OK" = "yes" ]; then
  pass
else
  fail "reg_ok=$REG_OK run_ok=$RUN_OK spawned=$SPAWNED phase=$PHASE prompt_ok=$PROMPT_OK"
fi

start_case "the /new view offers the run-agent toggle when the runner is on"
PAGE_BODY="$(curl -s "${URL}harness/proj1/new")"
if printf '%s' "$PAGE_BODY" | grep -q 'Run agent on this feature'; then
  pass
else
  fail "runner-on view should offer the run-agent checkbox"
fi

summary
