#!/usr/bin/env bash
# Fleet observation tests for the Handyman skill.
# Exercises scripts/fleet.py: the machine-global registry
# ($HANDYMAN_ROOT/registry.json), discovery, the aggregated read-only status
# report, derived health signals (INVARIANT / STALE_WIP / BEHIND / IDLE /
# UNREADABLE) and the global fleet MOC. Every case runs under a temporary
# HANDYMAN_ROOT so the real $HOME/HANDYMAN is never touched.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
FLEET="$SUITE_DIR/../handyman/scripts/fleet.py"
SCHEMA="$SUITE_DIR/../handyman/assets/schemas/registry.schema.json"
SKILL_V="$(python3 -c "
import sys
sys.path.insert(0, '$SUITE_DIR/../handyman/scripts')
from upgrade_harness import current_skill_version
print(current_skill_version())
")"

echo "Fleet suite (test_fleet.sh)"

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

# --- FL1: register creates the registry and list shows the entry -------------
start_case "register creates registry.json and list shows the harness"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
OUT1="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" --date 2026-07-01 2>&1)"; C1=$?
OUT2="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" list 2>&1)"; C2=$?
if [ "$C1" -eq 0 ] && [ "$C2" -eq 0 ] && [ -f "$FR/registry.json" ] \
  && printf '%s' "$OUT2" | grep -q "proj1" \
  && printf '%s' "$OUT2" | grep -q "registered 2026-07-01"; then
  pass
else
  fail "c1=$C1 c2=$C2 out1=$OUT1 out2=$OUT2"
fi
rm -rf "$T"

# --- FL2: re-register is idempotent ------------------------------------------
start_case "re-registering the same root keeps a single entry"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" --date 2026-07-01 >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" --date 2026-07-01 2>&1)"; CODE=$?
N="$(python3 -c "import json;print(len(json.load(open('$FR/registry.json'))['harnesses']))")"
if [ "$CODE" -eq 0 ] && [ "$N" = "1" ] && printf '%s' "$OUT" | grep -q "already registered"; then
  pass
else
  fail "exit=$CODE entries=$N out=$OUT"
fi
rm -rf "$T"

# --- FL3: registering a non-harness fails ------------------------------------
start_case "register refuses a root with no resolvable feature_list.json"
T="$(mktemp -d)"; FR="$T/fleetroot"; mkdir -p "$T/empty"
OUT="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$T/empty" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "not a harness"; then
  pass
else
  fail "expected refusal; exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- FL4: unregister removes; unknown root fails ------------------------------
start_case "unregister removes the entry; unregistering twice fails"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
OUT1="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" unregister "$H1" 2>&1)"; C1=$?
OUT2="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" unregister "$H1" 2>&1)"; C2=$?
N="$(python3 -c "import json;print(len(json.load(open('$FR/registry.json'))['harnesses']))")"
if [ "$C1" -eq 0 ] && [ "$C2" -ne 0 ] && [ "$N" = "0" ]; then
  pass
else
  fail "c1=$C1 c2=$C2 entries=$N out1=$OUT1 out2=$OUT2"
fi
rm -rf "$T"

# --- FL5: the written registry validates against its schema -------------------
start_case "registry.json validates against registry.schema.json"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" --date 2026-07-01 >/dev/null 2>&1
RESULT="$(python3 -c "
import json, sys
try:
    import jsonschema
except ImportError:
    print('skip'); sys.exit(0)
schema = json.load(open('$SCHEMA'))
data = json.load(open('$FR/registry.json'))
jsonschema.validate(data, schema)
print('ok')
" 2>&1)"
if [ "$RESULT" = "ok" ]; then
  pass
elif [ "$RESULT" = "skip" ]; then
  echo "       NOTE: jsonschema not installed; schema validation skipped"
  pass
else
  fail "schema validation failed: $RESULT"
fi
rm -rf "$T"

# --- FL6: list --json is parseable --------------------------------------------
start_case "list --json emits parseable JSON with project_name"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" list --json 2>&1)"; CODE=$?
OK="$(printf '%s' "$OUT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('yes' if d['harnesses'][0]['project_name'] == 'proj1' else 'no')
" 2>/dev/null)"
if [ "$CODE" -eq 0 ] && [ "$OK" = "yes" ]; then
  pass
else
  fail "exit=$CODE ok=$OK out=$OUT"
fi
rm -rf "$T"

# --- FL7: discover finds harnesses; --register adds them ----------------------
start_case "discover --scan finds nested harnesses and --register adds them"
T="$(mktemp -d)"; FR="$T/fleetroot"
mkdir -p "$T/tree/a/proj1" "$T/tree/b/proj2" "$T/tree/node_modules/fake"
write_harness "$T/tree/a/proj1" "proj1" "1.0.0"
write_harness "$T/tree/b/proj2" "proj2" "1.0.0"
write_harness "$T/tree/node_modules/fake" "fake" "1.0.0"
OUT="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" discover --scan "$T/tree" --register --date 2026-07-01 2>&1)"; CODE=$?
N="$(python3 -c "import json;print(len(json.load(open('$FR/registry.json'))['harnesses']))")"
if [ "$CODE" -eq 0 ] && [ "$N" = "2" ] \
  && printf '%s' "$OUT" | grep -q "proj1" \
  && printf '%s' "$OUT" | grep -q "proj2" \
  && ! printf '%s' "$OUT" | grep -q "fake"; then
  pass
else
  fail "exit=$CODE entries=$N out=$OUT"
fi
rm -rf "$T"

# --- FL8: status composes metrics + session + version + last closure ---------
start_case "status reports counts, live session, version drift and last closure"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
mark_working "$H1" "gamma" "2026-07-01"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" status 2>&1)"; CODE=$?
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

# --- FL9: a dead registered root degrades, status still exits 0 ---------------
start_case "status degrades a deleted root to ERROR and exits 0"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; H2="$T/gone"; mkdir -p "$H1" "$H2"
write_harness "$H1" "proj1" "1.0.0"
write_harness "$H2" "gone" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H2" >/dev/null 2>&1
rm -rf "$H2"
OUT="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" status 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "ERROR: root is not a directory" \
  && printf '%s' "$OUT" | grep -q "unreadable=1"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- FL10: status --json carries per-harness and fleet aggregate keys ---------
start_case "status --json emits harnesses[] plus a fleet aggregate"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" status --json 2>&1)"; CODE=$?
OK="$(printf '%s' "$OUT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
h = d['harnesses'][0]
keys = {'status_counts', 'session', 'version', 'last_closure', 'review_verdicts', 'coverage'}
ok = keys.issubset(h) and d['fleet']['harnesses'] == 1 \
  and h['version']['installed'] == '1.0.0' and h['version']['behind'] is True
print('yes' if ok else 'no')
" 2>/dev/null)"
if [ "$CODE" -eq 0 ] && [ "$OK" = "yes" ]; then
  pass
else
  fail "exit=$CODE ok=$OK out=$OUT"
fi
rm -rf "$T"

# --- FL11: health INVARIANT on >1 in_progress ---------------------------------
start_case "health flags INVARIANT when two features are in_progress"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "$SKILL_V"
printf '{"project":"fx","features":[
  {"id":1,"name":"a","title":"a","status":"in_progress"},
  {"id":2,"name":"b","title":"b","status":"in_progress"}
]}\n' > "$H1/.handyman/feature_list.json"
printf -- '---\nfeature: a\nstatus: in_progress\nrole: implementer\nupdated: 2026-07-01\ntags: [x]\n---\n' \
  > "$H1/.handyman/progress/current.md"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" health --today 2026-07-02 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "INVARIANT: 2 features in_progress"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- FL12: health STALE_WIP honors --today and --stale-days -------------------
start_case "health flags STALE_WIP only past the stale-days window"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "$SKILL_V"
mark_working "$H1" "gamma" "2026-06-01"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
OUT1="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" health --today 2026-07-01 2>&1)"
OUT2="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" health --today 2026-06-03 2>&1)"
if printf '%s' "$OUT1" | grep -q "STALE_WIP: in_progress updated 2026-06-01" \
  && ! printf '%s' "$OUT2" | grep -q "STALE_WIP"; then
  pass
else
  fail "out1=$OUT1 out2=$OUT2"
fi
rm -rf "$T"

# --- FL13: health BEHIND (unsealed) and IDLE ----------------------------------
start_case "health flags BEHIND on an unsealed harness and IDLE on an old queue"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" ""
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
OUT="$(HANDYMAN_ROOT="$FR" python3 "$FLEET" health --today 2026-07-01 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "BEHIND: installed unsealed < skill $SKILL_V" \
  && printf '%s' "$OUT" | grep -q "IDLE: 1 pending, last closure 2026-06-01"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- FL14: health --strict gates; healthy fleet stays 0 ------------------------
start_case "health --strict exits 1 with signals and 0 on a healthy fleet"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" ""
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" python3 "$FLEET" health --today 2026-07-01 --strict >/dev/null 2>&1; C1=$?
T2="$(mktemp -d)"; FR2="$T2/fleetroot"; H2="$T2/proj2"; mkdir -p "$H2"
write_harness "$H2" "proj2" "$SKILL_V"
HANDYMAN_ROOT="$FR2" python3 "$FLEET" register "$H2" >/dev/null 2>&1
OUT2="$(HANDYMAN_ROOT="$FR2" python3 "$FLEET" health --today 2026-06-03 --strict 2>&1)"; C2=$?
if [ "$C1" -eq 1 ] && [ "$C2" -eq 0 ] && printf '%s' "$OUT2" | grep -q "OK (no signals)"; then
  pass
else
  fail "strict-with-signals=$C1 strict-healthy=$C2 out2=$OUT2"
fi
rm -rf "$T" "$T2"

# --- FL15: moc writes the fleet MOC and preserves ## Notes ---------------------
start_case "moc regenerates index.md with fleet sections and preserves Notes"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" python3 "$FLEET" moc >/dev/null 2>&1; C1=$?
printf '\n- operator note kept\n' >> "$FR/index.md"
HANDYMAN_ROOT="$FR" python3 "$FLEET" moc >/dev/null 2>&1; C2=$?
CONTENT="$(cat "$FR/index.md")"
if [ "$C1" -eq 0 ] && [ "$C2" -eq 0 ] \
  && printf '%s' "$CONTENT" | grep -q "tags: \[handyman/fleet\]" \
  && printf '%s' "$CONTENT" | grep -q "### proj1" \
  && printf '%s' "$CONTENT" | grep -q "operator note kept" \
  && printf '%s' "$CONTENT" | grep -q "last closure: 2026-06-01"; then
  pass
else
  fail "c1=$C1 c2=$C2 content=$CONTENT"
fi
rm -rf "$T"

# --- FL16: empty registry degrades everywhere ----------------------------------
start_case "empty registry: list/status/health/moc all exit 0"
T="$(mktemp -d)"; FR="$T/fleetroot"
HANDYMAN_ROOT="$FR" python3 "$FLEET" list >/dev/null 2>&1; C1=$?
HANDYMAN_ROOT="$FR" python3 "$FLEET" status >/dev/null 2>&1; C2=$?
HANDYMAN_ROOT="$FR" python3 "$FLEET" health >/dev/null 2>&1; C3=$?
HANDYMAN_ROOT="$FR" python3 "$FLEET" moc >/dev/null 2>&1; C4=$?
if [ "$C1" -eq 0 ] && [ "$C2" -eq 0 ] && [ "$C3" -eq 0 ] && [ "$C4" -eq 0 ] \
  && grep -q "no harnesses registered" "$FR/index.md"; then
  pass
else
  fail "list=$C1 status=$C2 health=$C3 moc=$C4"
fi
rm -rf "$T"

summary
