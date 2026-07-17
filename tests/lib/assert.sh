#!/usr/bin/env bash
# Minimal assertion helpers for the Handyman skill test suite.
# POSIX/bash 3.2 compatible (macOS default bash).

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
CURRENT_CASE=""

_color() { # $1=code $2=text
  if [ -t 1 ]; then printf '\033[%sm%s\033[0m' "$1" "$2"; else printf '%s' "$2"; fi
}

start_case() {
  CURRENT_CASE="$1"
  TESTS_RUN=$((TESTS_RUN + 1))
}

pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  printf '  %s %s\n' "$(_color 32 'PASS')" "$CURRENT_CASE"
}

fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  printf '  %s %s\n' "$(_color 31 'FAIL')" "$CURRENT_CASE"
  if [ -n "${1:-}" ]; then printf '       %s\n' "$1"; fi
}

assert_eq() { # $1=expected $2=actual $3=msg
  if [ "$1" = "$2" ]; then pass; else fail "${3:-} (expected '$1', got '$2')"; fi
}

assert_exit() { # $1=expected_code $2=actual_code $3=msg
  if [ "$1" -eq "$2" ]; then pass; else fail "${3:-} (expected exit $1, got $2)"; fi
}

assert_true() { # $1=condition_result(0/1 via &&) used as: assert_true "msg"; preceded by `if cmd; then ok=1...`
  : # not used directly
}

summary() {
  printf '\n%s: %d run, %s, %s\n' \
    "Summary" "$TESTS_RUN" \
    "$(_color 32 "${TESTS_PASSED} passed")" \
    "$(_color 31 "${TESTS_FAILED} failed")"
  [ "$TESTS_FAILED" -eq 0 ]
}

# Portable JSON reader for the test harness: prefers node, falls back to
# python3, so the suite needs no jq. Usage: _json FILE VERB [ARG]
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
