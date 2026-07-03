#!/usr/bin/env bash
# Workstation panel tests for the Handyman skill.
# Exercises scripts/workstation.py: the localhost-only live server, the
# /api/state document, and (in later features) the intake and verifier
# endpoints. Every case boots its own server on an ephemeral port (--port 0)
# under a temporary HANDYMAN_ROOT, so the real $HOME/HANDYMAN, real harnesses
# and fixed ports are never touched.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
WORKSTATION="$SUITE_DIR/../handyman/scripts/workstation.py"
FLEET="$SUITE_DIR/../handyman/scripts/fleet.py"

echo "Workstation suite (test_workstation.sh)"

# --- fixture builder (mirror of test_fleet.sh) --------------------------------
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

# --- server lifecycle helpers --------------------------------------------------
# start_server FLEETROOT -> sets SRV_PID, SRV_LOG, PORT, TOKEN, BASE
start_server() {
  hroot="$1"
  SRV_LOG="$(mktemp)"
  HANDYMAN_ROOT="$hroot" python3 "$WORKSTATION" serve --port 0 >"$SRV_LOG" 2>&1 &
  SRV_PID=$!
  i=0
  while [ $i -lt 50 ]; do
    if grep -q "serving on" "$SRV_LOG" 2>/dev/null; then break; fi
    i=$((i + 1)); sleep 0.1
  done
  PORT="$(sed -n 's|.*http://127\.0\.0\.1:\([0-9]*\).*|\1|p' "$SRV_LOG" | head -1)"
  TOKEN="$(sed -n 's/^workstation: token //p' "$SRV_LOG" | head -1)"
  BASE="http://127.0.0.1:$PORT"
}

stop_server() {
  kill "$SRV_PID" 2>/dev/null
  wait "$SRV_PID" 2>/dev/null
  rm -f "$SRV_LOG"
}

# http METHOD PATH [JSON_BODY [TOKEN_HEADER]] -> sets HTTP_CODE, HTTP_BODY
http() {
  method="$1"; path="$2"; body="${3:-}"; tok="${4:-}"
  out="$(mktemp)"
  if [ -n "$body" ]; then
    HTTP_CODE="$(curl -s --max-time 5 -o "$out" -w '%{http_code}' \
      -X "$method" -H "Content-Type: application/json" \
      ${tok:+-H "X-Workstation-Token: $tok"} \
      --data "$body" "$BASE$path")"
  else
    HTTP_CODE="$(curl -s --max-time 5 -o "$out" -w '%{http_code}' \
      -X "$method" ${tok:+-H "X-Workstation-Token: $tok"} "$BASE$path")"
  fi
  HTTP_BODY="$(cat "$out")"; rm -f "$out"
}

# --- W1: serve prints URL+token and GET / returns the panel --------------------
start_case "serve binds 127.0.0.1 on an ephemeral port and serves the panel"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http GET /
if [ -n "$PORT" ] && [ -n "$TOKEN" ] && [ "$HTTP_CODE" = "200" ] \
  && printf '%s' "$HTTP_BODY" | grep -q "Handyman Workstation" \
  && printf '%s' "$HTTP_BODY" | grep -q "$TOKEN"; then
  pass
else
  fail "port=$PORT token=$TOKEN code=$HTTP_CODE log=$(cat "$SRV_LOG")"
fi
stop_server; rm -rf "$T"

# --- W2: /api/state carries snapshots, fleet aggregate and timeline ------------
start_case "GET /api/state returns one consistent fleet document"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; H2="$T/proj2"; mkdir -p "$H1" "$H2"
write_harness "$H1" "proj1" "1.0.0"
write_harness "$H2" "proj2" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H2" >/dev/null 2>&1
start_server "$FR"
http GET /api/state
OK="$(printf '%s' "$HTTP_BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ok = len(d['harnesses']) == 2 \
  and d['fleet']['status_counts']['done'] == 2 \
  and d['fleet']['status_counts']['pending'] == 2 \
  and d['skill_version'] \
  and any(t['feature'] == 'alpha' for t in d['timeline']) \
  and d['verifier_busy'] == []
print('yes' if ok else 'no')
" 2>/dev/null)"
if [ "$HTTP_CODE" = "200" ] && [ "$OK" = "yes" ]; then
  pass
else
  fail "code=$HTTP_CODE ok=$OK body=$(printf '%s' "$HTTP_BODY" | head -c 400)"
fi
stop_server; rm -rf "$T"

# --- W3: per-harness features present; corrupt feature_list degrades -----------
start_case "state carries per-harness features and degrades on corrupt JSON"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; H2="$T/broken"; mkdir -p "$H1" "$H2"
write_harness "$H1" "proj1" "1.0.0"
write_harness "$H2" "broken" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H2" >/dev/null 2>&1
printf '{not json' > "$H2/.handyman/feature_list.json"
start_server "$FR"
http GET /api/state
OK="$(printf '%s' "$HTTP_BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
by = {h['project_name']: h for h in d['harnesses']}
good = by['proj1']
bad = by['broken']
ok = {f['name'] for f in good['features']} == {'alpha', 'beta'} \
  and next(f for f in good['features'] if f['name'] == 'beta')['status'] == 'pending' \
  and bad['error'] and bad['features'] == []
print('yes' if ok else 'no')
" 2>/dev/null)"
if [ "$HTTP_CODE" = "200" ] && [ "$OK" = "yes" ]; then
  pass
else
  fail "code=$HTTP_CODE ok=$OK body=$(printf '%s' "$HTTP_BODY" | head -c 400)"
fi
stop_server; rm -rf "$T"

# --- W4: unknown routes 404, POST on read routes 405, no-store everywhere ------
start_case "unknown route 404 JSON, POST /api/state 405, Cache-Control no-store"
T="$(mktemp -d)"; FR="$T/fleetroot"
start_server "$FR"
http GET /nope
C1="$HTTP_CODE"; B1="$HTTP_BODY"
http POST /api/state '{}'
C2="$HTTP_CODE"
HDR="$(curl -s --max-time 5 -D - -o /dev/null "$BASE/api/state" | tr -d '\r')"
if [ "$C1" = "404" ] && printf '%s' "$B1" | grep -q '"ok": false' \
  && [ "$C2" = "405" ] \
  && printf '%s' "$HDR" | grep -qi "Cache-Control: no-store"; then
  pass
else
  fail "c1=$C1 c2=$C2 hdr=$HDR"
fi
stop_server; rm -rf "$T"

# --- W5: add appends via feature.py with the gate bullet last ------------------
start_case "POST /api/feature/add creates a pending feature, gate bullet last"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http POST /api/feature/add \
  "{\"root\":\"$H1\",\"name\":\"gamma\",\"title\":\"Gamma\",\"acceptance\":[\"does the thing\"]}" "$TOKEN"
OK="$(python3 -c "
import json
d = json.load(open('$H1/.handyman/feature_list.json'))
f = next(x for x in d['features'] if x['name'] == 'gamma')
print('yes' if f['status'] == 'pending' and f['id'] == 3
      and f['acceptance'][-1] == './init.sh passes (green gate)'
      and f['acceptance'][0] == 'does the thing' else 'no')
" 2>/dev/null)"
if [ "$HTTP_CODE" = "200" ] && [ "$OK" = "yes" ] \
  && printf '%s' "$HTTP_BODY" | grep -q '"id": 3'; then
  pass
else
  fail "code=$HTTP_CODE ok=$OK body=$HTTP_BODY"
fi
stop_server; rm -rf "$T"

# --- W6: an acceptance already naming the gate is not duplicated ---------------
start_case "add does not duplicate an existing green-gate acceptance"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http POST /api/feature/add \
  "{\"root\":\"$H1\",\"name\":\"gated\",\"acceptance\":[\"bash tests/run_tests.sh passes\"]}" "$TOKEN"
N="$(python3 -c "
import json
d = json.load(open('$H1/.handyman/feature_list.json'))
f = next(x for x in d['features'] if x['name'] == 'gated')
print(len(f['acceptance']))
" 2>/dev/null)"
if [ "$HTTP_CODE" = "200" ] && [ "$N" = "1" ]; then
  pass
else
  fail "code=$HTTP_CODE bullets=$N body=$HTTP_BODY"
fi
stop_server; rm -rf "$T"

# --- W7: duplicate name -> 409, count unchanged --------------------------------
start_case "add of a duplicate feature name returns 409 without side effects"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http POST /api/feature/add "{\"root\":\"$H1\",\"name\":\"beta\"}" "$TOKEN"
N="$(python3 -c "
import json
print(len(json.load(open('$H1/.handyman/feature_list.json'))['features']))
" 2>/dev/null)"
if [ "$HTTP_CODE" = "409" ] && [ "$N" = "2" ] \
  && printf '%s' "$HTTP_BODY" | grep -q "already exists"; then
  pass
else
  fail "code=$HTTP_CODE count=$N body=$HTTP_BODY"
fi
stop_server; rm -rf "$T"

# --- W8: bad slug 400; unregistered root 400 and untouched ---------------------
start_case "add rejects a bad slug and an unregistered target root"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; H2="$T/outsider"; mkdir -p "$H1" "$H2"
write_harness "$H1" "proj1" "1.0.0"
write_harness "$H2" "outsider" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http POST /api/feature/add "{\"root\":\"$H1\",\"name\":\"Bad Name!\"}" "$TOKEN"
C1="$HTTP_CODE"
http POST /api/feature/add "{\"root\":\"$H2\",\"name\":\"sneaky\"}" "$TOKEN"
C2="$HTTP_CODE"; B2="$HTTP_BODY"
N2="$(python3 -c "
import json
print(len(json.load(open('$H2/.handyman/feature_list.json'))['features']))
" 2>/dev/null)"
if [ "$C1" = "400" ] && [ "$C2" = "400" ] && [ "$N2" = "2" ] \
  && printf '%s' "$B2" | grep -q "not a registered harness"; then
  pass
else
  fail "c1=$C1 c2=$C2 outsider_count=$N2 b2=$B2"
fi
stop_server; rm -rf "$T"

# --- W9: missing or wrong token -> 403, no side effects -------------------------
start_case "mutations without a valid session token are refused with 403"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http POST /api/feature/add "{\"root\":\"$H1\",\"name\":\"nope\"}"
C1="$HTTP_CODE"
http POST /api/feature/add "{\"root\":\"$H1\",\"name\":\"nope\"}" "wrong-token"
C2="$HTTP_CODE"
N="$(python3 -c "
import json
print(len(json.load(open('$H1/.handyman/feature_list.json'))['features']))
" 2>/dev/null)"
if [ "$C1" = "403" ] && [ "$C2" = "403" ] && [ "$N" = "2" ]; then
  pass
else
  fail "c1=$C1 c2=$C2 count=$N"
fi
stop_server; rm -rf "$T"

# --- W10: block and unblock transition through feature.py ----------------------
start_case "block sets blocked+reason; unblock returns to pending; bad unblock 409"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http POST /api/feature/block "{\"root\":\"$H1\",\"name\":\"beta\",\"reason\":\"waiting\"}" "$TOKEN"
C1="$HTTP_CODE"
S1="$(python3 -c "
import json
f = next(x for x in json.load(open('$H1/.handyman/feature_list.json'))['features'] if x['name']=='beta')
print(f['status'], f.get('blocked_reason'))
" 2>/dev/null)"
http POST /api/feature/unblock "{\"root\":\"$H1\",\"name\":\"beta\"}" "$TOKEN"
C2="$HTTP_CODE"
S2="$(python3 -c "
import json
f = next(x for x in json.load(open('$H1/.handyman/feature_list.json'))['features'] if x['name']=='beta')
print(f['status'], 'blocked_reason' in f)
" 2>/dev/null)"
http POST /api/feature/unblock "{\"root\":\"$H1\",\"name\":\"beta\"}" "$TOKEN"
C3="$HTTP_CODE"
if [ "$C1" = "200" ] && [ "$S1" = "blocked waiting" ] \
  && [ "$C2" = "200" ] && [ "$S2" = "pending False" ] \
  && [ "$C3" = "409" ]; then
  pass
else
  fail "c1=$C1 s1=$S1 c2=$C2 s2=$S2 c3=$C3"
fi
stop_server; rm -rf "$T"

# --- W11: request draft create / conflict / force ------------------------------
start_case "request-draft writes CORE markdown, refuses overwrite, force wins"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http POST /api/request-draft \
  "{\"root\":\"$H1\",\"name\":\"panel_wish\",\"title\":\"Panel wish\",\"context\":\"From the workstation\",\"includes\":\"one thing\",\"acceptance\":[\"observable outcome\"],\"verification\":\"./init.sh\",\"skills\":\"handyman\"}" "$TOKEN"
C1="$HTTP_CODE"
DRAFT="$H1/.handyman/feature-request.md"
OK1="no"
if [ -f "$DRAFT" ] \
  && grep -q "name: panel_wish" "$DRAFT" \
  && grep -q "observable outcome" "$DRAFT" \
  && tail -20 "$DRAFT" | grep -q "green gate"; then OK1="yes"; fi
http POST /api/request-draft "{\"root\":\"$H1\",\"name\":\"other\"}" "$TOKEN"
C2="$HTTP_CODE"
http POST /api/request-draft "{\"root\":\"$H1\",\"name\":\"other\",\"force\":true}" "$TOKEN"
C3="$HTTP_CODE"
OK3="no"; grep -q "name: other" "$DRAFT" && OK3="yes"
if [ "$C1" = "200" ] && [ "$OK1" = "yes" ] && [ "$C2" = "409" ] \
  && [ "$C3" = "200" ] && [ "$OK3" = "yes" ]; then
  pass
else
  fail "c1=$C1 ok1=$OK1 c2=$C2 c3=$C3 ok3=$OK3"
fi
stop_server; rm -rf "$T"

# --- W12: verifier green ---------------------------------------------------------
start_case "POST /api/verifier/run reports green with exit 0"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
printf '#!/bin/sh\nexit 0\n' > "$H1/init.sh"; chmod +x "$H1/init.sh"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http POST /api/verifier/run "{\"root\":\"$H1\"}" "$TOKEN"
OK="$(printf '%s' "$HTTP_BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('yes' if d['ok'] and d['verifier']['result'] == 'green'
      and d['verifier']['exit_code'] == 0 else 'no')
" 2>/dev/null)"
if [ "$HTTP_CODE" = "200" ] && [ "$OK" = "yes" ]; then
  pass
else
  fail "code=$HTTP_CODE ok=$OK body=$HTTP_BODY"
fi
stop_server; rm -rf "$T"

# --- W13: verifier red and skipped ------------------------------------------------
start_case "verifier reports red with the real exit code and skipped without init.sh"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/red"; H2="$T/skip"; mkdir -p "$H1" "$H2"
write_harness "$H1" "red" "1.0.0"
write_harness "$H2" "skip" "1.0.0"
printf '#!/bin/sh\nexit 7\n' > "$H1/init.sh"; chmod +x "$H1/init.sh"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H2" >/dev/null 2>&1
start_server "$FR"
http POST /api/verifier/run "{\"root\":\"$H1\"}" "$TOKEN"
R1="$(printf '%s' "$HTTP_BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d['verifier']['result'], d['verifier']['exit_code'])
" 2>/dev/null)"
http POST /api/verifier/run "{\"root\":\"$H2\"}" "$TOKEN"
R2="$(printf '%s' "$HTTP_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin)['verifier']['result'])
" 2>/dev/null)"
if [ "$R1" = "red 7" ] && [ "$R2" = "skipped" ]; then
  pass
else
  fail "r1=$R1 r2=$R2"
fi
stop_server; rm -rf "$T"

# --- W14: concurrent run refused; GETs stay live during a run ----------------------
start_case "second verifier run on the same root is 409 while GETs keep answering"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/slow"; mkdir -p "$H1"
write_harness "$H1" "slow" "1.0.0"
printf '#!/bin/sh\nsleep 3\n' > "$H1/init.sh"; chmod +x "$H1/init.sh"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
BG_OUT="$(mktemp)"
curl -s --max-time 20 -o "$BG_OUT" -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" -H "X-Workstation-Token: $TOKEN" \
  --data "{\"root\":\"$H1\"}" "$BASE/api/verifier/run" > "$BG_OUT.code" &
BG_PID=$!
# Poll on verifier_busy alone: the server canonicalizes roots (macOS /var
# vs /private/var), so path-string matching would be fragile here.
BUSY="no"; i=0
while [ $i -lt 25 ]; do
  http GET /api/state
  if printf '%s' "$HTTP_BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
raise SystemExit(0 if d['verifier_busy'] else 1)
" 2>/dev/null; then BUSY="yes"; break; fi
  i=$((i + 1)); sleep 0.1
done
http POST /api/verifier/run "{\"root\":\"$H1\"}" "$TOKEN"
C2="$HTTP_CODE"
wait "$BG_PID" 2>/dev/null
C1="$(cat "$BG_OUT.code")"
if [ "$BUSY" = "yes" ] && [ "$C2" = "409" ] && [ "$C1" = "200" ]; then
  pass
else
  fail "busy=$BUSY second=$C2 first=$C1"
fi
rm -f "$BG_OUT" "$BG_OUT.code"
stop_server; rm -rf "$T"

# --- W15: design tokens, favicon and wordmark on both pages (features 77, 86) ---
# The --hw-* tokens in :root are the only place a color may live: every line
# carrying a hex value must be a token definition. Both the live panel and the
# static moc --html export share the tokens (including the palette-v2 additions
# --hw-info and --hw-text-xl), the amber SVG data-URI favicon and the
# wordmark-with-skill-version header. Radii come from --hw-radius-* only:
# no border-radius rule may carry a px literal.
start_case "panel and fleet html share --hw- tokens, favicon and wordmark (no stray hex)"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http GET /
PANEL="$HTTP_BODY"
HANDYMAN_ROOT="$FR" python3 "$FLEET" moc --html >/dev/null 2>&1
FLEETPAGE="$(cat "$FR/index.html" 2>/dev/null)"
OK="yes"; WHY=""
printf '%s' "$PANEL" | grep -q -- '--hw-bg' || { OK="no"; WHY="panel tokens"; }
printf '%s' "$FLEETPAGE" | grep -q -- '--hw-bg' || { OK="no"; WHY="fleet tokens"; }
printf '%s' "$PANEL" | grep -q -- '--hw-info' || { OK="no"; WHY="panel --hw-info"; }
printf '%s' "$FLEETPAGE" | grep -q -- '--hw-info' || { OK="no"; WHY="fleet --hw-info"; }
printf '%s' "$PANEL" | grep -q -- '--hw-text-xl' \
  || { OK="no"; WHY="panel --hw-text-xl"; }
printf '%s' "$FLEETPAGE" | grep -q -- '--hw-text-xl' \
  || { OK="no"; WHY="fleet --hw-text-xl"; }
printf '%s' "$PANEL" | grep -q 'rel="icon" href="data:image/svg' \
  || { OK="no"; WHY="panel favicon"; }
printf '%s' "$FLEETPAGE" | grep -q 'rel="icon" href="data:image/svg' \
  || { OK="no"; WHY="fleet favicon"; }
printf '%s' "$PANEL" | grep -q 'Handyman · Workstation' \
  || { OK="no"; WHY="panel wordmark"; }
printf '%s' "$PANEL" | grep -qE 'skill [0-9a-z]' || { OK="no"; WHY="panel version"; }
printf '%s' "$FLEETPAGE" | grep -q 'Handyman · Fleet' \
  || { OK="no"; WHY="fleet wordmark"; }
printf '%s' "$FLEETPAGE" | grep -qE 'skill [0-9a-z]' || { OK="no"; WHY="fleet version"; }
STRAY_P="$(printf '%s' "$PANEL" | grep -E '#[0-9a-fA-F]{3,8}' | grep -v -- '--hw-')"
STRAY_F="$(printf '%s' "$FLEETPAGE" | grep -E '#[0-9a-fA-F]{3,8}' | grep -v -- '--hw-')"
[ -z "$STRAY_P" ] || { OK="no"; WHY="stray hex in panel: $STRAY_P"; }
[ -z "$STRAY_F" ] || { OK="no"; WHY="stray hex in fleet html: $STRAY_F"; }
RAD_P="$(printf '%s' "$PANEL" | grep 'border-radius' | grep -E '[0-9]px')"
RAD_F="$(printf '%s' "$FLEETPAGE" | grep 'border-radius' | grep -E '[0-9]px')"
[ -z "$RAD_P" ] || { OK="no"; WHY="px radius literal in panel: $RAD_P"; }
[ -z "$RAD_F" ] || { OK="no"; WHY="px radius literal in fleet html: $RAD_F"; }
printf '%s' "$PANEL" | grep 'border-radius' | grep -qv 'var(--hw-radius-' \
  && { OK="no"; WHY="panel border-radius without --hw-radius token"; }
printf '%s' "$FLEETPAGE" | grep 'border-radius' | grep -qv 'var(--hw-radius-' \
  && { OK="no"; WHY="fleet border-radius without --hw-radius token"; }
if [ "$OK" = "yes" ]; then
  pass
else
  fail "$WHY"
fi
stop_server; rm -rf "$T"

# --- W18: hash-routed views + additive draft field (feature 80) -----------------
start_case "panel ships the three routed views and state carries the draft field"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http GET /
OK="yes"; WHY=""
printf '%s' "$HTTP_BODY" | grep -qF 'href="#/fleet"' || { OK="no"; WHY="fleet route"; }
printf '%s' "$HTTP_BODY" | grep -qF 'href="#/timeline"' || { OK="no"; WHY="timeline route"; }
printf '%s' "$HTTP_BODY" | grep -qF '"#/harness/"' || { OK="no"; WHY="harness route"; }
printf '%s' "$HTTP_BODY" | grep -q '<nav>' || { OK="no"; WHY="nav"; }
printf '%s' "$HTTP_BODY" | grep -q 'id="view-harness"' || { OK="no"; WHY="detail view"; }
printf '%s' "$HTTP_BODY" | grep -q 'id="view-timeline"' || { OK="no"; WHY="timeline view"; }
printf '%s' "$HTTP_BODY" | grep -q '<th>Verifier</th>' \
  && { OK="no"; WHY="overview still has Verifier column"; }
printf '%s' "$HTTP_BODY" | grep -q '<th>Actions</th>' \
  && { OK="no"; WHY="overview still has Actions column"; }
# draft field lifecycle: absent -> pristine (template copy) -> filled
draft_of() {
  http GET /api/state
  printf '%s' "$HTTP_BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
h = next(x for x in d['harnesses'] if x['project_name'] == 'proj1')
draft = h.get('draft') or {}
print(draft.get('state', 'MISSING'))
" 2>/dev/null
}
D1="$(draft_of)"
cp "$SUITE_DIR/../handyman/assets/feature-request.template.md" \
   "$H1/.handyman/feature-request.md"
D2="$(draft_of)"
printf '# real draft content\n' > "$H1/.handyman/feature-request.md"
D3="$(draft_of)"
[ "$D1" = "absent" ] || { OK="no"; WHY="draft absent (got $D1)"; }
[ "$D2" = "pristine" ] || { OK="no"; WHY="draft pristine (got $D2)"; }
[ "$D3" = "filled" ] || { OK="no"; WHY="draft filled (got $D3)"; }
if [ "$OK" = "yes" ]; then
  pass
else
  fail "$WHY"
fi
stop_server; rm -rf "$T"

# --- W21: stale-panel warning — baked vs live skill version (feature 84) --------
# The mismatch itself cannot fire in-process (the server bakes the same
# version it reports), so the contract is asserted structurally: the baked
# constant, the comparison and the warning badge ship in the served page.
start_case "panel bakes its version and warns when the live skill differs"
T="$(mktemp -d)"; FR="$T/fleetroot"
start_server "$FR"
http GET /
OK="yes"; WHY=""
printf '%s' "$HTTP_BODY" | grep -q 'const BAKED_VERSION' \
  || { OK="no"; WHY="baked version constant"; }
printf '%s' "$HTTP_BODY" | grep -qF '!== BAKED_VERSION' \
  || { OK="no"; WHY="live-vs-baked comparison"; }
printf '%s' "$HTTP_BODY" | grep -q 'panel outdated' \
  || { OK="no"; WHY="warning message"; }
printf '%s' "$HTTP_BODY" | grep -q 'id="stale"' || { OK="no"; WHY="stale slot"; }
if [ "$OK" = "yes" ]; then
  pass
else
  fail "$WHY"
fi
stop_server; rm -rf "$T"

# --- W20: app shell — appbar, footer debug, active tabs, table, timeline (f.83) --
start_case "panel ships appbar header, footer registry, active tabs and dated timeline"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http GET /
OK="yes"; WHY=""
printf '%s' "$HTTP_BODY" | grep -q 'class="appbar"' || { OK="no"; WHY="appbar"; }
printf '%s' "$HTTP_BODY" | grep -q '<footer' || { OK="no"; WHY="footer"; }
printf '%s' "$HTTP_BODY" | grep -q 'id="registry"' || { OK="no"; WHY="registry in footer"; }
printf '%s' "$HTTP_BODY" | grep -q 'aria-current' || { OK="no"; WHY="active tab state"; }
# (no trailing > in the pattern: since feature 88 the num headers also carry
# scope="col", so the cell is <th class="num" scope="col">.)
printf '%s' "$HTTP_BODY" | grep -q '<th class="num"' || { OK="no"; WHY="right-aligned num headers"; }
printf '%s' "$HTTP_BODY" | grep -q 'tl-date' || { OK="no"; WHY="timeline date grouping"; }
printf '%s' "$HTTP_BODY" | grep -qF '"updated "' || { OK="no"; WHY="compact updated time"; }
printf '%s' "$HTTP_BODY" | grep -q '"num muted"' || { OK="no"; WHY="muted zeros"; }
if [ "$OK" = "yes" ]; then
  pass
else
  fail "$WHY"
fi
stop_server; rm -rf "$T"

# --- W19: detail declutter — collapsed queue, actions-first, pagetitle (f.82) ---
start_case "detail view collapses done/blocked, actions before queue, pagetitle"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http GET /
OK="yes"; WHY=""
printf '%s' "$HTTP_BODY" | grep -q 'pagetitle' || { OK="no"; WHY="pagetitle"; }
printf '%s' "$HTTP_BODY" | grep -qF 'createElement("details")' \
  || { OK="no"; WHY="collapsible queue groups"; }
printf '%s' "$HTTP_BODY" | grep -q 'function plural' || { OK="no"; WHY="plural helper"; }
printf '%s' "$HTTP_BODY" | grep -q 'signal(s)' && { OK="no"; WHY="lazy (s) plural still present"; }
printf '%s' "$HTTP_BODY" | grep -q 'omitProject' || { OK="no"; WHY="per-harness timeline omitProject"; }
printf '%s' "$HTTP_BODY" | grep -q 'list-style: none' || { OK="no"; WHY="ul reset"; }
ORDER="$(printf '%s' "$HTTP_BODY" | python3 -c "
import sys
body = sys.stdin.read()
a = body.find('el(\"h2\", \"Actions\")')
q = body.find('el(\"h2\", \"Queue\")')
print('yes' if 0 <= a < q else 'no')
" 2>/dev/null)"
[ "$ORDER" = "yes" ] || { OK="no"; WHY="Actions renders before Queue"; }
if [ "$OK" = "yes" ]; then
  pass
else
  fail "$WHY"
fi
stop_server; rm -rf "$T"

# --- W17: interaction contract — fmt layer, busy, prefixes, validation (f.79) ---
# The suite runs no browser, so the contract is asserted structurally: the
# single fmt layer exists, the old machine-string constructs are gone from the
# page source, and the native-validation/help/busy markers ship in the JS.
start_case "panel ships the fmt layer, native validation, busy and ok:/error: prefixes"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http GET /
OK="yes"; WHY=""
printf '%s' "$HTTP_BODY" | grep -q 'const fmt' || { OK="no"; WHY="fmt layer"; }
printf '%s' "$HTTP_BODY" | grep -q 'fleet: harnesses=' \
  && { OK="no"; WHY="old k=v aggregate dump still present"; }
printf '%s' "$HTTP_BODY" | grep -qF ' [" + f.status + "]' \
  && { OK="no"; WHY="raw status slug still rendered"; }
printf '%s' "$HTTP_BODY" | grep -qF 'pattern = "[a-z0-9_]+"' \
  || { OK="no"; WHY="native slug pattern"; }
printf '%s' "$HTTP_BODY" | grep -q 'lowercase slug' || { OK="no"; WHY="slug help"; }
printf '%s' "$HTTP_BODY" | grep -qF '"working..."' || { OK="no"; WHY="busy marker"; }
printf '%s' "$HTTP_BODY" | grep -qF '"ok: "' || { OK="no"; WHY="ok: prefix"; }
printf '%s' "$HTTP_BODY" | grep -qF '"error: "' || { OK="no"; WHY="error: prefix"; }
printf '%s' "$HTTP_BODY" | grep -q 'For direct intake' \
  || { OK="no"; WHY="draft-vs-add help"; }
printf '%s' "$HTTP_BODY" | grep -q 'dlghelp' || { OK="no"; WHY="dialog help node"; }
if [ "$OK" = "yes" ]; then
  pass
else
  fail "$WHY"
fi
stop_server; rm -rf "$T"

# --- W16: action labels speak the workflow-stage vocabulary (feature 78) --------
start_case "panel actions carry workflow-stage labels and stage+artifact titles"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http GET /
OK="yes"; WHY=""
for LABEL in "Draft request" "Add pending feature" "Run verifier"; do
  printf '%s' "$HTTP_BODY" | grep -q "$LABEL" || { OK="no"; WHY="label: $LABEL"; }
done
printf '%s' "$HTTP_BODY" | grep -q "Intake — writes feature-request.md" \
  || { OK="no"; WHY="request title"; }
printf '%s' "$HTTP_BODY" | grep -q "Verification — runs the target's own init.sh" \
  || { OK="no"; WHY="verify title"; }
printf '%s' "$HTTP_BODY" | grep -q "blocked -> pending" \
  || { OK="no"; WHY="unblock title"; }
if [ "$OK" = "yes" ]; then
  pass
else
  fail "$WHY"
fi
stop_server; rm -rf "$T"

# --- W22: manual light/dark/system theme without flash (feature 87) --------------
# The dark token block ships under both selectors (manual [data-theme="dark"]
# and the OS media query via :root:not([data-theme="light"])); the versioned
# localStorage key hw-theme:1 and the select#theme control ship in the page;
# the anti-flash theme script appears BEFORE the first <style> (positional
# grep); the static fleet export inherits the [data-theme] selectors through
# the shared stylesheet but ships no toggle.
start_case "theme: layered dark selectors, hw-theme:1, anti-flash before <style>"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http GET /
PANEL="$HTTP_BODY"
HANDYMAN_ROOT="$FR" python3 "$FLEET" moc --html >/dev/null 2>&1
FLEETPAGE="$(cat "$FR/index.html" 2>/dev/null)"
OK="yes"; WHY=""
printf '%s' "$PANEL" | grep -q ':root\[data-theme="dark"\]' \
  || { OK="no"; WHY="panel manual dark selector"; }
printf '%s' "$PANEL" | grep -q '@media (prefers-color-scheme: dark)' \
  || { OK="no"; WHY="panel media query"; }
printf '%s' "$PANEL" | grep -q ':root:not(\[data-theme="light"\])' \
  || { OK="no"; WHY="panel system-dark selector"; }
printf '%s' "$PANEL" | grep -q 'hw-theme:1' || { OK="no"; WHY="panel storage key"; }
printf '%s' "$PANEL" | grep -q 'select id="theme"' \
  || { OK="no"; WHY="panel theme select"; }
for V in system light dark; do
  printf '%s' "$PANEL" | grep -q "option value=\"$V\"" \
    || { OK="no"; WHY="theme option $V"; }
done
[ "$(printf '%s' "$PANEL" | grep -c 'name="theme-color" media=')" = "2" ] \
  || { OK="no"; WHY="two scheme-scoped theme-color metas"; }
THEME_LINE="$(printf '%s\n' "$PANEL" | grep -n 'hw-theme:1' | head -1 | cut -d: -f1)"
STYLE_LINE="$(printf '%s\n' "$PANEL" | grep -n '<style>' | head -1 | cut -d: -f1)"
if [ -z "$THEME_LINE" ] || [ -z "$STYLE_LINE" ] \
  || [ "$THEME_LINE" -ge "$STYLE_LINE" ]; then
  OK="no"; WHY="theme script not before first <style> (theme=$THEME_LINE style=$STYLE_LINE)"
fi
printf '%s' "$FLEETPAGE" | grep -q ':root\[data-theme="dark"\]' \
  || { OK="no"; WHY="fleet page inherits [data-theme] selectors"; }
printf '%s' "$FLEETPAGE" | grep -q ':root:not(\[data-theme="light"\])' \
  || { OK="no"; WHY="fleet page inherits system-dark selector"; }
printf '%s' "$FLEETPAGE" | grep -q 'select id="theme"' \
  && { OK="no"; WHY="fleet static page must not ship the toggle"; }
if [ "$OK" = "yes" ]; then
  pass
else
  fail "$WHY"
fi
stop_server; rm -rf "$T"

# --- W23: WCAG 2.2 markup pass over both pages (feature 88) ----------------------
# Shared contract (panel GET / and static moc --html export): a <main>
# landmark, tables described by a visually-hidden <caption> and scope="col"
# headers, the .visually-hidden utility and the prefers-reduced-motion block
# in the shared stylesheet. Panel-only contract (the SPA, dialog and forms
# exist only there): wordmark demoted to <p> so each view owns the single
# <h1> (tabindex="-1", focused + document.title on hashchange), dialog
# aria-labelledby/aria-describedby with focus return to the opener, field
# help via aria-describedby and aria-invalid set on error / cleared on fix.
start_case "a11y: main landmark, captions+scope, per-view h1 focus, dialog and field aria"
T="$(mktemp -d)"; FR="$T/fleetroot"; H1="$T/proj1"; mkdir -p "$H1"
write_harness "$H1" "proj1" "1.0.0"
HANDYMAN_ROOT="$FR" python3 "$FLEET" register "$H1" >/dev/null 2>&1
start_server "$FR"
http GET /
PANEL="$HTTP_BODY"
HANDYMAN_ROOT="$FR" python3 "$FLEET" moc --html >/dev/null 2>&1
FLEETPAGE="$(cat "$FR/index.html" 2>/dev/null)"
OK="yes"; WHY=""
# shared: both served pages
printf '%s' "$PANEL" | grep -q '<main>' || { OK="no"; WHY="panel main landmark"; }
printf '%s' "$FLEETPAGE" | grep -q '<main>' || { OK="no"; WHY="fleet main landmark"; }
printf '%s' "$PANEL" | grep -q 'scope="col"' || { OK="no"; WHY="panel th scope"; }
printf '%s' "$FLEETPAGE" | grep -q 'scope="col"' || { OK="no"; WHY="fleet th scope"; }
printf '%s' "$PANEL" | grep -q '<caption class="visually-hidden"' \
  || { OK="no"; WHY="panel table caption"; }
printf '%s' "$FLEETPAGE" | grep -q '<caption class="visually-hidden"' \
  || { OK="no"; WHY="fleet table caption"; }
printf '%s' "$PANEL" | grep -q '\.visually-hidden' \
  || { OK="no"; WHY="panel visually-hidden utility"; }
printf '%s' "$FLEETPAGE" | grep -q '\.visually-hidden' \
  || { OK="no"; WHY="fleet visually-hidden utility"; }
printf '%s' "$PANEL" | grep -q 'prefers-reduced-motion' \
  || { OK="no"; WHY="panel reduced-motion block"; }
printf '%s' "$FLEETPAGE" | grep -q 'prefers-reduced-motion' \
  || { OK="no"; WHY="fleet reduced-motion block"; }
# panel-only: wordmark demoted, per-view h1s own the heading level
printf '%s' "$PANEL" | grep -q '<p class="wordmark">' \
  || { OK="no"; WHY="wordmark demoted to p"; }
printf '%s' "$PANEL" | grep -q '<h1>' \
  && { OK="no"; WHY="an attribute-less h1 remains (appbar?)"; }
printf '%s' "$PANEL" | grep -q 'id="h1-fleet" tabindex="-1"' \
  || { OK="no"; WHY="fleet view h1"; }
printf '%s' "$PANEL" | grep -q 'id="h1-harness" class="pagetitle" tabindex="-1"' \
  || { OK="no"; WHY="harness view h1"; }
printf '%s' "$PANEL" | grep -q 'id="h1-timeline" tabindex="-1"' \
  || { OK="no"; WHY="timeline view h1"; }
# panel-only: hashchange moves focus to the view h1 and retitles the document
printf '%s' "$PANEL" | grep -qF 'heading.focus()' || { OK="no"; WHY="h1 focus on hashchange"; }
printf '%s' "$PANEL" | grep -qF 'document.title' || { OK="no"; WHY="document.title update"; }
printf '%s' "$PANEL" | grep -qF '\u00b7 Handyman Workstation' \
  || { OK="no"; WHY="view-scoped title template"; }
# panel-only: dialog naming, description and focus return to the opener
printf '%s' "$PANEL" | grep -q 'aria-labelledby="dlg-title"' \
  || { OK="no"; WHY="dialog aria-labelledby"; }
printf '%s' "$PANEL" | grep -q 'aria-describedby="dlg-help"' \
  || { OK="no"; WHY="dialog aria-describedby"; }
printf '%s' "$PANEL" | grep -q 'dlgOpener' || { OK="no"; WHY="dialog opener focus return"; }
# panel-only: field help tied to its control; aria-invalid set and cleared
printf '%s' "$PANEL" | grep -qF 'setAttribute("aria-describedby"' \
  || { OK="no"; WHY="field help aria-describedby"; }
printf '%s' "$PANEL" | grep -qF 'setAttribute("aria-invalid"' \
  || { OK="no"; WHY="aria-invalid on error"; }
printf '%s' "$PANEL" | grep -qF 'removeAttribute("aria-invalid")' \
  || { OK="no"; WHY="aria-invalid cleared when fixed"; }
# panel-only: buttons reserve a >=24px target height from a token (2.5.8)
printf '%s' "$PANEL" | grep -q 'min-height: var(--hw-space-4)' \
  || { OK="no"; WHY="button min-height token"; }
if [ "$OK" = "yes" ]; then
  pass
else
  fail "$WHY"
fi
stop_server; rm -rf "$T"

summary
