#!/usr/bin/env bash
# Tests for scripts/upgrade_harness.py --check (harness version drift detector).
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
UPGRADE="$SUITE_DIR/../scripts/upgrade_harness.py"
SKILL_MD="$SUITE_DIR/../SKILL.md"

echo "Upgrade-check suite (test_upgrade.sh)"

# Current skill version: the baseline the script itself reads from SKILL.md.
CUR="$(awk '
  /^---[[:space:]]*$/ { f++; if (f == 2) exit; next }
  f == 1 && /^[[:space:]]+version:[[:space:]]*/ {
    sub(/^[[:space:]]+version:[[:space:]]*/, ""); sub(/[[:space:]]*$/, ""); print; exit
  }' "$SKILL_MD")"

# make_harness ROOT [VERSION]   Write a local .handyman harness. When VERSION is
# given, also write harness.config.json stamped with it.
make_harness() {
  root="$1"; version="${2:-}"
  mkdir -p "$root/.handyman/progress"
  : > "$root/.handyman/progress/current.md"
  : > "$root/.handyman/progress/history.md"
  cat > "$root/.handyman/feature_list.json" <<'JSON'
{ "project": "t", "config": { "install_mode": "local", "project_name": "t", "project_root": ".", "harness_workspace": ".handyman" }, "features": [] }
JSON
  if [ -n "$version" ]; then
    cat > "$root/harness.config.json" <<JSON
{ "install_mode": "local", "project_name": "t", "project_root": ".", "harness_workspace": ".handyman", "harness_version": "$version" }
JSON
  fi
}

# --- U1: up to date -> exit 0 ----------------------------------------------
start_case "up-to-date harness (== current) exits 0"
U1="$(mktemp -d)"
make_harness "$U1" "$CUR"
OUT="$(python3 "$UPGRADE" --check --root "$U1" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "up to date"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$U1"

# --- U2: behind -> exit 1 + drift ------------------------------------------
start_case "outdated harness (< current) exits non-zero and reports drift"
U2="$(mktemp -d)"
make_harness "$U2" "1.0.0"
OUT="$(python3 "$UPGRADE" --check --root "$U2" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "behind"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$U2"

# --- U3: unsealed -> exit 1 + no version stamp -----------------------------
start_case "unsealed harness (no stamp) exits non-zero and reports it"
U3="$(mktemp -d)"
make_harness "$U3"
OUT="$(python3 "$UPGRADE" --check --root "$U3" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "no valid version stamp"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$U3"

# --- U4: reads the stamp from feature_list.json config when no config ------
start_case "reads harness_version from feature_list.json config fallback"
U4="$(mktemp -d)"
mkdir -p "$U4/.handyman/progress"
: > "$U4/.handyman/progress/current.md"
: > "$U4/.handyman/progress/history.md"
cat > "$U4/.handyman/feature_list.json" <<JSON
{ "project": "t", "config": { "install_mode": "local", "project_name": "t", "project_root": ".", "harness_workspace": ".handyman", "harness_version": "$CUR" }, "features": [] }
JSON
OUT="$(python3 "$UPGRADE" --check --root "$U4" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "up to date"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$U4"

# --- U5: missing --check is a usage error (exit 2) -------------------------
start_case "invocation without --check is a usage error (exit 2)"
U5="$(mktemp -d)"
make_harness "$U5" "$CUR"
python3 "$UPGRADE" --root "$U5" >/dev/null 2>&1; CODE=$?
if [ "$CODE" -eq 2 ]; then
  pass
else
  fail "expected exit 2, got $CODE"
fi
rm -rf "$U5"

summary
