#!/usr/bin/env bash
# Sprint-lifecycle tests for the Handyman skill.
# Exercises scripts/sprint.py against fixture harnesses: open (stamping and
# the single-open-sprint invariant), close (derived sprint document, archive,
# carry-over label strip, current_sprint cleared), dry-run, and status.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
SPRINT="$SUITE_DIR/../handyman/scripts/sprint.py"

echo "Sprint-lifecycle suite (test_sprint.sh)"

# --- fixture builders --------------------------------------------------------

# Build a minimal local harness in $1: config bridge, three features, history.
write_harness() {
  root="$1"
  mkdir -p "$root/.handyman/progress" "$root/.handyman/backlog"
  cat > "$root/harness.config.json" <<'JSON'
{
  "install_mode": "local",
  "project_name": "t",
  "project_root": ".",
  "harness_workspace": ".handyman",
  "current_sprint": null
}
JSON
  cat > "$root/.handyman/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [
    { "id": 1, "name": "a", "status": "pending" },
    { "id": 2, "name": "b", "status": "pending" },
    { "id": 3, "name": "c", "status": "done" }
  ]
}
JSON
  : > "$root/.handyman/progress/current.md"
  cat > "$root/.handyman/progress/history.md" <<'MD'
# History

## 2026-07-10 - Feature 1: a
- **Agent:** leader
- **Tools:** skills: handyman
- **Closure:** done
MD
}

json_get() { # $1=file  $2=python expression over d
  python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print($2)" "$1"
}

# --- S1: open stamps unlabeled pending features -------------------------------
start_case "open: stamps pending features and records current_sprint"
S1="$(mktemp -d)"
write_harness "$S1"
OUT="$(python3 "$SPRINT" --root "$S1" open 2026-SP1 2>&1)"; CODE=$?
CUR="$(json_get "$S1/harness.config.json" "d.get('current_sprint')")"
LBL_A="$(json_get "$S1/.handyman/feature_list.json" "next(f.get('sprint','') for f in d['features'] if f['name']=='a')")"
LBL_C="$(json_get "$S1/.handyman/feature_list.json" "next(f.get('sprint','') for f in d['features'] if f['name']=='c')")"
if [ "$CODE" -eq 0 ] && [ "$CUR" = "2026-SP1" ] \
  && [ "$LBL_A" = "2026-SP1" ] && [ -z "$LBL_C" ]; then
  pass
else
  fail "exit=$CODE current=$CUR a=$LBL_A c=$LBL_C output: $OUT"
fi
rm -rf "$S1"

# --- S2: open rejects a malformed sprint id -----------------------------------
start_case "open: rejects a malformed sprint id without writing"
S2="$(mktemp -d)"
write_harness "$S2"
OUT="$(python3 "$SPRINT" --root "$S2" open sprint-one 2>&1)"; CODE=$?
CUR="$(json_get "$S2/harness.config.json" "d.get('current_sprint')")"
if [ "$CODE" -ne 0 ] && [ "$CUR" = "None" ]; then
  pass
else
  fail "expected failure, exit=$CODE current=$CUR output: $OUT"
fi
rm -rf "$S2"

# --- S3: open enforces the single-open-sprint invariant ------------------------
start_case "open: fails when a sprint is already open"
S3="$(mktemp -d)"
write_harness "$S3"
python3 "$SPRINT" --root "$S3" open 2026-SP1 >/dev/null 2>&1
OUT="$(python3 "$SPRINT" --root "$S3" open 2026-SP2 2>&1)"; CODE=$?
CUR="$(json_get "$S3/harness.config.json" "d.get('current_sprint')")"
if [ "$CODE" -ne 0 ] && [ "$CUR" = "2026-SP1" ] \
  && printf '%s' "$OUT" | grep -q "already open"; then
  pass
else
  fail "expected failure, exit=$CODE current=$CUR output: $OUT"
fi
rm -rf "$S3"

# --- S4: status reports the open sprint ----------------------------------------
start_case "status: reports the open sprint and its features"
S4="$(mktemp -d)"
write_harness "$S4"
python3 "$SPRINT" --root "$S4" open 2026-SP1 >/dev/null 2>&1
OUT="$(python3 "$SPRINT" --root "$S4" status 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "2026-SP1" \
  && printf '%s' "$OUT" | grep -q "a \[pending\]"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$S4"

# --- S5: close derives the doc, archives done, strips carry-over ---------------
start_case "close: writes sprint doc, archives done, strips carry-over label"
S5="$(mktemp -d)"
write_harness "$S5"
python3 "$SPRINT" --root "$S5" open 2026-SP1 >/dev/null 2>&1
python3 - "$S5/.handyman/feature_list.json" <<'PY'
import json, sys
path = sys.argv[1]
d = json.load(open(path))
for f in d["features"]:
    if f["name"] == "a":
        f["status"] = "done"
json.dump(d, open(path, "w"), indent=2)
PY
OUT="$(python3 "$SPRINT" --root "$S5" close 2>&1)"; CODE=$?
DOC="$S5/.handyman/docs/sprints/sprint.2026-SP1.md"
CUR="$(json_get "$S5/harness.config.json" "d.get('current_sprint')")"
HAS_A="$(json_get "$S5/.handyman/feature_list.json" "any(f['name']=='a' for f in d['features'])")"
LBL_B="$(json_get "$S5/.handyman/feature_list.json" "next(f.get('sprint','') for f in d['features'] if f['name']=='b')")"
ARCH="$(json_get "$S5/.handyman/archive/feature_archive.json" "d['sprints']['2026-SP1'][0]['name']")"
if [ "$CODE" -eq 0 ] && [ -f "$DOC" ] && [ "$CUR" = "None" ] \
  && [ "$HAS_A" = "False" ] && [ -z "$LBL_B" ] && [ "$ARCH" = "a" ] \
  && grep -q "2026-07-10" "$DOC" && grep -q "skills: handyman" "$DOC" \
  && grep -q "b (pending)" "$DOC"; then
  pass
else
  fail "exit=$CODE doc=$([ -f "$DOC" ] && echo yes || echo no) current=$CUR has_a=$HAS_A b=$LBL_B arch=$ARCH output: $OUT"
fi
rm -rf "$S5"

# --- S6: close --dry-run writes nothing ----------------------------------------
start_case "close: --dry-run previews without writing"
S6="$(mktemp -d)"
write_harness "$S6"
python3 "$SPRINT" --root "$S6" open 2026-SP1 >/dev/null 2>&1
OUT="$(python3 "$SPRINT" --root "$S6" close --dry-run 2>&1)"; CODE=$?
CUR="$(json_get "$S6/harness.config.json" "d.get('current_sprint')")"
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "DRY RUN" \
  && [ ! -e "$S6/.handyman/docs/sprints/sprint.2026-SP1.md" ] \
  && [ ! -e "$S6/.handyman/archive" ] && [ "$CUR" = "2026-SP1" ]; then
  pass
else
  fail "exit=$CODE current=$CUR output: $OUT"
fi
rm -rf "$S6"

# --- S7: close without an open sprint fails ------------------------------------
start_case "close: fails when no sprint is open"
S7="$(mktemp -d)"
write_harness "$S7"
OUT="$(python3 "$SPRINT" --root "$S7" close 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "no sprint open"; then
  pass
else
  fail "expected failure, exit=$CODE output: $OUT"
fi
rm -rf "$S7"

# --- S8: close rejects an in_progress feature in the sprint --------------------
start_case "close: rejects when a labeled feature is in_progress"
S8="$(mktemp -d)"
write_harness "$S8"
python3 "$SPRINT" --root "$S8" open 2026-SP1 >/dev/null 2>&1
python3 - "$S8/.handyman/feature_list.json" <<'PY'
import json, sys
path = sys.argv[1]
d = json.load(open(path))
for f in d["features"]:
    if f["name"] == "a":
        f["status"] = "in_progress"
json.dump(d, open(path, "w"), indent=2)
PY
OUT="$(python3 "$SPRINT" --root "$S8" close 2>&1)"; CODE=$?
CUR="$(json_get "$S8/harness.config.json" "d.get('current_sprint')")"
if [ "$CODE" -ne 0 ] && [ "$CUR" = "2026-SP1" ] \
  && printf '%s' "$OUT" | grep -q "in_progress"; then
  pass
else
  fail "expected failure, exit=$CODE current=$CUR output: $OUT"
fi
rm -rf "$S8"

summary
