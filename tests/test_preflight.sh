#!/usr/bin/env bash
# Preflight orchestrator tests for the Handyman skill.
# Exercises scripts/preflight.py: it reuses validate_harness, upgrade_harness,
# update_harness and tools_discovery and emits a unified read-only stability
# report (format / drift / sync / discovery) that ALWAYS exits 0.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
PF="$SUITE_DIR/../handyman/scripts/preflight.py"
SCRIPTS="$SUITE_DIR/../handyman/scripts"

echo "Preflight suite (test_preflight.sh)"

# --- fixture builders --------------------------------------------------------

# A minimal but well-formed local harness with a sealed version that matches the
# current skill, so drift == OK. Writes into $1/root.
write_fixture() {
  root="$1"
  ws="$root/.handyman"
  mkdir -p "$ws/progress" "$ws/backlog" "$ws/docs"
  # current skill version (read by upgrade_harness from SKILL.md)
  cur="$(python3 - "$SCRIPTS" <<'PY'
import sys
from pathlib import Path
sk = Path(sys.argv[1]).parent / "SKILL.md"
txt = sk.read_text(encoding="utf-8")
import re
m = re.search(r"version:\s*([0-9]+\.[0-9]+\.[0-9]+)", txt)
print(m.group(1) if m else "0.0.0")
PY
)"
  printf '{\n  "install_mode": "local",\n  "project_name": "fixture",\n  "project_root": ".",\n  "harness_workspace": ".handyman",\n  "harness_version": "%s",\n  "models": {"leader": "x", "implementer": "x", "reviewer": "x", "explorer": "x"},\n  "tools": {"leader": ["read"], "implementer": ["read"], "reviewer": ["read"], "explorer": ["read"]}\n}\n' "$cur" > "$root/harness.config.json"
  printf '{\n  "project": "fixture",\n  "description": "fixture",\n  "config": {"install_mode": "local", "project_name": "fixture", "project_root": ".", "handyman_root": null, "harness_workspace": ".handyman", "harness_version": "%s"},\n  "rules": {"one_feature_at_a_time": true, "require_tests_to_close": true, "valid_status": ["pending", "in_progress", "done", "blocked"]},\n  "features": []\n}\n' "$cur" > "$ws/feature_list.json"
  printf -- '---\nfeature: none\nstatus: idle\nrole: leader\nupdated: 2026-01-01\ntags: [handyman/session/current]\n---\n# Current\n' > "$ws/progress/current.md"
  printf -- '---\ntags: [handyman/session/history]\n---\n# History\n' > "$ws/progress/history.md"
}

# --- T1: emits all four blocks and exits 0 ---------------------------------
start_case "preflight emits format/drift/sync/discovery blocks and exits 0"
T="$(mktemp -d)"; write_fixture "$T"
OUT="$(python3 "$PF" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "format:" \
  && printf '%s' "$OUT" | grep -q "drift:" \
  && printf '%s' "$OUT" | grep -q "sync:" \
  && printf '%s' "$OUT" | grep -q "discovery:"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T2: read-only — exits 0 even when the harness is behind ---------------
start_case "preflight is read-only: exits 0 even with a behind harness"
T="$(mktemp -d)"; write_fixture "$T"
# force an old version so upgrade_harness --check reports BEHIND
python3 - "$T/harness.config.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.loads(open(p).read())
d["harness_version"] = "0.0.1"
open(p, "w").write(json.dumps(d, indent=2))
PY
OUT="$(python3 "$PF" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "drift: BEHIND" \
  && printf '%s' "$OUT" | grep -q "read-only"; then
  pass
else
  fail "expected exit 0 + drift BEHIND; exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T3: reuses the existing scripts (no reimplementation) ----------------
start_case "preflight reuses validate_harness and reports its output"
T="$(mktemp -d)"; write_fixture "$T"
OUT="$(python3 "$PF" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "validate_harness" \
  && printf '%s' "$OUT" | grep -q "format: OK"; then
  pass
else
  fail "did not surface validate_harness output; exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T4: resolves HARNESS_WORKSPACE ----------------------------------------
start_case "preflight resolves HARNESS_WORKSPACE from harness.config.json"
T="$(mktemp -d)"; write_fixture "$T"
OUT="$(python3 "$PF" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "workspace:.*\.handyman"; then
  pass
else
  fail "did not print resolved workspace; exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T5: a malformed harness still reports format gaps but exits 0 --------
start_case "preflight surfaces format gaps as GAPS but still exits 0"
T="$(mktemp -d)"
# no harness files at all -> resolve_workspace falls back to root
printf '{"install_mode":"local","project_name":"x","project_root":".","harness_workspace":"missing"}\n' > "$T/harness.config.json"
OUT="$(python3 "$PF" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "format: GAPS"; then
  pass
else
  fail "expected format GAPS + exit 0; exit=$CODE out=$OUT"
fi
rm -rf "$T"

summary
