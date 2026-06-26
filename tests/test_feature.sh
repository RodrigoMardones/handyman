#!/usr/bin/env bash
# Feature-state CLI tests for the Handyman skill.
# Exercises scripts/feature.py against fixture harnesses: add, start (with the
# single-in_progress invariant), block, and done (verifier-gated close with
# history append + current.md reset). Stub verifiers avoid recursing into the
# real test suite.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
FEATURE="$SUITE_DIR/../handyman/scripts/feature.py"

echo "Feature-CLI suite (test_feature.sh)"

# --- fixture builders --------------------------------------------------------

# Build a minimal local harness in $1 with two pending features a and b.
write_harness() {
  root="$1"
  mkdir -p "$root/.handyman/progress"
  cat > "$root/.handyman/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [
    { "id": 1, "name": "a", "status": "pending" },
    { "id": 2, "name": "b", "status": "pending" }
  ]
}
JSON
  : > "$root/.handyman/progress/current.md"
  : > "$root/.handyman/progress/history.md"
}

# Write a stub verifier exiting with code $2 to $1.
write_verifier() {
  printf '#!/usr/bin/env bash\nexit %s\n' "$2" > "$1"
  chmod +x "$1"
}

status_of() { # $1=feature_list.json  $2=feature name
  python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(next((f['status'] for f in d['features'] if f['name']==sys.argv[2]),''))" "$1" "$2"
}

# --- F1: start marks in_progress --------------------------------------------
start_case "start: marks a pending feature in_progress and updates current.md"
F1="$(mktemp -d)"
write_harness "$F1"
OUT="$(python3 "$FEATURE" --root "$F1" start a 2>&1)"; CODE=$?
ST="$(status_of "$F1/.handyman/feature_list.json" a)"
if [ "$CODE" -eq 0 ] && [ "$ST" = "in_progress" ] \
  && grep -q "feature: a" "$F1/.handyman/progress/current.md"; then
  pass
else
  fail "exit=$CODE status=$ST output: $OUT"
fi
rm -rf "$F1"

# --- F2: start enforces single in_progress ----------------------------------
start_case "start: fails when another feature is already in_progress"
F2="$(mktemp -d)"
write_harness "$F2"
python3 "$FEATURE" --root "$F2" start a >/dev/null 2>&1
OUT="$(python3 "$FEATURE" --root "$F2" start b 2>&1)"; CODE=$?
ST="$(status_of "$F2/.handyman/feature_list.json" b)"
if [ "$CODE" -ne 0 ] && [ "$ST" = "pending" ] \
  && printf '%s' "$OUT" | grep -q "in_progress"; then
  pass
else
  fail "expected failure, exit=$CODE status=$ST output: $OUT"
fi
rm -rf "$F2"

# --- F3: block records the reason -------------------------------------------
start_case "block: marks blocked and records blocked_reason"
F3="$(mktemp -d)"
write_harness "$F3"
OUT="$(python3 "$FEATURE" --root "$F3" block b --reason "waiting on api" 2>&1)"; CODE=$?
ST="$(status_of "$F3/.handyman/feature_list.json" b)"
REASON="$(python3 -c "import json;d=json.load(open('$F3/.handyman/feature_list.json'));print(next(f.get('blocked_reason','') for f in d['features'] if f['name']=='b'))")"
if [ "$CODE" -eq 0 ] && [ "$ST" = "blocked" ] && [ "$REASON" = "waiting on api" ]; then
  pass
else
  fail "exit=$CODE status=$ST reason=$REASON output: $OUT"
fi
rm -rf "$F3"

# --- F4: block requires a reason (usage error) ------------------------------
start_case "block: fails without --reason"
F4="$(mktemp -d)"
write_harness "$F4"
python3 "$FEATURE" --root "$F4" block b >/dev/null 2>&1; CODE=$?
if [ "$CODE" -ne 0 ]; then pass; else fail "expected non-zero exit"; fi
rm -rf "$F4"

# --- F5: add appends a pending feature --------------------------------------
start_case "add: appends a pending feature with an auto-incremented id"
F5="$(mktemp -d)"
write_harness "$F5"
OUT="$(python3 "$FEATURE" --root "$F5" add --name c --title C --acceptance crit1 2>&1)"; CODE=$?
NEWID="$(python3 -c "import json;d=json.load(open('$F5/.handyman/feature_list.json'));print(next(f['id'] for f in d['features'] if f['name']=='c'))")"
ST="$(status_of "$F5/.handyman/feature_list.json" c)"
if [ "$CODE" -eq 0 ] && [ "$NEWID" = "3" ] && [ "$ST" = "pending" ]; then
  pass
else
  fail "exit=$CODE id=$NEWID status=$ST output: $OUT"
fi
rm -rf "$F5"

# --- F6: add rejects a duplicate name ---------------------------------------
start_case "add: fails on a duplicate feature name"
F6="$(mktemp -d)"
write_harness "$F6"
python3 "$FEATURE" --root "$F6" add --name a >/dev/null 2>&1; CODE=$?
if [ "$CODE" -ne 0 ]; then pass; else fail "expected non-zero exit on duplicate"; fi
rm -rf "$F6"

# --- F7: done fails when the verifier fails ---------------------------------
start_case "done: fails and keeps state when the verifier exits non-zero"
F7="$(mktemp -d)"
write_harness "$F7"
write_verifier "$F7/fail.sh" 1
python3 "$FEATURE" --root "$F7" start a >/dev/null 2>&1
OUT="$(python3 "$FEATURE" --root "$F7" "done" a --verifier "$F7/fail.sh" 2>&1)"; CODE=$?
ST="$(status_of "$F7/.handyman/feature_list.json" a)"
if [ "$CODE" -ne 0 ] && [ "$ST" = "in_progress" ]; then
  pass
else
  fail "expected failure, exit=$CODE status=$ST output: $OUT"
fi
rm -rf "$F7"

# --- F8: done closes on a green verifier ------------------------------------
start_case "done: marks done, appends history, and resets current.md on green verifier"
F8="$(mktemp -d)"
write_harness "$F8"
write_verifier "$F8/pass.sh" 0
python3 "$FEATURE" --root "$F8" start a >/dev/null 2>&1
OUT="$(python3 "$FEATURE" --root "$F8" "done" a --verifier "$F8/pass.sh" --date 2026-06-17 2>&1)"; CODE=$?
ST="$(status_of "$F8/.handyman/feature_list.json" a)"
if [ "$CODE" -eq 0 ] && [ "$ST" = "done" ] \
  && grep -q "Feature 1: a" "$F8/.handyman/progress/history.md" \
  && grep -q "status: idle" "$F8/.handyman/progress/current.md"; then
  pass
else
  fail "exit=$CODE status=$ST output: $OUT"
fi
rm -rf "$F8"

# --- F9: start fails for an unknown feature ---------------------------------
start_case "start: fails for an unknown feature name"
F9="$(mktemp -d)"
write_harness "$F9"
python3 "$FEATURE" --root "$F9" start nope >/dev/null 2>&1; CODE=$?
if [ "$CODE" -ne 0 ]; then pass; else fail "expected non-zero exit"; fi
rm -rf "$F9"

# --- F10: log appends a bullet and bumps updated ----------------------------
start_case "log: appends a bullet to current.md Log and bumps updated"
F10="$(mktemp -d)"
write_harness "$F10"
python3 "$FEATURE" --root "$F10" start a >/dev/null 2>&1
python3 "$FEATURE" --root "$F10" log "did the thing" --date 2026-02-02 >/dev/null 2>&1; CODE=$?
CUR="$F10/.handyman/progress/current.md"
if [ "$CODE" -eq 0 ] && grep -q "^- did the thing$" "$CUR" \
  && grep -q "^updated: 2026-02-02$" "$CUR"; then
  pass
else
  fail "exit=$CODE current.md did not get the log line / updated bump"
fi
rm -rf "$F10"

# --- F11: next sets the Next Step section ------------------------------------
start_case "next: sets the Next Step section of current.md"
F11="$(mktemp -d)"
write_harness "$F11"
python3 "$FEATURE" --root "$F11" start a >/dev/null 2>&1
python3 "$FEATURE" --root "$F11" next "run the verifier" --date 2026-02-02 >/dev/null 2>&1; CODE=$?
CUR="$F11/.handyman/progress/current.md"
if [ "$CODE" -eq 0 ] && grep -q "run the verifier" "$CUR" \
  && ! grep -q "the next session starts here" "$CUR"; then
  pass
else
  fail "exit=$CODE Next Step section not set"
fi
rm -rf "$F11"

# --- F12: done writes a rich history entry ----------------------------------
start_case "done: history entry carries the rich headed fields"
F12="$(mktemp -d)"
write_harness "$F12"
write_verifier "$F12/pass.sh" 0
python3 "$FEATURE" --root "$F12" start a >/dev/null 2>&1
python3 "$FEATURE" --root "$F12" "done" a --verifier "$F12/pass.sh" --date 2026-02-02 >/dev/null 2>&1
HIST="$F12/.handyman/progress/history.md"
if grep -q "Feature 1: a" "$HIST" \
  && grep -q "[*][*]Agent:[*][*]" "$HIST" \
  && grep -q "[*][*]Changes:[*][*]" "$HIST" \
  && grep -q "[*][*]Closure:[*][*] done" "$HIST"; then
  pass
else
  fail "history entry is not the rich form"
fi
rm -rf "$F12"

summary