#!/usr/bin/env bash
# toolBox observation tests for the Handyman skill (port of test_fleet.sh).
# Exercises dist/toolbox.js: the machine-global registry
# ($HANDYMAN_ROOT/registry.json), discovery, the aggregated read-only status
# report, derived health signals (INVARIANT / STALE_WIP / BEHIND / IDLE /
# UNREADABLE), heartbeat/timeline and the global toolBox MOC. Every case runs
# under a temporary HANDYMAN_ROOT so the real $HOME/HANDYMAN is never touched.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
TOOLBOX="$SUITE_DIR/../handyman/dist/toolbox.js"
SCHEMA="$SUITE_DIR/../handyman/assets/schemas/registry.schema.json"
SKILL_V="$(sed -n 's/^[[:space:]]\{1,\}version:[[:space:]]*//p' "$SUITE_DIR/../handyman/SKILL.md" | head -1)"

echo "toolBox suite (test_toolbox.sh)"

# --- fixture builder ---------------------------------------------------------
# write_harness ROOT NAME VERSION -- a minimal readable harness. VERSION may be
# "" to leave the harness unsealed. Statuses: 1 done + 1 pending; one dated
# closure (2026-06-01); idle current.md.
write_harness() {
  root="$1"; name="$2"; version="$3"
  ws="$root/.handyman"
  mkdir -p "$ws/progress" "$ws/backlog"
  if [ -n "$version" ]; then
    printf '{"install_mode":"local","project_name":"%s","project_root":".","harness_workspace":".handyman","harness_version":"%s"}\n' \
      "$name" "$version" > "$root/harness.config.json"
  else
    printf '{"install_mode":"local","project_name":"%s","project_root":".","harness_workspace":".handyman"}\n' \
      "$name" > "$root/harness.config.json"
  fi
  printf '{"project":"%s","features":[
    {"id":1,"name":"alpha","title":"alpha","status":"done"},
    {"id":2,"name":"beta","title":"beta","status":"pending"}
  ]}\n' "$name" > "$ws/feature_list.json"
  printf -- '---\nfeature: none\nstatus: idle\nrole: leader\nupdated: 2026-06-01\ntags: [handyman/session/current]\n---\n# Current\n' \
    > "$ws/progress/current.md"
  cat > "$ws/progress/history.md" <<'EOF'
---
tags: [handyman/history]
---
# History

## 2026-06-01 - Feature 1: alpha
- **Closure:** done
EOF
}

# mark_working ROOT FEATURE UPDATED -- flip the fixture to 1 in_progress with a
# live session stamped UPDATED.
mark_working() {
  root="$1"; feature="$2"; updated="$3"
  ws="$root/.handyman"
  printf '{"project":"fx","features":[
    {"id":1,"name":"alpha","title":"alpha","status":"done"},
    {"id":2,"name":"%s","title":"%s","status":"in_progress"}
  ]}\n' "$feature" "$feature" > "$ws/feature_list.json"
  printf -- '---\nfeature: %s\nstatus: in_progress\nrole: implementer\nupdated: %s\ntags: [handyman/session/current]\n---\n# Current\n' \
    "$feature" "$updated" > "$ws/progress/current.md"
}

# --- TB1: register creates the registry and list shows the entry -------------
start_case "register creates registry.json and list shows the harness"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
OUT1="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" --date 2026-07-01 2>&1)"; C1=$?
OUT2="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" list 2>&1)"; C2=$?
if [ "$C1" -eq 0 ] && [ "$C2" -eq 0 ] && [ -f "$FR/registry.json" ] \
  && printf '%s' "$OUT2" | grep -q "proj1" \
  && printf '%s' "$OUT2" | grep -q "registered 2026-07-01"; then
  pass
else
  fail "c1=$C1 c2=$C2 out1=$OUT1 out2=$OUT2"
fi
rm -rf "$T"

# --- TB2: re-register is idempotent ------------------------------------------
start_case "re-registering the same root keeps a single entry"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" --date 2026-07-01 >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" --date 2026-07-01 2>&1)"; CODE=$?
N="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$FR/registry.json','utf-8')).harnesses.length)")"
if [ "$CODE" -eq 0 ] && [ "$N" = "1" ] && printf '%s' "$OUT" | grep -q "already registered"; then
  pass
else
  fail "exit=$CODE entries=$N out=$OUT"
fi
rm -rf "$T"

# --- TB3: registering a non-harness fails ------------------------------------
start_case "register refuses a root with no resolvable feature_list.json"
T="$(mktemp -d)"; FR="$T/toolboxroot"; mkdir -p "$T/empty"
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$T/empty" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "not a harness"; then
  pass
else
  fail "expected refusal; exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- TB4: unregister removes; unknown root fails ------------------------------
start_case "unregister removes the entry; unregistering twice fails"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
OUT1="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" unregister "$H1" 2>&1)"; C1=$?
OUT2="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" unregister "$H1" 2>&1)"; C2=$?
N="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$FR/registry.json','utf-8')).harnesses.length)")"
if [ "$C1" -eq 0 ] && [ "$C2" -ne 0 ] && [ "$N" = "0" ]; then
  pass
else
  fail "c1=$C1 c2=$C2 entries=$N out1=$OUT1 out2=$OUT2"
fi
rm -rf "$T"

# --- TB5: the written registry validates against its schema -------------------
start_case "registry.json validates against registry.schema.json"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" --date 2026-07-01 >/dev/null 2>&1
RESULT="$(node -e "
const { readFileSync } = require('fs');
const Ajv = require('$SUITE_DIR/../handyman/node_modules/ajv');
const ajv = new Ajv({ strict: false });
const schema = JSON.parse(readFileSync('$SCHEMA', 'utf-8'));
const data = JSON.parse(readFileSync('$FR/registry.json', 'utf-8'));
console.log(ajv.validate(schema, data) ? 'ok' : JSON.stringify(ajv.errors));
" 2>&1)"
if [ "$RESULT" = "ok" ]; then
  pass
else
  fail "schema validation failed: $RESULT"
fi
rm -rf "$T"

# --- TB6: list --json is parseable --------------------------------------------
start_case "list --json emits parseable JSON with project_name"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" list --json 2>&1)"; CODE=$?
OK="$(printf '%s' "$OUT" | node -e "
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  const d = JSON.parse(raw);
  console.log(d.harnesses[0].project_name === 'proj1' ? 'yes' : 'no');
});
" 2>/dev/null)"
if [ "$CODE" -eq 0 ] && [ "$OK" = "yes" ]; then
  pass
else
  fail "exit=$CODE ok=$OK out=$OUT"
fi
rm -rf "$T"

# --- TB7: discover finds harnesses; --register adds them ----------------------
start_case "discover --scan finds nested harnesses and --register adds them"
T="$(mktemp -d)"; FR="$T/toolboxroot"
mkdir -p "$T/tree/a/proj1" "$T/tree/b/proj2" "$T/tree/node_modules/fake"
write_harness "$T/tree/a/proj1" "proj1" "1.0.0"
write_harness "$T/tree/b/proj2" "proj2" "1.0.0"
write_harness "$T/tree/node_modules/fake" "fake" "1.0.0"
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" discover --scan "$T/tree" --register --date 2026-07-01 2>&1)"; CODE=$?
N="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$FR/registry.json','utf-8')).harnesses.length)")"
if [ "$CODE" -eq 0 ] && [ "$N" = "2" ] \
  && printf '%s' "$OUT" | grep -q "proj1" \
  && printf '%s' "$OUT" | grep -q "proj2" \
  && ! printf '%s' "$OUT" | grep -q "fake"; then
  pass
else
  fail "exit=$CODE entries=$N out=$OUT"
fi
rm -rf "$T"

# --- TB8: status composes metrics + session + version + last closure ---------
start_case "status reports counts, live session, version drift and last closure"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
mark_working "$H1" "gamma" "2026-07-01"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" status 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "version: 1.0.0 (behind $SKILL_V)" \
  && printf '%s' "$OUT" | grep -q "pending=0 in_progress=1 done=1 blocked=0 (total 2)" \
  && printf '%s' "$OUT" | grep -q "session: gamma (role implementer, updated 2026-07-01)" \
  && printf '%s' "$OUT" | grep -q "last closure: 2026-06-01"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- TB9: a dead registered root degrades, status still exits 0 ---------------
start_case "status degrades a deleted root to ERROR and exits 0"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; H2="$T/gone"; mkdir -p "$H1" "$H2"
write_harness "$H1" "proj1" "1.0.0"
write_harness "$H2" "gone" "1.0.0"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H2" >/dev/null 2>&1
rm -rf "$H2"
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" status 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "ERROR: root is not a directory" \
  && printf '%s' "$OUT" | grep -q "unreadable=1"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- TB10: status --json carries per-harness and toolBox aggregate keys -------
start_case "status --json emits harnesses[] plus a fleet aggregate"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" status --json 2>&1)"; CODE=$?
OK="$(printf '%s' "$OUT" | node -e "
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  const d = JSON.parse(raw);
  const h = d.harnesses[0];
  const keys = ['status_counts', 'session', 'version', 'last_closure', 'review_verdicts', 'coverage'];
  const ok = keys.every((k) => k in h) && d.fleet.harnesses === 1 &&
    h.version.installed === '1.0.0' && h.version.behind === true;
  console.log(ok ? 'yes' : 'no');
});
" 2>/dev/null)"
if [ "$CODE" -eq 0 ] && [ "$OK" = "yes" ]; then
  pass
else
  fail "exit=$CODE ok=$OK out=$OUT"
fi
rm -rf "$T"

# --- TB11: health INVARIANT on >1 in_progress ---------------------------------
start_case "health flags INVARIANT when two features are in_progress"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "$SKILL_V"
printf '{"project":"fx","features":[
  {"id":1,"name":"a","title":"a","status":"in_progress"},
  {"id":2,"name":"b","title":"b","status":"in_progress"}
]}\n' > "$H1/.handyman/feature_list.json"
printf -- '---\nfeature: a\nstatus: in_progress\nrole: implementer\nupdated: 2026-07-01\ntags: [x]\n---\n' \
  > "$H1/.handyman/progress/current.md"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" health --today 2026-07-02 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "INVARIANT: 2 features in_progress"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- TB12: health STALE_WIP honors --today and --stale-days -------------------
start_case "health flags STALE_WIP only past the stale-days window"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "$SKILL_V"
mark_working "$H1" "gamma" "2026-06-01"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
OUT1="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" health --today 2026-07-01 2>&1)"
OUT2="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" health --today 2026-06-03 2>&1)"
if printf '%s' "$OUT1" | grep -q "STALE_WIP: in_progress updated 2026-06-01" \
  && ! printf '%s' "$OUT2" | grep -q "STALE_WIP"; then
  pass
else
  fail "out1=$OUT1 out2=$OUT2"
fi
rm -rf "$T"

# --- TB13: health BEHIND (unsealed) and IDLE ----------------------------------
start_case "health flags BEHIND on an unsealed harness and IDLE on an old queue"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" ""
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" health --today 2026-07-01 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "BEHIND: installed unsealed < skill $SKILL_V" \
  && printf '%s' "$OUT" | grep -q "IDLE: 1 pending, last closure 2026-06-01"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- TB14: health --strict gates; healthy toolBox stays 0 ----------------------
start_case "health --strict exits 1 with signals and 0 on a healthy fleet"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" ""
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" node "$TOOLBOX" health --today 2026-07-01 --strict >/dev/null 2>&1; C1=$?
T2="$(mktemp -d)"; FR2="$T2/toolboxroot"; H2="$T2/proj2"; mkdir -p "$H2"
write_harness "$H2" "proj2" "$SKILL_V"
HANDYMAN_ROOT="$FR2" node "$TOOLBOX" register "$H2" >/dev/null 2>&1
OUT2="$(HANDYMAN_ROOT="$FR2" node "$TOOLBOX" health --today 2026-06-03 --strict 2>&1)"; C2=$?
if [ "$C1" -eq 1 ] && [ "$C2" -eq 0 ] && printf '%s' "$OUT2" | grep -q "OK (no signals)"; then
  pass
else
  fail "strict-with-signals=$C1 strict-healthy=$C2 out2=$OUT2"
fi
rm -rf "$T" "$T2"

# --- TB15: moc writes the toolBox MOC and preserves ## Notes -------------------
start_case "moc regenerates index.md with toolBox sections and preserves Notes"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" node "$TOOLBOX" moc >/dev/null 2>&1; C1=$?
printf '\n- operator note kept\n' >> "$FR/index.md"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" moc >/dev/null 2>&1; C2=$?
CONTENT="$(cat "$FR/index.md")"
if [ "$C1" -eq 0 ] && [ "$C2" -eq 0 ] \
  && printf '%s' "$CONTENT" | grep -q "tags: \[handyman/toolbox\]" \
  && printf '%s' "$CONTENT" | grep -q "### proj1" \
  && printf '%s' "$CONTENT" | grep -q "operator note kept" \
  && printf '%s' "$CONTENT" | grep -q "last closure: 2026-06-01"; then
  pass
else
  fail "c1=$C1 c2=$C2 content=$CONTENT"
fi
rm -rf "$T"

# --- TB16: empty registry degrades everywhere ----------------------------------
start_case "empty registry: list/status/health/moc all exit 0"
T="$(mktemp -d)"; FR="$T/toolboxroot"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" list >/dev/null 2>&1; C1=$?
HANDYMAN_ROOT="$FR" node "$TOOLBOX" status >/dev/null 2>&1; C2=$?
HANDYMAN_ROOT="$FR" node "$TOOLBOX" health >/dev/null 2>&1; C3=$?
HANDYMAN_ROOT="$FR" node "$TOOLBOX" moc >/dev/null 2>&1; C4=$?
if [ "$C1" -eq 0 ] && [ "$C2" -eq 0 ] && [ "$C3" -eq 0 ] && [ "$C4" -eq 0 ] \
  && grep -q "no harnesses registered" "$FR/index.md"; then
  pass
else
  fail "list=$C1 status=$C2 health=$C3 moc=$C4"
fi
rm -rf "$T"

# --- TB17: timeline merges closures across harnesses, newest first ------------
start_case "timeline merges dated closures from two harnesses in desc order"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; H2="$T/proj2"; mkdir -p "$H1" "$H2"
write_harness "$H1" "proj1" "1.0.0"
write_harness "$H2" "proj2" "1.0.0"
cat > "$H2/.handyman/progress/history.md" <<'EOF'
---
tags: [handyman/history]
---
# History

## 2026-06-15 - Feature 7: newer_thing
- **Closure:** done
EOF
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H2" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" timeline 2>&1)"; CODE=$?
FIRST="$(printf '%s\n' "$OUT" | sed -n '2p')"
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "2 closure(s) across 2 readable" \
  && printf '%s' "$FIRST" | grep -q "2026-06-15  proj2" \
  && printf '%s' "$OUT" | grep -q "2026-06-01  proj1" \
  && printf '%s' "$OUT" | grep -q "newer_thing (feature 7)"; then
  pass
else
  fail "exit=$CODE first=$FIRST out=$OUT"
fi
rm -rf "$T"

# --- TB18: timeline --limit and --json ----------------------------------------
start_case "timeline --limit 1 --json returns only the newest entry"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; H2="$T/proj2"; mkdir -p "$H1" "$H2"
write_harness "$H1" "proj1" "1.0.0"
write_harness "$H2" "proj2" "1.0.0"
cat > "$H2/.handyman/progress/history.md" <<'EOF'
---
tags: [handyman/history]
---
# History

## 2026-06-15 - Feature 7: newer_thing
- **Closure:** done
EOF
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H2" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" timeline --limit 1 --json 2>&1)"; CODE=$?
OK="$(printf '%s' "$OUT" | node -e "
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  const d = JSON.parse(raw);
  const ok = d.total === 2 && d.entries.length === 1 &&
    d.entries[0].feature === 'newer_thing' && d.entries[0].source === 'history';
  console.log(ok ? 'yes' : 'no');
});
" 2>/dev/null)"
if [ "$CODE" -eq 0 ] && [ "$OK" = "yes" ]; then
  pass
else
  fail "exit=$CODE ok=$OK out=$OUT"
fi
rm -rf "$T"

# --- TB19: heartbeat appends events (explicit and derived from history) -------
start_case "heartbeat writes events.jsonl; without --feature derives newest closure"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
OUT1="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" heartbeat --root "$H1" --feature custom_evt --date 2026-07-01 2>&1)"; C1=$?
OUT2="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" heartbeat --root "$H1" 2>&1)"; C2=$?
OK="$(node -e "
const lines = require('fs').readFileSync('$FR/events.jsonl', 'utf-8')
  .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const ok = lines.length === 2 &&
  lines[0].feature === 'custom_evt' && lines[0].date === '2026-07-01' &&
  lines[1].feature === 'alpha' && lines[1].date === '2026-06-01' &&
  lines[1].project_name === 'proj1';
console.log(ok ? 'yes' : 'no');
" 2>/dev/null)"
if [ "$C1" -eq 0 ] && [ "$C2" -eq 0 ] && [ "$OK" = "yes" ]; then
  pass
else
  fail "c1=$C1 c2=$C2 ok=$OK out1=$OUT1 out2=$OUT2"
fi
rm -rf "$T"

# --- TB20: timeline merges events, history wins on collisions ------------------
start_case "timeline dedups event/history collisions and shows event-only entries"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
# Collision: same closure as history (alpha 2026-06-01). Event-only: hotfix.
HANDYMAN_ROOT="$FR" node "$TOOLBOX" heartbeat --root "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" node "$TOOLBOX" heartbeat --root "$H1" --feature hotfix --date 2026-06-20 >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" timeline 2>&1)"; CODE=$?
ALPHAS="$(printf '%s\n' "$OUT" | grep -c "alpha")"
if [ "$CODE" -eq 0 ] && [ "$ALPHAS" = "1" ] \
  && printf '%s' "$OUT" | grep -q "hotfix (heartbeat)" \
  && printf '%s' "$OUT" | grep -q "2 closure(s)"; then
  pass
else
  fail "exit=$CODE alphas=$ALPHAS out=$OUT"
fi
rm -rf "$T"

# --- TB21: --run-verifier reports green/red/skipped; default stays silent -----
start_case "status --run-verifier reports green/red/skipped per harness"
T="$(mktemp -d)"; FR="$T/toolboxroot"
G="$T/green"; R="$T/red"; S="$T/skip"; mkdir -p "$G" "$R" "$S"
write_harness "$G" "green" "1.0.0"
write_harness "$R" "red" "1.0.0"
write_harness "$S" "skip" "1.0.0"
printf '#!/bin/sh\nexit 0\n' > "$G/init.sh"; chmod +x "$G/init.sh"
printf '#!/bin/sh\nexit 3\n' > "$R/init.sh"; chmod +x "$R/init.sh"
for H in "$G" "$R" "$S"; do
  HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H" >/dev/null 2>&1
done
OUT0="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" status 2>&1)"
OUT1="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" status --run-verifier 2>&1)"; C1=$?
if [ "$C1" -eq 0 ] \
  && ! printf '%s' "$OUT0" | grep -q "verifier:" \
  && printf '%s' "$OUT1" | grep -q "verifier: green (exit 0)" \
  && printf '%s' "$OUT1" | grep -q "verifier: red (exit 3)" \
  && printf '%s' "$OUT1" | grep -q "verifier: skipped"; then
  pass
else
  fail "c1=$C1 out0-has-verifier?=$(printf '%s' "$OUT0" | grep -c 'verifier:') out1=$OUT1"
fi
rm -rf "$T"

# --- TB22: a hanging verifier is reported as timeout, exit stays 0 -------------
start_case "status --run-verifier reports timeout past --verifier-timeout"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/slow"; mkdir -p "$H1"
write_harness "$H1" "slow" "1.0.0"
printf '#!/bin/sh\nsleep 5\n' > "$H1/init.sh"; chmod +x "$H1/init.sh"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" node "$TOOLBOX" status --run-verifier --verifier-timeout 1 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "verifier: timeout"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- TB23: moc --html writes a self-contained page; default writes none -------
start_case "moc --html emits index.html with toolBox rows and no external assets"
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" node "$TOOLBOX" moc >/dev/null 2>&1
NOHTML="no"; [ ! -f "$FR/index.html" ] && NOHTML="yes"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" moc --html >/dev/null 2>&1; CODE=$?
CONTENT="$(cat "$FR/index.html" 2>/dev/null)"
# Self-contained means no external fetches: no URLs, no scripts, and any
# <link> must be a data: URI (the shared favicon), never a remote asset.
LINKBAD="$(printf '%s' "$CONTENT" | grep '<link' | grep -v 'href="data:image/')"
if [ "$CODE" -eq 0 ] && [ "$NOHTML" = "yes" ] \
  && printf '%s' "$CONTENT" | grep -q "<!DOCTYPE html>" \
  && printf '%s' "$CONTENT" | grep -q "proj1" \
  && printf '%s' "$CONTENT" | grep -q ">BEHIND<" \
  && ! printf '%s' "$CONTENT" | grep -qE "https?://|<script" \
  && [ -z "$LINKBAD" ]; then
  pass
else
  fail "exit=$CODE nohtml=$NOHTML content=$(printf '%s' "$CONTENT" | head -5)"
fi
rm -rf "$T"

# --- source hygiene: no raw NUL bytes in TypeScript sources ------------------
# handyman/src/toolbox.ts used to embed 4 RAW NUL bytes as a dedup-key
# separator. grep classifies such a file as binary and SKIPS IT SILENTLY, so
# every suite that greps it was failing open - passing because it matched
# nothing, not because the code was right. The escape `\0` builds the identical
# runtime string (verified: same charCode) while keeping the file greppable.
# This guard exists so the class cannot come back unnoticed.
start_case "no TypeScript source embeds a raw NUL byte (keeps files greppable)"
# Detection: strip NULs and compare. A shell string cannot HOLD a NUL, so
# grepping for one is not portable ($'\x00' collapses to an empty pattern and
# matches every file); tr/cmp sidesteps that entirely.
NULFILES=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if ! tr -d '\000' < "$f" | cmp -s - "$f"; then
    NULFILES="$NULFILES $f"
  fi
done <<EOF
$(find "$SUITE_DIR/../handyman/src" "$SUITE_DIR/../packages/toolbox-core/src" \
  -name '*.ts' -o -name '*.tsx' 2>/dev/null)
EOF
if [ -z "$NULFILES" ]; then
  pass
else
  fail "raw NUL bytes (grep will skip these files silently):$NULFILES"
fi

summary
