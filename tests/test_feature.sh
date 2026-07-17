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
FEATURE="$SUITE_DIR/../handyman/dist/feature.js"

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
OUT="$(node "$FEATURE" --root "$F1" start a 2>&1)"; CODE=$?
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
node "$FEATURE" --root "$F2" start a >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F2" start b 2>&1)"; CODE=$?
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
OUT="$(node "$FEATURE" --root "$F3" block b --reason "waiting on api" 2>&1)"; CODE=$?
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
node "$FEATURE" --root "$F4" block b >/dev/null 2>&1; CODE=$?
if [ "$CODE" -ne 0 ]; then pass; else fail "expected non-zero exit"; fi
rm -rf "$F4"

# --- F5: add appends a pending feature --------------------------------------
start_case "add: appends a pending feature with an auto-incremented id"
F5="$(mktemp -d)"
write_harness "$F5"
OUT="$(node "$FEATURE" --root "$F5" add --name c --title C --acceptance crit1 2>&1)"; CODE=$?
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
node "$FEATURE" --root "$F6" add --name a >/dev/null 2>&1; CODE=$?
if [ "$CODE" -ne 0 ]; then pass; else fail "expected non-zero exit on duplicate"; fi
rm -rf "$F6"

# --- F7: done fails when the verifier fails ---------------------------------
start_case "done: fails and keeps state when the verifier exits non-zero"
F7="$(mktemp -d)"
write_harness "$F7"
write_verifier "$F7/fail.sh" 1
node "$FEATURE" --root "$F7" start a >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F7" "done" a --verifier "$F7/fail.sh" 2>&1)"; CODE=$?
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
node "$FEATURE" --root "$F8" start a >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F8" "done" a --verifier "$F8/pass.sh" --date 2026-06-17 2>&1)"; CODE=$?
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
node "$FEATURE" --root "$F9" start nope >/dev/null 2>&1; CODE=$?
if [ "$CODE" -ne 0 ]; then pass; else fail "expected non-zero exit"; fi
rm -rf "$F9"

# --- F10: log appends a bullet and bumps updated ----------------------------
start_case "log: appends a bullet to current.md Log and bumps updated"
F10="$(mktemp -d)"
write_harness "$F10"
node "$FEATURE" --root "$F10" start a >/dev/null 2>&1
node "$FEATURE" --root "$F10" log "did the thing" --date 2026-02-02 >/dev/null 2>&1; CODE=$?
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
node "$FEATURE" --root "$F11" start a >/dev/null 2>&1
node "$FEATURE" --root "$F11" next "run the verifier" --date 2026-02-02 >/dev/null 2>&1; CODE=$?
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
node "$FEATURE" --root "$F12" start a >/dev/null 2>&1
node "$FEATURE" --root "$F12" "done" a --verifier "$F12/pass.sh" --date 2026-02-02 >/dev/null 2>&1
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

# --- F13: post_run hook runs a successful custom step after close -----------
start_case "post_run: a successful custom step runs after a verified close"
F13="$(mktemp -d)"
write_harness "$F13"
write_verifier "$F13/pass.sh" 0
# declare a post_run step that touches a marker file in the harness root
cat > "$F13/harness.config.json" <<'JSON'
{ "install_mode": "local", "project_name": "t", "project_root": ".", "harness_workspace": ".handyman", "post_run": ["touch .post_run_marker"] }
JSON
node "$FEATURE" --root "$F13" start a >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F13" "done" a --verifier "$F13/pass.sh" --date 2026-02-02 2>&1)"; CODE=$?
ST="$(status_of "$F13/.handyman/feature_list.json" a)"
if [ "$CODE" -eq 0 ] && [ "$ST" = "done" ] && [ -f "$F13/.post_run_marker" ]; then
  pass
else
  fail "exit=$CODE status=$ST marker=$([ -f "$F13/.post_run_marker" ] && echo yes || echo no) out=$OUT"
fi
rm -rf "$F13"

# --- F14: post_run hook WARNs on a failing step but never reverts the close -
start_case "post_run: a failing custom step WARNs but the close stays exit 0 + done"
F14="$(mktemp -d)"
write_harness "$F14"
write_verifier "$F14/pass.sh" 0
cat > "$F14/harness.config.json" <<'JSON'
{ "install_mode": "local", "project_name": "t", "project_root": ".", "harness_workspace": ".handyman", "post_run": ["false"] }
JSON
node "$FEATURE" --root "$F14" start a >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F14" "done" a --verifier "$F14/pass.sh" --date 2026-02-02 2>&1)"; CODE=$?
ST="$(status_of "$F14/.handyman/feature_list.json" a)"
if [ "$CODE" -eq 0 ] && [ "$ST" = "done" ] && printf '%s' "$OUT" | grep -q "post_run WARN"; then
  pass
else
  fail "expected exit 0 + done + post_run WARN; exit=$CODE status=$ST out=$OUT"
fi
rm -rf "$F14"

# --- F15: no post_run declared = identical close to today -------------------
start_case "post_run: absent block means a normal close with no WARN"
F15="$(mktemp -d)"
write_harness "$F15"
write_verifier "$F15/pass.sh" 0
node "$FEATURE" --root "$F15" start a >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F15" "done" a --verifier "$F15/pass.sh" --date 2026-02-02 2>&1)"; CODE=$?
ST="$(status_of "$F15/.handyman/feature_list.json" a)"
if [ "$CODE" -eq 0 ] && [ "$ST" = "done" ] && ! printf '%s' "$OUT" | grep -q "post_run"; then
  pass
else
  fail "expected clean close; exit=$CODE status=$ST out=$OUT"
fi
rm -rf "$F15"

# --- F16: start runs the read-only preflight report when a config exists -----
start_case "start: runs the read-only preflight report when harness.config.json exists"
F16="$(mktemp -d)"
write_harness "$F16"
cat > "$F16/harness.config.json" <<'JSON'
{ "install_mode": "local", "project_name": "t", "project_root": ".", "harness_workspace": ".handyman" }
JSON
OUT="$(node "$FEATURE" --root "$F16" start a 2>&1)"; CODE=$?
ST="$(status_of "$F16/.handyman/feature_list.json" a)"
if [ "$CODE" -eq 0 ] && [ "$ST" = "in_progress" ] \
  && printf '%s' "$OUT" | grep -q "preflight"; then
  pass
else
  fail "exit=$CODE status=$ST (expected preflight report on start) out=$OUT"
fi
rm -rf "$F16"

# --- F17: --no-preflight skips the stability report -------------------------
start_case "start: --no-preflight skips the stability report"
F17="$(mktemp -d)"
write_harness "$F17"
cat > "$F17/harness.config.json" <<'JSON'
{ "install_mode": "local", "project_name": "t", "project_root": ".", "harness_workspace": ".handyman" }
JSON
OUT="$(node "$FEATURE" --root "$F17" start a --no-preflight 2>&1)"; CODE=$?
ST="$(status_of "$F17/.handyman/feature_list.json" a)"
if [ "$CODE" -eq 0 ] && [ "$ST" = "in_progress" ] \
  && ! printf '%s' "$OUT" | grep -q "preflight"; then
  pass
else
  fail "exit=$CODE status=$ST (expected no preflight output) out=$OUT"
fi
rm -rf "$F17"

# --- F18: done --tools writes the Tools: provenance line --------------------
start_case "done: --tools records provenance; omitted keeps the placeholder"
F18="$(mktemp -d)"
write_harness "$F18"
write_verifier "$F18/pass.sh" 0
node "$FEATURE" --root "$F18" start a >/dev/null 2>&1
node "$FEATURE" --root "$F18" "done" a --verifier "$F18/pass.sh" \
  --tools "skills: handyman, ponytail; agents: reviewer" --date 2026-02-02 >/dev/null 2>&1
HIST="$F18/.handyman/progress/history.md"
# second feature closed without --tools -> placeholder
node "$FEATURE" --root "$F18" start b >/dev/null 2>&1
node "$FEATURE" --root "$F18" "done" b --verifier "$F18/pass.sh" --date 2026-02-03 >/dev/null 2>&1
if grep -q -- "- \*\*Tools:\*\* skills: handyman, ponytail; agents: reviewer" "$HIST" \
  && grep -A5 "Feature 2: b" "$HIST" | grep -q -- "- \*\*Tools:\*\* \.\.\."; then
  pass
else
  fail "Tools provenance wrong in history: $(cat "$HIST")"
fi
rm -rf "$F18"

# --- F19: start records the git branch in current.md ------------------------
start_case "start: records the git branch; placeholder outside a repo"
F19="$(mktemp -d)"
write_harness "$F19"
git -C "$F19" init -q -b prov-branch 2>/dev/null || {
  git -C "$F19" init -q && git -C "$F19" checkout -q -b prov-branch
}
node "$FEATURE" --root "$F19" start a >/dev/null 2>&1
CUR="$F19/.handyman/progress/current.md"
# and a non-git fixture keeps the placeholder
F19B="$(mktemp -d)"
write_harness "$F19B"
node "$FEATURE" --root "$F19B" start a >/dev/null 2>&1
if grep -q -- "- \*\*Branch:\*\* prov-branch" "$CUR" \
  && grep -q -- "- \*\*Branch:\*\* _-_" "$F19B/.handyman/progress/current.md"; then
  pass
else
  fail "branch lines: $(grep 'Branch' "$CUR" "$F19B/.handyman/progress/current.md")"
fi
rm -rf "$F19" "$F19B"

# --- F20: done carries the session branch into the history entry ------------
start_case "done: carries the session branch into the history entry"
F20="$(mktemp -d)"
write_harness "$F20"
write_verifier "$F20/pass.sh" 0
git -C "$F20" init -q -b prov-close 2>/dev/null || {
  git -C "$F20" init -q && git -C "$F20" checkout -q -b prov-close
}
node "$FEATURE" --root "$F20" start a >/dev/null 2>&1
node "$FEATURE" --root "$F20" "done" a --verifier "$F20/pass.sh" --date 2026-02-04 >/dev/null 2>&1
HIST="$F20/.handyman/progress/history.md"
if grep -A2 "Feature 1: a" "$HIST" | grep -q -- "- \*\*Branch:\*\* prov-close"; then
  pass
else
  fail "expected branch in history entry: $(cat "$HIST")"
fi
rm -rf "$F20"

# --- F21: add never reuses an archived feature id ----------------------------
start_case "add: id continues past the archive high-water mark"
F21="$(mktemp -d)"
write_harness "$F21"
mkdir -p "$F21/.handyman/archive"
cat > "$F21/.handyman/archive/feature_archive.json" <<'JSON'
{ "sprints": { "2026-SP1": [ { "id": 9, "name": "old", "status": "done" } ] } }
JSON
node "$FEATURE" --root "$F21" add --name fresh >/dev/null 2>&1
NEW_ID="$(python3 -c "import json;d=json.load(open('$F21/.handyman/feature_list.json'));print(next(f['id'] for f in d['features'] if f['name']=='fresh'))")"
if [ "$NEW_ID" = "10" ]; then
  pass
else
  fail "expected id 10 (archive max 9 beats live max 2), got $NEW_ID"
fi
rm -rf "$F21"

# --- F22: ready derives the frontier from depends_on --------------------------
start_case "ready: lists only pending features whose depends_on are satisfied"
F22="$(mktemp -d)"
write_harness "$F22"
mkdir -p "$F22/.handyman/archive"
cat > "$F22/.handyman/archive/feature_archive.json" <<'JSON'
{ "sprints": { "2026-SP1": [ { "id": 9, "name": "old", "status": "done" } ] } }
JSON
node "$FEATURE" --root "$F22" add --name gated --depends-on 2 >/dev/null 2>&1
node "$FEATURE" --root "$F22" add --name unlocked --depends-on 9 >/dev/null 2>&1
DEPS="$(python3 -c "import json;d=json.load(open('$F22/.handyman/feature_list.json'));print(next(f.get('depends_on') for f in d['features'] if f['name']=='gated'))")"
OUT="$(node "$FEATURE" --root "$F22" ready 2>&1)"; CODE=$?
# a and b have no deps (ready); unlocked's dep 9 is archived (ready);
# gated's dep 2 (b) is still pending (not ready).
if [ "$CODE" -eq 0 ] && [ "$DEPS" = "[2]" ] \
  && printf '%s' "$OUT" | grep -q "unlocked" \
  && ! printf '%s' "$OUT" | grep -q "gated"; then
  pass
else
  fail "exit=$CODE deps=$DEPS output: $OUT"
fi
rm -rf "$F22"

# --- F23: ready exits 3 when the backlog is drained ---------------------------
start_case "ready: exits 3 with a drained backlog and prints [] under --json"
F23="$(mktemp -d)"
write_harness "$F23"
python3 - "$F23/.handyman/feature_list.json" <<'PY'
import json, sys
path = sys.argv[1]
d = json.load(open(path))
for f in d["features"]:
    f["status"] = "blocked" if f["name"] == "a" else "done"
json.dump(d, open(path, "w"), indent=2)
PY
OUT="$(node "$FEATURE" --root "$F23" ready --json 2>/dev/null)"; CODE=$?
PARSED="$(printf '%s' "$OUT" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")"
if [ "$CODE" -eq 3 ] && [ "$PARSED" = "0" ]; then
  pass
else
  fail "expected exit 3 + empty JSON, exit=$CODE out=$OUT"
fi
rm -rf "$F23"

# --- F24: start warns on unmet dependencies but does not block ---------------
start_case "start: warns about unmet dependencies without blocking"
F24="$(mktemp -d)"
write_harness "$F24"
node "$FEATURE" --root "$F24" add --name gated --depends-on 1 >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F24" start gated 2>&1)"; CODE=$?
ST="$(status_of "$F24/.handyman/feature_list.json" gated)"
if [ "$CODE" -eq 0 ] && [ "$ST" = "in_progress" ] \
  && printf '%s' "$OUT" | grep -q "WARN.*unmet dependencies.*1"; then
  pass
else
  fail "exit=$CODE status=$ST output: $OUT"
fi
rm -rf "$F24"

# --- F25: observation shape - stable status tail, JSON mode exempt -----------
start_case "observation shape: status tail on ok/warn/error, none under --json"
F25="$(mktemp -d)"
write_harness "$F25"
OK_TAIL="$(node "$FEATURE" --root "$F25" add --name shaped 2>/dev/null | tail -n1)"
node "$FEATURE" --root "$F25" start a >/dev/null 2>&1
ERR_TAIL="$(node "$FEATURE" --root "$F25" start b 2>/dev/null | tail -n1)"
python3 - "$F25/.handyman/feature_list.json" <<'PY'
import json, sys
path = sys.argv[1]
d = json.load(open(path))
for f in d["features"]:
    f["status"] = "blocked"
json.dump(d, open(path, "w"), indent=2)
PY
WARN_OUT="$(node "$FEATURE" --root "$F25" ready 2>/dev/null)"
WARN_TAIL="$(printf '%s' "$WARN_OUT" | tail -n1)"
JSON_OUT="$(node "$FEATURE" --root "$F25" ready --json 2>/dev/null)"
if [ "$OK_TAIL" = "status: ok" ] && [ "$ERR_TAIL" = "status: error" ] \
  && [ "$WARN_TAIL" = "status: warn" ] \
  && printf '%s' "$WARN_OUT" | grep -q "^next:" \
  && ! printf '%s' "$JSON_OUT" | grep -q "status:"; then
  pass
else
  fail "ok=$OK_TAIL err=$ERR_TAIL warn=$WARN_TAIL json=$JSON_OUT"
fi
rm -rf "$F25"

summary