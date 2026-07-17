#!/usr/bin/env bash
# Handyman verifier. Resolves the harness workspace, checks state, then runs
# the quality gates lint -> build -> test. Exits 0 only when everything passes.
set -u
EXIT_CODE=0

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_WORKSPACE="$PROJECT_ROOT"

# Portable JSON reader: prefers node, falls back to python3 (both belong to the
# post-migration toolchain), so the verifier is self-contained and needs no jq.
# Usage: _json FILE VERB [ARG]
#   str PATH          print the string at a dotted PATH (numeric parts index
#                     arrays); empty when the key is missing or null.
#   len [PATH]        print the array length at PATH (root when omitted); 0 when
#                     the target is not an array.
#   count_status VAL  count .features[] whose .status equals VAL.
#   valid             exit 0 when FILE is valid JSON, non-zero otherwise.
_json() {
  _jf=$1; _jv=$2; _ja=${3:-}
  if command -v node >/dev/null 2>&1; then
    node -e '
const fs = require("fs");
const a = process.argv.slice(-3);
const file = a[0], verb = a[1], arg = a[2];
let d;
try { d = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { process.exit(2); }
function get(obj, path) {
  if (!path) return obj;
  let cur = obj;
  for (const k of path.split(".")) { if (cur == null) return undefined; cur = cur[k]; }
  return cur;
}
if (verb === "valid") { process.exit(0); }
if (verb === "str") {
  const v = get(d, arg);
  process.stdout.write(v == null ? "" : String(v));
} else if (verb === "len") {
  const v = get(d, arg);
  process.stdout.write(String(Array.isArray(v) ? v.length : 0));
} else if (verb === "count_status") {
  const f = Array.isArray(d.features) ? d.features : [];
  process.stdout.write(String(f.filter(x => x && x.status === arg).length));
} else { process.exit(3); }
' "$_jf" "$_jv" "$_ja"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, sys
file, verb = sys.argv[1], sys.argv[2]
arg = sys.argv[3] if len(sys.argv) > 3 else ""
try:
    d = json.load(open(file))
except Exception:
    sys.exit(2)
def get(obj, path):
    if not path:
        return obj
    cur = obj
    for k in path.split("."):
        if isinstance(cur, list):
            try:
                cur = cur[int(k)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return None
    return cur
if verb == "valid":
    sys.exit(0)
if verb == "str":
    v = get(d, arg)
    sys.stdout.write("" if v is None else str(v))
elif verb == "len":
    v = get(d, arg)
    sys.stdout.write(str(len(v) if isinstance(v, list) else 0))
elif verb == "count_status":
    feats = d.get("features") if isinstance(d, dict) else None
    feats = feats if isinstance(feats, list) else []
    sys.stdout.write(str(sum(1 for x in feats if isinstance(x, dict) and x.get("status") == arg)))
else:
    sys.exit(3)
' "$_jf" "$_jv" "$_ja"
  else
    return 127
  fi
}

if [ -f "$PROJECT_ROOT/harness.config.json" ]; then
  HARNESS_WORKSPACE="$(_json "$PROJECT_ROOT/harness.config.json" str harness_workspace)"
elif [ -f "$PROJECT_ROOT/.handyman/feature_list.json" ]; then
  # Local install: mutable state lives under .handyman/
  HARNESS_WORKSPACE="$PROJECT_ROOT/.handyman"
fi

# Resolve a relative harness_workspace (e.g. ".handyman") against PROJECT_ROOT.
case "${HARNESS_WORKSPACE:-}" in
  /*) : ;;
  "") : ;;
  *) HARNESS_WORKSPACE="$PROJECT_ROOT/$HARNESS_WORKSPACE" ;;
esac

if [ -z "${HARNESS_WORKSPACE:-}" ]; then
  echo "HARNESS_WORKSPACE could not be resolved" >&2
  EXIT_CODE=1
fi

# --- Phase runner -----------------------------------------------------------
# run_phase NAME COMMAND...   Runs a named gate, records failure, and keeps
# going so the summary reports every problem instead of stopping at the first.
run_phase() {
  phase_name="$1"; shift
  echo "==> ${phase_name}"
  if "$@"; then
    echo "    ${phase_name}: OK"
  else
    echo "    ${phase_name}: FAILED" >&2
    EXIT_CODE=1
  fi
}

# --- Checks -----------------------------------------------------------------

# 1. Required runtime tools. The verifier parses JSON with node or python3 (see
#    _json), so at least one must be present. Add any binaries this project needs.
check_tools() {
  if command -v node >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
    return 0
  fi
  echo "    missing required tool: node or python3 (needed to parse JSON)" >&2
  return 1
}

# 2. Required harness files live in $HARNESS_WORKSPACE.
check_harness_files() {
  missing=0
  for rel in feature_list.json progress/current.md progress/history.md; do
    if [ ! -f "$HARNESS_WORKSPACE/$rel" ]; then
      echo "    missing harness file: $HARNESS_WORKSPACE/$rel" >&2
      missing=1
    fi
  done
  return $missing
}

# 3. At most one feature may be in_progress.
check_feature_state() {
  list="$HARNESS_WORKSPACE/feature_list.json"
  [ -f "$list" ] || { echo "    feature_list.json not found" >&2; return 1; }
  in_progress="$(_json "$list" count_status in_progress)"
  if [ "$in_progress" -gt 1 ]; then
    echo "    more than one feature is in_progress ($in_progress)" >&2
    return 1
  fi
  return 0
}

# 4. Lint. Replace with the project linter (e.g. ruff, eslint, golangci-lint).
#    Defaults to shellcheck over the verifier; when shellcheck is absent it
#    degrades to a non-blocking NOTE instead of failing the gate.
run_lint() {
  if command -v shellcheck >/dev/null 2>&1; then
    shellcheck "$PROJECT_ROOT/init.sh"
  else
    echo "NOTE: shellcheck not installed - lint skipped (non-blocking)." >&2
    return 0
  fi
}

# 5. Build. Replace with the project build (e.g. make build, npm run build).
run_build() {
  echo "    no build command configured" >&2
  return 1
}

# 6. Test. Replace with the project test command (e.g. pytest, npm test).
run_test() {
  echo "    no test command configured" >&2
  return 1
}

# --- Advisory checks (non-blocking) -----------------------------------------
# A harness with no version stamp predates harness versioning; flag it so the
# user can seal and update it. A sealed harness stays silent here - explicit
# drift detection is node dist/upgrade_harness.js --check. Never changes EXIT_CODE.
check_harness_version() {
  ver=""
  if [ -f "$PROJECT_ROOT/harness.config.json" ]; then
    ver="$(_json "$PROJECT_ROOT/harness.config.json" str harness_version)"
  fi
  if [ -z "$ver" ] && [ -f "$HARNESS_WORKSPACE/feature_list.json" ]; then
    ver="$(_json "$HARNESS_WORKSPACE/feature_list.json" str config.harness_version)"
  fi
  if [ -z "$ver" ]; then
    echo "NOTE: harness has no version stamp - created before harness versioning." >&2
    echo "      run node dist/upgrade_harness.js --check (or re-scaffold) to seal and update it." >&2
  fi
}

# graphify provides a persistent knowledge-graph context layer for agents.
# It is optional infrastructure: a missing or stale graph warns but never
# changes EXIT_CODE. See references/graphify.md.
check_graphify_context() {
  if ! command -v graphify >/dev/null 2>&1; then
    echo "NOTE: graphify not installed - agent context graph disabled." >&2
    echo "      install: uv tool install graphifyy  (or: pip install graphifyy)" >&2
    return 0
  fi
  graph="$PROJECT_ROOT/graphify-out/graph.json"
  if [ ! -f "$graph" ]; then
    echo "NOTE: no context graph yet - run /graphify to build graphify-out/graph.json" >&2
  elif [ -n "$(find "$PROJECT_ROOT" -type f \
        -not -path '*/graphify-out/*' -not -path '*/.git/*' \
        -not -path '*/.handyman/*' -not -path '*/node_modules/*' \
        -newer "$graph" -print 2>/dev/null | head -n 1)" ]; then
    echo "NOTE: context graph may be stale - rebuild with /graphify --update" >&2
    echo "      (or install the post-commit hook: graphify hook install)" >&2
  fi
}

# A docs/business.md that still matches the starter template means the mandatory
# bootstrap business interview was skipped. The business domain cannot be inferred
# from code, so flag it for the user to fill. Never changes EXIT_CODE.
check_business_context() {
  biz="$HARNESS_WORKSPACE/docs/business.md"
  [ -f "$biz" ] || return 0
  if grep -qE 'Describe the business, the problem it solves|Define domain terms so code' "$biz"; then
    echo "NOTE: docs/business.md still matches the starter template - the bootstrap business interview looks skipped." >&2
    echo "      interview the user and fill it with real domain context (see references/workflow.md Bootstrap Protocol)." >&2
  fi
}

# A harness that declares no skills or MCP servers under discovery in
# harness.config.json has not recorded what it relies on, so skill/MCP discovery
# stays implicit. Nudge the operator to declare them; never changes EXIT_CODE.
# See references/discovery.md.
check_tools_discovery() {
  config="$PROJECT_ROOT/harness.config.json"
  [ -f "$config" ] || return 0
  skills="$(_json "$config" len discovery.skills 2>/dev/null)"
  mcp="$(_json "$config" len discovery.mcp 2>/dev/null)"
  agents="$(_json "$config" len discovery.agents 2>/dev/null)"
  if [ "${skills:-0}" -eq 0 ] && [ "${mcp:-0}" -eq 0 ] && [ "${agents:-0}" -eq 0 ]; then
    echo "NOTE: harness.config.json declares no skills, MCP servers, or agents under discovery." >&2
    echo "      record what the harness relies on (see references/discovery.md)." >&2
  fi
}

# A skill-authoring harness keeps a labeled trigger-eval set so the skill's
# description can be measured (evals/trigger-eval.json). The set's *contract* is
# deterministic, but the *measurement* of the real trigger is stochastic, so it
# stays out of the gate: this advisory only nudges. It stays silent for a harness
# with no eval set, NOTEs an empty set, and NOTEs when SKILL.md changed since the
# last measurement marker. Never changes EXIT_CODE. See references/evals.md.
check_evals() {
  eval_set="$PROJECT_ROOT/evals/trigger-eval.json"
  [ -f "$eval_set" ] || return 0
  count="$(_json "$eval_set" len 2>/dev/null)"
  if [ "${count:-0}" -eq 0 ]; then
    echo "NOTE: evals/trigger-eval.json has no labeled queries - the description trigger is unmeasured." >&2
    echo "      add positive and negative queries, then run node dist/evals.js measure (see references/evals.md)." >&2
    return 0
  fi
  marker="$PROJECT_ROOT/evals/.last-measured"
  desc="$PROJECT_ROOT/SKILL.md"
  if [ -f "$desc" ] && { [ ! -f "$marker" ] || [ "$desc" -nt "$marker" ]; }; then
    echo "NOTE: SKILL.md changed since the last trigger measurement (or it was never measured)." >&2
    echo "      re-run node dist/evals.js measure and refresh evals/.last-measured (see references/evals.md)." >&2
  fi
}

# Preflight: read-only stability report (format/drift/sync/discovery) that
# orchestrates validate_harness, upgrade_harness, update_harness and
# tools_discovery. It always exits 0 and never changes EXIT_CODE; it surfaces
# drift/sync as NOTEs for the operator to act on. See references/workflow.md.
check_preflight() {
  preflight="$PROJECT_ROOT/dist/preflight.js"
  [ -f "$preflight" ] || return 0
  command -v node >/dev/null 2>&1 || return 0
  node "$preflight" --root "$PROJECT_ROOT" >&2 || true
}

# --- Execution --------------------------------------------------------------
if [ "$EXIT_CODE" -eq 0 ]; then
  cd "$PROJECT_ROOT" || exit 1
  run_phase "tools" check_tools
  run_phase "files" check_harness_files
  run_phase "state" check_feature_state
  run_phase "lint"  run_lint
  run_phase "build" run_build
  run_phase "test"  run_test
fi

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "VERIFIER: all gates passed"
else
  echo "VERIFIER: one or more gates failed" >&2
fi

# Advisory: report graphify context status without affecting EXIT_CODE.
check_harness_version
check_graphify_context
check_business_context
check_tools_discovery
check_evals
check_preflight

exit $EXIT_CODE
