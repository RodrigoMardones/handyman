#!/usr/bin/env bash
# Reference implementation of the Handyman verifier (init.sh contract).
# Implements the resolution + validation logic documented in
# references/templates.md (init.sh Shape) and references/anatomy.md
# (Verification Contract). Used by the test suite to exercise the contract.
set -u
EXIT_CODE=0

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_WORKSPACE="$PROJECT_ROOT"

# Portable JSON reader: node is the sole post-migration runtime, so the
# verifier contract is self-contained (no jq or python).
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
  fi
}

# 1. Resolve HARNESS_WORKSPACE.
if [ -f "$PROJECT_ROOT/harness.config.json" ]; then
  RESOLVED="$(_json "$PROJECT_ROOT/harness.config.json" str harness_workspace)"
  [ -n "$RESOLVED" ] && HARNESS_WORKSPACE="$RESOLVED"
elif [ -f "$PROJECT_ROOT/.handyman/feature_list.json" ]; then
  HARNESS_WORKSPACE="$PROJECT_ROOT/.handyman"
fi

# Resolve a relative harness_workspace against PROJECT_ROOT.
case "${HARNESS_WORKSPACE:-}" in
  /*) : ;;
  "") : ;;
  *) HARNESS_WORKSPACE="$PROJECT_ROOT/$HARNESS_WORKSPACE" ;;
esac

if [ -z "${HARNESS_WORKSPACE:-}" ]; then
  echo "HARNESS_WORKSPACE could not be resolved" >&2
  EXIT_CODE=1
fi

# Expose the resolved value for tests/debugging.
echo "HARNESS_WORKSPACE=$HARNESS_WORKSPACE"

# 2. Required project-root bridge files.
for f in AGENTS.md CHECKPOINTS.md; do
  if [ ! -f "$PROJECT_ROOT/$f" ]; then
    echo "missing bridge file: $f" >&2
    EXIT_CODE=1
  fi
done

# 3. Required harness files in HARNESS_WORKSPACE. The knowledge dir is
# memory/ in the current layout; legacy harnesses keep docs/.
DOCS_DIR="docs"
[ -d "$HARNESS_WORKSPACE/memory" ] && DOCS_DIR="memory"
for f in feature_list.json progress/current.md progress/history.md \
         "$DOCS_DIR/business.md" "$DOCS_DIR/architecture.md" \
         "$DOCS_DIR/conventions.md" "$DOCS_DIR/verification.md"; do
  if [ ! -f "$HARNESS_WORKSPACE/$f" ]; then
    echo "missing harness file: $f" >&2
    EXIT_CODE=1
  fi
done

# 4. Parse feature_list.json and enforce at most one in_progress feature.
FL="$HARNESS_WORKSPACE/feature_list.json"
if [ -f "$FL" ]; then
  if ! _json "$FL" valid >/dev/null 2>&1; then
    echo "feature_list.json is not valid JSON" >&2
    EXIT_CODE=1
  else
    IN_PROGRESS="$(_json "$FL" count_status in_progress)"
    if [ "$IN_PROGRESS" -gt 1 ]; then
      echo "more than one feature is in_progress ($IN_PROGRESS)" >&2
      EXIT_CODE=1
    fi
  fi
fi

# 5. Optional product test hook: run from PROJECT_ROOT if present.
if [ -x "$PROJECT_ROOT/verify_tests.sh" ]; then
  ( cd "$PROJECT_ROOT" && ./verify_tests.sh ) || EXIT_CODE=1
fi

exit $EXIT_CODE
