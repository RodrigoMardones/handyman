#!/usr/bin/env bash
# apps/web register-a-feature tests (feature panel_idea_to_feature).
#
# Two layers, no network and no server:
#   - FUNCTIONAL: addFeatureForRoot is driven directly against fixture
#     harnesses, covering the happy path and every rejection. This is the real
#     behaviour the route delegates to.
#   - STRUCTURAL: the route handler and the form exist with the exact bodies
#     and the contracts the panel depends on (never spawns, does not write into
#     HarnessLive's region), in the style of test_web_relays.sh.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
ROUTE="$WEB_DIR/app/api/feature/route.ts"
FORM="$WEB_DIR/components/AddFeatureForm.tsx"
PAGE="$WEB_DIR/app/harness/[name]/page.tsx"
ENTRY="$REPO_ROOT/handyman/src/toolbox_state.ts"
CORE="$REPO_ROOT/handyman/src/core/featureWrite.ts"
STATE_JS="$REPO_ROOT/handyman/dist/toolbox_state.js"

echo "apps/web register-a-feature suite (test_web_feature.sh)"

# A physical temp dir: on macOS mktemp -d yields /var/... (a symlink to
# /private/var), and the dist entry guard compares import.meta.url against
# argv[1] -- see tests/test_init.sh for the same hazard.
phys_tmp() { (cd "$(mktemp -d)" && pwd -P); }

# Source with comments stripped.
#
# Every negative assertion below ("must NOT mention X") has to read code, not
# prose: the first draft of this suite failed three cases against a correct
# implementation, purely because the files EXPLAIN what they avoid --
# `spawned_process: false` contains "spawn", and the form's docstring names
# both dangerouslySetInnerHTML and /api/state while doing neither.
code_only() {
  node -e '
const fs = require("node:fs");
const src = fs.readFileSync(process.argv[1], "utf8");
process.stdout.write(
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, ""),
);
' "$1"
}

# A registered fleet: an HANDYMAN_ROOT with a registry pointing at $2.
write_fleet() {
  hroot="$1"; project="$2"
  mkdir -p "$hroot"
  cat > "$hroot/registry.json" <<JSON
{ "harnesses": [ { "project_name": "demo", "project_root": "$project" } ] }
JSON
}

write_target_harness() {
  ws="$1/.handyman"
  mkdir -p "$ws/progress" "$ws/docs"
  : > "$ws/progress/current.md"
  : > "$ws/progress/history.md"
  for d in business architecture conventions verification; do : > "$ws/docs/$d.md"; done
  cat > "$ws/feature_list.json" <<'JSON'
{
  "project": "demo",
  "features": [
    { "id": 7, "name": "existing", "title": "t", "description": "d",
      "acceptance": ["a"], "status": "done" }
  ]
}
JSON
}

# Drive addFeatureForRoot out of the built entry and print `status[:id]`.
call_add() { # $1=hroot $2=root $3=name $4..=acceptance lines
  hroot="$1"; root="$2"; fname="$3"; shift 3
  node --input-type=module -e '
const [entry, hroot, root, name, ...acceptance] = process.argv.slice(1);
const mod = await import(entry);
const r = mod.addFeatureForRoot(hroot, root, name, acceptance);
process.stdout.write(r.status === "ok" ? `ok:${r.id}` : r.status);
' "$STATE_JS" "$hroot" "$root" "$fname" "$@" 2>/dev/null
}

# --- TWF1: happy path returns the assigned id and writes the feature --------
start_case "addFeatureForRoot: registers a feature and returns the assigned id"
T1="$(phys_tmp)"; H1="$T1/hroot"; P1="$T1/project"
mkdir -p "$P1"; write_fleet "$H1" "$P1"; write_target_harness "$P1"
GOT="$(call_add "$H1" "$P1" "panel_added" "does X and exits 0")"
STORED="$(node "$SUITE_DIR/lib/jsonget.js" read "$P1/.handyman/feature_list.json" \
  "(d.features.find(f=>f.name==='panel_added')||{}).status||''")"
# id 8 continues past the existing id 7.
if [ "$GOT" = "ok:8" ] && [ "$STORED" = "pending" ]; then
  pass
else
  fail "expected ok:8 with a pending feature on disk, got '$GOT' status='$STORED'"
fi
rm -rf "$T1"

# --- TWF2: an unregistered root is refused, and nothing is written ----------
# The registry is the whole security model for a browser-facing writer.
start_case "addFeatureForRoot: refuses an unregistered root without writing"
T2="$(phys_tmp)"; H2="$T2/hroot"; P2="$T2/project"; OTHER="$T2/other"
mkdir -p "$P2" "$OTHER"; write_fleet "$H2" "$P2"; write_target_harness "$OTHER"
BEFORE="$(md5 -q "$OTHER/.handyman/feature_list.json" 2>/dev/null \
  || md5sum "$OTHER/.handyman/feature_list.json" | cut -d' ' -f1)"
GOT="$(call_add "$H2" "$OTHER" "sneaky" "x")"
AFTER="$(md5 -q "$OTHER/.handyman/feature_list.json" 2>/dev/null \
  || md5sum "$OTHER/.handyman/feature_list.json" | cut -d' ' -f1)"
if [ "$GOT" = "root_not_registered" ] && [ "$BEFORE" = "$AFTER" ]; then
  pass
else
  fail "expected root_not_registered with the file intact, got '$GOT'"
fi
rm -rf "$T2"

# --- TWF3: a name that is not a safe slug is refused ------------------------
# The name becomes backlog/impl_<name>.md, so it has to stay a slug.
start_case "addFeatureForRoot: refuses a name outside ^[A-Za-z0-9_-]+$"
T3="$(phys_tmp)"; H3="$T3/hroot"; P3="$T3/project"
mkdir -p "$P3"; write_fleet "$H3" "$P3"; write_target_harness "$P3"
BAD_SLASH="$(call_add "$H3" "$P3" "../escape" "x")"
BAD_SPACE="$(call_add "$H3" "$P3" "two words" "x")"
COUNT="$(node "$SUITE_DIR/lib/jsonget.js" read "$P3/.handyman/feature_list.json" \
  "String(d.features.length)")"
if [ "$BAD_SLASH" = "invalid_name" ] && [ "$BAD_SPACE" = "invalid_name" ] && [ "$COUNT" = "1" ]; then
  pass
else
  fail "expected invalid_name twice with no feature added: '$BAD_SLASH' '$BAD_SPACE' count=$COUNT"
fi
rm -rf "$T3"

# --- TWF4: an empty acceptance list is refused ------------------------------
# Blank-only lines count as empty: registering a contract-less feature from a
# UI is manufacturing evidence debt on purpose.
start_case "addFeatureForRoot: refuses an empty acceptance list"
T4="$(phys_tmp)"; H4="$T4/hroot"; P4="$T4/project"
mkdir -p "$P4"; write_fleet "$H4" "$P4"; write_target_harness "$P4"
NONE="$(call_add "$H4" "$P4" "no_contract")"
BLANK="$(call_add "$H4" "$P4" "no_contract" "   ")"
COUNT="$(node "$SUITE_DIR/lib/jsonget.js" read "$P4/.handyman/feature_list.json" \
  "String(d.features.length)")"
if [ "$NONE" = "empty_acceptance" ] && [ "$BLANK" = "empty_acceptance" ] && [ "$COUNT" = "1" ]; then
  pass
else
  fail "expected empty_acceptance twice with no feature added: '$NONE' '$BLANK' count=$COUNT"
fi
rm -rf "$T4"

# --- TWF5: a duplicate name is refused --------------------------------------
start_case "addFeatureForRoot: refuses a duplicate feature name"
T5="$(phys_tmp)"; H5="$T5/hroot"; P5="$T5/project"
mkdir -p "$P5"; write_fleet "$H5" "$P5"; write_target_harness "$P5"
GOT="$(call_add "$H5" "$P5" "existing" "x")"
COUNT="$(node "$SUITE_DIR/lib/jsonget.js" read "$P5/.handyman/feature_list.json" \
  "String(d.features.length)")"
if [ "$GOT" = "duplicate_name" ] && [ "$COUNT" = "1" ]; then
  pass
else
  fail "expected duplicate_name with no second entry: '$GOT' count=$COUNT"
fi
rm -rf "$T5"

# --- TWF6: the route handler exists with the panel's contract ---------------
start_case "POST /api/feature exists (POST, force-dynamic) and never spawns"
if [ -f "$ROUTE" ] \
  && grep -q 'export async function POST' "$ROUTE" \
  && grep -q 'force-dynamic' "$ROUTE" \
  && grep -q 'spawned_process: false' "$ROUTE" \
  && ! code_only "$ROUTE" | grep -qE 'spawnSync|execFile|child_process'; then
  pass
else
  fail "route missing, malformed, or reaching for a subprocess: $ROUTE"
fi

# --- TWF7: every rejection has a named error body ---------------------------
start_case "the route maps each rejection to a distinct, named error body"
if grep -q '"root is required"' "$ROUTE" \
  && grep -q '"root not registered"' "$ROUTE" \
  && grep -q 'name must match' "$ROUTE" \
  && grep -q '"acceptance must not be empty"' "$ROUTE" \
  && grep -q '"feature already exists"' "$ROUTE"; then
  pass
else
  fail "a rejection body is missing from $ROUTE"
fi

# --- TWF8: the route reaches handyman through the RUNTIME loader ------------
# A static import of the handyman package makes the bundler rewrite
# import.meta.url, which is exactly how featureWrite.ts resolves the JSON
# schema (the feature-43 constraint recorded in next.config.ts).
start_case "the route loads the handyman entry at runtime, not by static import"
if grep -q 'getToolboxEntry' "$ROUTE" && ! grep -qE 'from "handyman' "$ROUTE"; then
  pass
else
  fail "route must reach handyman via lib/toolboxState's runtime loader"
fi

# --- TWF9: one write path -- the CLI delegates instead of duplicating -------
start_case "feature.js add delegates to core/featureWrite instead of duplicating"
FEATURE_TS="$REPO_ROOT/handyman/src/feature.ts"
if grep -q 'from "./core/featureWrite.js"' "$FEATURE_TS" \
  && grep -q 'addFeature(workspace' "$FEATURE_TS" \
  && grep -q 'export function addFeature' "$CORE" \
  && grep -q 'addFeature(workspace' "$ENTRY"; then
  pass
else
  fail "the CLI and the panel are not sharing one append"
fi

# --- TWF10: the policy guards live at the edge, not in the core write -------
# feature.js add has always accepted a feature with no acceptance yet; pushing
# those checks into the core write broke four black-box cases.
start_case "name/acceptance policy lives in addFeatureForRoot, not in addFeature"
if grep -q 'FEATURE_NAME_RE.test' "$ENTRY" \
  && grep -q 'empty_acceptance' "$ENTRY" \
  && ! grep -q 'empty_acceptance' "$CORE" \
  && ! grep -q 'FEATURE_NAME_RE.test' "$CORE"; then
  pass
else
  fail "the panel-only guards leaked into the shared core write"
fi

# --- TWF11: the legacy form remains isolated but is no longer mounted here --
# /harness/[name]/new is the single entry for new work. Keep the component
# available for other consumers while preventing the duplicate form from
# returning to the detail or writing into HarnessLive's derived region.
start_case "AddFeatureForm remains isolated but is absent from the harness detail"
if grep -q 'export function AddFeatureForm' "$FORM" \
  && ! grep -q 'AddFeatureForm' "$PAGE" \
  && ! code_only "$FORM" | grep -qE 'innerHTML|insertAdjacentHTML'; then
  pass
else
  fail "the legacy form must remain safe without mounting in /harness/[name]"
fi

# --- TWF12: the page still resolves runner root server-side from state ------
start_case "the page passes project_root from state to RunPanel, never a hand-typed root"
if grep -q 'project_name === name' "$PAGE" && grep -q 'project_root' "$PAGE" \
  && grep -q '<RunPanel' "$PAGE" && grep -q 'root={root}' "$PAGE"; then
  pass
else
  fail "the page must resolve the runner root from the state it already has"
fi

# --- TWF13: the form relies on /events for the refresh ----------------------
# The write lands in a watched workspace, so the runtime hub fires /events and
# HarnessLive refetches. A second refresh here would race the live layer.
start_case "the form does not re-fetch state: /events drives the refresh"
if code_only "$FORM" | grep -q '/api/feature' \
  && ! code_only "$FORM" | grep -q '/api/state' \
  && ! code_only "$FORM" | grep -q 'location.reload'; then
  pass
else
  fail "the form must leave the refresh to the live layer"
fi

summary
