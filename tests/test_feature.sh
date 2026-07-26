#!/usr/bin/env bash
# Feature-state CLI tests for the Handyman skill.
# Exercises dist/feature.js against fixture harnesses: add, start (with the
# single-in_progress invariant), block, and done (verifier-gated close with
# history append + current.md reset). Stub verifiers avoid recursing into the
# real test suite.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
FEATURE="$SUITE_DIR/../handyman/dist/feature.js"
BACKLOG="$SUITE_DIR/../handyman/dist/backlog.js"

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
  node "$SUITE_DIR/lib/jsonget.js" read "$1" "(d.features.find(f=>f.name===a[0])||{}).status||''" "$2"
}

# --- F1: start marks in_progress --------------------------------------------
start_case "start: marks a pending feature in_progress and updates current.md"
F1="$(mktemp -d)"
write_harness "$F1"
OUT="$(node "$FEATURE" --root "$F1" start a 2>&1)"; CODE=$?
ST="$(status_of "$F1/.handyman/feature_list.json" a)"
if [ "$CODE" -eq 0 ] && [ "$ST" = "in_progress" ] \
  && grep -q "feature: a" "$F1/.handyman/progress/current.md" \
  && grep -q "^type: Session Log$" "$F1/.handyman/progress/current.md"; then
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
REASON="$(node "$SUITE_DIR/lib/jsonget.js" read "$F3/.handyman/feature_list.json" "(d.features.find(f=>f.name==='b')||{}).blocked_reason||''")"
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
NEWID="$(node "$SUITE_DIR/lib/jsonget.js" read "$F5/.handyman/feature_list.json" "(d.features.find(f=>f.name==='c')||{}).id")"
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

# --- F12: done writes a compact history entry --------------------------------
# The narrative lives in backlog/impl_<name>.md; the entry keeps the dated
# heading (metrics/sprint parse it), Branch and Tools (renderDoc aggregates
# them), the evidence pointers, and the gate.
start_case "done: history entry carries the compact headed fields"
F12="$(mktemp -d)"
write_harness "$F12"
write_verifier "$F12/pass.sh" 0
node "$FEATURE" --root "$F12" start a >/dev/null 2>&1
node "$FEATURE" --root "$F12" "done" a --verifier "$F12/pass.sh" --date 2026-02-02 >/dev/null 2>&1
HIST="$F12/.handyman/progress/history.md"
if grep -q "Feature 1: a" "$HIST" \
  && grep -q "[*][*]Branch:[*][*]" "$HIST" \
  && grep -q "[*][*]Evidence:[*][*] backlog/impl_a.md" "$HIST" \
  && grep -q "[*][*]Verification:[*][*] verifier exit 0 · closure done" "$HIST" \
  && ! grep -q "[*][*]Plan:[*][*]" "$HIST"; then
  pass
else
  fail "history entry is not the compact form: $(cat "$HIST")"
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
NEW_ID="$(node "$SUITE_DIR/lib/jsonget.js" read "$F21/.handyman/feature_list.json" "(d.features.find(f=>f.name==='fresh')||{}).id")"
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
DEPS="$(node "$SUITE_DIR/lib/jsonget.js" read "$F22/.handyman/feature_list.json" "JSON.stringify((d.features.find(f=>f.name==='gated')||{}).depends_on)")"
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
node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));for(const f of d.features){f.status=f.name==="a"?"blocked":"done";}fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");' "$F23/.handyman/feature_list.json"
OUT="$(node "$FEATURE" --root "$F23" ready --json 2>/dev/null)"; CODE=$?
PARSED="$(printf '%s' "$OUT" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(Array.isArray(d)?d.length:Object.keys(d).length))')"
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
node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));for(const f of d.features){f.status="blocked";}fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");' "$F25/.handyman/feature_list.json"
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

# --- F26: start stamps an exact ISO 8601 started_at timestamp ---------------
start_case "start: stamps meta.started_at as an ISO 8601 timestamp"
F26="$(mktemp -d)"
write_harness "$F26"
node "$FEATURE" --root "$F26" start a >/dev/null 2>&1
STARTED="$(node "$SUITE_DIR/lib/jsonget.js" read "$F26/.handyman/feature_list.json" "(d.features.find(f=>f.name==='a')||{}).meta?.started_at ?? ''")"
DONE="$(node "$SUITE_DIR/lib/jsonget.js" read "$F26/.handyman/feature_list.json" "(d.features.find(f=>f.name==='a')||{}).meta?.done_at ?? ''")"
# ISO 8601 UTC: YYYY-MM-DDTHH:MM:SS(...).fffZ
# [0-9] (not \d): POSIX ERE, portable across BSD/macOS and GNU/Linux grep
ISO_MATCH="$(printf '%s' "$STARTED" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' && echo yes || echo no)"
# a feature that was only started has started_at but no done_at
if [ -n "$STARTED" ] && [ "$ISO_MATCH" = "yes" ] && [ -z "$DONE" ]; then
  pass
else
  fail "started_at='$STARTED' iso=$ISO_MATCH done_at='$DONE'"
fi
rm -rf "$F26"

# --- F27: done stamps an exact ISO 8601 done_at timestamp -------------------
start_case "done: stamps meta.done_at as an ISO 8601 timestamp on close"
F27="$(mktemp -d)"
write_harness "$F27"
write_verifier "$F27/pass.sh" 0
node "$FEATURE" --root "$F27" start a >/dev/null 2>&1
STARTED="$(node "$SUITE_DIR/lib/jsonget.js" read "$F27/.handyman/feature_list.json" "(d.features.find(f=>f.name==='a')||{}).meta?.started_at ?? ''")"
node "$FEATURE" --root "$F27" "done" a --verifier "$F27/pass.sh" --date 2026-07-17 >/dev/null 2>&1
DONE="$(node "$SUITE_DIR/lib/jsonget.js" read "$F27/.handyman/feature_list.json" "(d.features.find(f=>f.name==='a')||{}).meta?.done_at ?? ''")"
ISO_MATCH="$(printf '%s' "$DONE" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' && echo yes || echo no)"
# done_at is a fresh real timestamp (distinct from the earlier started_at)
if [ -n "$DONE" ] && [ "$ISO_MATCH" = "yes" ] && [ "$DONE" != "$STARTED" ]; then
  pass
else
  fail "done_at='$DONE' iso=$ISO_MATCH started_at='$STARTED'"
fi
rm -rf "$F27"

# --- F28: unblock returns a blocked feature to pending ----------------------
start_case "unblock: blocked -> pending and drops blocked_reason"
F28="$(mktemp -d)"
write_harness "$F28"
node "$FEATURE" --root "$F28" block b --reason "waiting on api" >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F28" unblock b 2>&1)"; CODE=$?
ST="$(status_of "$F28/.handyman/feature_list.json" b)"
HAS_REASON="$(node "$SUITE_DIR/lib/jsonget.js" read "$F28/.handyman/feature_list.json" "('blocked_reason' in (d.features.find(f=>f.name==='b')||{})) ? 'yes' : 'no'")"
if [ "$CODE" -eq 0 ] && [ "$ST" = "pending" ] && [ "$HAS_REASON" = "no" ]; then
  pass
else
  fail "exit=$CODE status=$ST has_reason=$HAS_REASON output: $OUT"
fi
rm -rf "$F28"

# --- F29: unblock refuses a feature that is not blocked ---------------------
# Guards the state machine: unblock is the inverse of block, not a generic
# "set to pending" that could reopen a done feature.
start_case "unblock: fails on a feature that is not blocked and leaves the file untouched"
F29="$(mktemp -d)"
write_harness "$F29"
BEFORE="$(cat "$F29/.handyman/feature_list.json")"
OUT="$(node "$FEATURE" --root "$F29" unblock a 2>&1)"; CODE=$?
AFTER="$(cat "$F29/.handyman/feature_list.json")"
if [ "$CODE" -ne 0 ] && [ "$BEFORE" = "$AFTER" ]; then
  pass
else
  fail "expected failure, exit=$CODE file_changed=$([ "$BEFORE" = "$AFTER" ] && echo no || echo yes) output: $OUT"
fi
rm -rf "$F29"

# --- F30: acceptance replaces the whole list --------------------------------
start_case "acceptance: replaces the acceptance list with exactly the given criteria"
F30="$(mktemp -d)"
write_harness "$F30"
node "$FEATURE" --root "$F30" acceptance a --acceptance "seed" >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F30" acceptance a --acceptance "A" --acceptance "B" 2>&1)"; CODE=$?
LIST="$(node "$SUITE_DIR/lib/jsonget.js" read "$F30/.handyman/feature_list.json" "JSON.stringify((d.features.find(f=>f.name==='a')||{}).acceptance||[])")"
if [ "$CODE" -eq 0 ] && [ "$LIST" = '["A","B"]' ]; then
  pass
else
  fail "exit=$CODE acceptance=$LIST output: $OUT"
fi
rm -rf "$F30"

# --- F31: acceptance requires at least one criterion ------------------------
# A forgotten flag must not read as "clear the acceptance list".
start_case "acceptance: fails without --acceptance and leaves the existing list intact"
F31="$(mktemp -d)"
write_harness "$F31"
node "$FEATURE" --root "$F31" acceptance a --acceptance "keep me" >/dev/null 2>&1
OUT="$(node "$FEATURE" --root "$F31" acceptance a 2>&1)"; CODE=$?
LIST="$(node "$SUITE_DIR/lib/jsonget.js" read "$F31/.handyman/feature_list.json" "JSON.stringify((d.features.find(f=>f.name==='a')||{}).acceptance||[])")"
if [ "$CODE" -ne 0 ] && [ "$LIST" = '["keep me"]' ]; then
  pass
else
  fail "expected failure, exit=$CODE acceptance=$LIST output: $OUT"
fi
rm -rf "$F31"

# --- F32: done reads the verdict a real `backlog.js review` file carries -----
# The review file is generated by the harness's own tool, not hand-written:
# the canonical key is `status:`, and a fixture that hand-writes `verdict:`
# passes while the documented path silently records NO VERDICT.
start_case "done: history carries the verdict from a generated review file"
F32="$(mktemp -d)"
write_harness "$F32"
write_verifier "$F32/pass.sh" 0
node "$BACKLOG" --root "$F32" review a --status changes_requested >/dev/null 2>&1
node "$FEATURE" --root "$F32" start a >/dev/null 2>&1
node "$FEATURE" --root "$F32" "done" a --verifier "$F32/pass.sh" --date 2026-02-04 >/dev/null 2>&1
HIST32="$F32/.handyman/progress/history.md"
if grep -q -- "review: CHANGES_REQUESTED -> backlog/review_a.md" "$HIST32"; then
  pass
else
  fail "expected the generated review's status, uppercased: $(cat "$HIST32")"
fi
rm -rf "$F32"

# --- F32b: the approved path of the same generator ---------------------------
start_case "done: a generated approved review records APPROVED"
F32B="$(mktemp -d)"
write_harness "$F32B"
write_verifier "$F32B/pass.sh" 0
node "$BACKLOG" --root "$F32B" review a --status approved >/dev/null 2>&1
node "$FEATURE" --root "$F32B" start a >/dev/null 2>&1
node "$FEATURE" --root "$F32B" "done" a --verifier "$F32B/pass.sh" --date 2026-02-04 >/dev/null 2>&1
if grep -q -- "review: APPROVED -> backlog/review_a.md" "$F32B/.handyman/progress/history.md"; then
  pass
else
  fail "expected APPROVED: $(cat "$F32B/.handyman/progress/history.md")"
fi
rm -rf "$F32B"

# --- F32c: legacy hand-written reviews carrying `verdict:` still resolve ------
start_case "done: falls back to a legacy verdict: key"
F32C="$(mktemp -d)"
write_harness "$F32C"
write_verifier "$F32C/pass.sh" 0
mkdir -p "$F32C/.handyman/backlog"
printf -- '---\nfeature: a\nverdict: approved\n---\n' > "$F32C/.handyman/backlog/review_a.md"
node "$FEATURE" --root "$F32C" start a >/dev/null 2>&1
node "$FEATURE" --root "$F32C" "done" a --verifier "$F32C/pass.sh" --date 2026-02-04 >/dev/null 2>&1
if grep -q -- "review: APPROVED -> backlog/review_a.md" "$F32C/.handyman/progress/history.md"; then
  pass
else
  fail "expected the verdict: fallback to resolve: $(cat "$F32C/.handyman/progress/history.md")"
fi
rm -rf "$F32C"

# --- F33: done never invents a verdict when the review file is absent --------
start_case "done: marks the absent review instead of asserting APPROVED"
F33="$(mktemp -d)"
write_harness "$F33"
write_verifier "$F33/pass.sh" 0
node "$FEATURE" --root "$F33" start a >/dev/null 2>&1
node "$FEATURE" --root "$F33" "done" a --verifier "$F33/pass.sh" --date 2026-02-04 >/dev/null 2>&1
HIST33="$F33/.handyman/progress/history.md"
if grep -q -- "review: NO REVIEW FILE" "$HIST33" && ! grep -q "APPROVED" "$HIST33"; then
  pass
else
  fail "expected the NO REVIEW FILE marker and no APPROVED claim: $(cat "$HIST33")"
fi
rm -rf "$F33"

# --- F33b: a review file that exists but declares no verdict -----------------
# The other half of "never invent a verdict": an unreadable verdict is a
# different fact from an absent file, and the marker has to tell them apart.
# Closing a feature stays exit 0 either way -- this records the truth, it does
# not harden the gate (sprint decision: plan-accion-contrato-y-panel.md 3.3b).
start_case "done: marks a review that declares no verdict as NO VERDICT"
F33B="$(mktemp -d)"
write_harness "$F33B"
write_verifier "$F33B/pass.sh" 0
mkdir -p "$F33B/.handyman/backlog"
printf -- '---\nfeature: a\nrole: reviewer\n---\nbody without a verdict\n' \
  > "$F33B/.handyman/backlog/review_a.md"
node "$FEATURE" --root "$F33B" start a >/dev/null 2>&1
node "$FEATURE" --root "$F33B" "done" a --verifier "$F33B/pass.sh" --date 2026-02-04 >/dev/null 2>&1
RC33B=$?
HIST33B="$F33B/.handyman/progress/history.md"
STATUS33B="$(node -e "process.stdout.write(String(require('$F33B/.handyman/feature_list.json').features[0].status))")"
if grep -q -- "review: NO VERDICT" "$HIST33B" \
  && ! grep -q "APPROVED" "$HIST33B" \
  && [ "$RC33B" -eq 0 ] && [ "$STATUS33B" = "done" ]; then
  pass
else
  fail "expected NO VERDICT, exit 0 and status done: rc=$RC33B status=$STATUS33B $(cat "$HIST33B")"
fi
rm -rf "$F33B"

# --- F34: acceptance refuses a done feature ----------------------------------
# A done feature's acceptance list is the contract its review signed against.
# Rewriting it silently would leave backlog/review_<name>.md attesting to terms
# that no longer exist.
start_case "acceptance: refuses a done feature and leaves the contract intact"
F34="$(mktemp -d)"
write_harness "$F34"
write_verifier "$F34/pass.sh" 0
node "$FEATURE" --root "$F34" acceptance a --acceptance "original" >/dev/null 2>&1
node "$FEATURE" --root "$F34" start a >/dev/null 2>&1
node "$FEATURE" --root "$F34" "done" a --verifier "$F34/pass.sh" --date 2026-02-04 >/dev/null 2>&1
OUT34="$(node "$FEATURE" --root "$F34" acceptance a --acceptance "rewritten" 2>&1)"; CODE34=$?
KEPT34="$(node "$SUITE_DIR/lib/jsonget.js" read "$F34/.handyman/feature_list.json" \
  "(d.features.find(f=>f.name==='a')||{}).acceptance.join('|')")"
if [ "$CODE34" -ne 0 ] && [ "$KEPT34" = "original" ]; then
  pass
else
  fail "expected a refusal with the list intact: exit=$CODE34 acceptance=$KEPT34 output: $OUT34"
fi
rm -rf "$F34"

# --- F34b: --force overrides, and says so in history.md ----------------------
# The escape exists, but never silently: the override has to become a fact in
# the durable record, and the feature must NOT be reopened by it.
start_case "acceptance: --force rewrites a done contract and records the override"
F34B="$(mktemp -d)"
write_harness "$F34B"
write_verifier "$F34B/pass.sh" 0
node "$FEATURE" --root "$F34B" acceptance a --acceptance "original" >/dev/null 2>&1
node "$FEATURE" --root "$F34B" start a >/dev/null 2>&1
node "$FEATURE" --root "$F34B" "done" a --verifier "$F34B/pass.sh" --date 2026-02-04 >/dev/null 2>&1
node "$FEATURE" --root "$F34B" acceptance a --acceptance "rewritten" --force \
  --date 2026-02-05 >/dev/null 2>&1
CODE34B=$?
NEW34B="$(node "$SUITE_DIR/lib/jsonget.js" read "$F34B/.handyman/feature_list.json" \
  "(d.features.find(f=>f.name==='a')||{}).acceptance.join('|')")"
ST34B="$(status_of "$F34B/.handyman/feature_list.json" a)"
if [ "$CODE34B" -eq 0 ] && [ "$NEW34B" = "rewritten" ] && [ "$ST34B" = "done" ] \
  && grep -q "acceptance rewritten" "$F34B/.handyman/progress/history.md"; then
  pass
else
  fail "expected a recorded override that does not reopen: exit=$CODE34B acceptance=$NEW34B status=$ST34B"
fi
rm -rf "$F34B"

# --- F34c: a non-done feature needs no flag and writes no override entry -----
# The guard is about closed contracts only: the ordinary path stays silent.
start_case "acceptance: an open feature rewrites without --force and without a history entry"
F34C="$(mktemp -d)"
write_harness "$F34C"
node "$FEATURE" --root "$F34C" acceptance a --acceptance "one" --acceptance "two" >/dev/null 2>&1
CODE34C=$?
N34C="$(node "$SUITE_DIR/lib/jsonget.js" read "$F34C/.handyman/feature_list.json" \
  "(d.features.find(f=>f.name==='a')||{}).acceptance.length")"
if [ "$CODE34C" -eq 0 ] && [ "$N34C" = "2" ] \
  && ! grep -q "acceptance rewritten" "$F34C/.handyman/progress/history.md"; then
  pass
else
  fail "expected a silent rewrite on an open feature: exit=$CODE34C count=$N34C"
fi
rm -rf "$F34C"

# --- F35: start from blocked still works, now through the validated path -----
# blocked -> in_progress is a documented transition (references/workflow.md);
# routing start through saveValidated must not turn it into a refusal.
start_case "start: blocked -> in_progress still works through the validated write path"
F35="$(mktemp -d)"
write_harness "$F35"
node "$FEATURE" --root "$F35" block a --reason "waiting" >/dev/null 2>&1
node "$FEATURE" --root "$F35" start a >/dev/null 2>&1; CODE35=$?
ST35="$(status_of "$F35/.handyman/feature_list.json" a)"
BR35="$(node "$SUITE_DIR/lib/jsonget.js" read "$F35/.handyman/feature_list.json" \
  "String((d.features.find(f=>f.name==='a')||{}).blocked_reason)")"
if [ "$CODE35" -eq 0 ] && [ "$ST35" = "in_progress" ] && [ "$BR35" = "undefined" ]; then
  pass
else
  fail "expected blocked -> in_progress dropping blocked_reason: exit=$CODE35 status=$ST35 reason=$BR35"
fi
rm -rf "$F35"

# --- F36: add stamps the open period ------------------------------------------
# `sprint open` labels only features that exist at open time; features born
# afterwards must be stamped at add, or `close` never archives them (the gap
# that stranded 19 done features in 2026-SP6).
start_case "add: stamps a new feature with the open period from current_sprint"
F36="$(mktemp -d)"
write_harness "$F36"
cat > "$F36/harness.config.json" <<'JSON'
{ "harness_workspace": ".handyman", "current_sprint": "feat-x" }
JSON
node "$FEATURE" --root "$F36" add --name c >/dev/null 2>&1; CODE36=$?
LBL36="$(node "$SUITE_DIR/lib/jsonget.js" read "$F36/.handyman/feature_list.json" \
  "(d.features.find(f=>f.name==='c')||{}).sprint ?? ''")"
if [ "$CODE36" -eq 0 ] && [ "$LBL36" = "feat-x" ]; then
  pass
else
  fail "expected sprint 'feat-x' stamped at add: exit=$CODE36 sprint=$LBL36"
fi
rm -rf "$F36"

# --- F37: add without an open period leaves the feature unlabeled -------------
start_case "add: no open period leaves the feature without a sprint key"
F37="$(mktemp -d)"
write_harness "$F37"
node "$FEATURE" --root "$F37" add --name c >/dev/null 2>&1; CODE37=$?
LBL37="$(node "$SUITE_DIR/lib/jsonget.js" read "$F37/.handyman/feature_list.json" \
  "String('sprint' in (d.features.find(f=>f.name==='c')||{}))")"
if [ "$CODE37" -eq 0 ] && [ "$LBL37" = "false" ]; then
  pass
else
  fail "expected no sprint key without an open period: exit=$CODE37 has_sprint=$LBL37"
fi
rm -rf "$F37"

# --- F38: start adopts the open period when the feature lacks a label ---------
# Covers the feature that existed unlabeled before the period opened; an
# explicit label is never overwritten.
start_case "start: adopts the open period when the feature has no label"
F38="$(mktemp -d)"
write_harness "$F38"
cat > "$F38/harness.config.json" <<'JSON'
{ "harness_workspace": ".handyman", "current_sprint": "feat-y" }
JSON
node "$FEATURE" --root "$F38" start a --no-preflight >/dev/null 2>&1; CODE38=$?
LBL38="$(node "$SUITE_DIR/lib/jsonget.js" read "$F38/.handyman/feature_list.json" \
  "(d.features.find(f=>f.name==='a')||{}).sprint ?? ''")"
if [ "$CODE38" -eq 0 ] && [ "$LBL38" = "feat-y" ]; then
  pass
else
  fail "expected sprint 'feat-y' adopted at start: exit=$CODE38 sprint=$LBL38"
fi
rm -rf "$F38"

# --- F39: session verbs warn when the checked-out branch differs --------------
# The workspace is shared across branches of a checkout: a session opened on
# branch-a must not be mutated silently from branch-b. The advisory mirrors
# the validate_harness NOTE at the moment of mutation and never blocks.
start_case "log/done: warn when the session belongs to another branch, silent when it matches"
F39="$(mktemp -d)"
write_harness "$F39"
write_verifier "$F39/pass.sh" 0
git -C "$F39" init -q -b branch-a 2>/dev/null || {
  git -C "$F39" init -q && git -C "$F39" checkout -q -b branch-a
}
node "$FEATURE" --root "$F39" start a --no-preflight >/dev/null 2>&1
git -C "$F39" checkout -q -b branch-b
LOG_OUT="$(node "$FEATURE" --root "$F39" log "line from branch-b" 2>&1)"; LOG_CODE=$?
DONE_OUT="$(node "$FEATURE" --root "$F39" "done" a --verifier "$F39/pass.sh" 2>&1)"; DONE_CODE=$?
# after the close resets the session, a fresh start+log on branch-b must NOT warn
node "$FEATURE" --root "$F39" start b --no-preflight >/dev/null 2>&1
SAME_OUT="$(node "$FEATURE" --root "$F39" log "same branch" 2>&1)"
if [ "$LOG_CODE" -eq 0 ] && [ "$DONE_CODE" -eq 0 ] \
  && printf '%s' "$LOG_OUT" | grep -q "WARN: session belongs to branch 'branch-a' but 'branch-b' is checked out" \
  && printf '%s' "$DONE_OUT" | grep -q "WARN: session belongs to branch 'branch-a' but 'branch-b' is checked out" \
  && ! printf '%s' "$SAME_OUT" | grep -q "WARN: session belongs"; then
  pass
else
  fail "log=[$LOG_OUT] done=[$DONE_OUT] same-branch=[$SAME_OUT]"
fi
rm -rf "$F39"

summary