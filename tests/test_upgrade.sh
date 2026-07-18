#!/usr/bin/env bash
# Tests for upgrade_harness --check (harness version drift detector).
# Invokes the built TS port (dist/upgrade_harness.js); scripts/upgrade_harness.py
# was ported and dropped.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
UPGRADE="$SUITE_DIR/../handyman/dist/upgrade_harness.js"
SKILL_MD="$SUITE_DIR/../handyman/SKILL.md"

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
OUT="$(node "$UPGRADE" --check --root "$U1" 2>&1)"; CODE=$?
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
OUT="$(node "$UPGRADE" --check --root "$U2" 2>&1)"; CODE=$?
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
OUT="$(node "$UPGRADE" --check --root "$U3" 2>&1)"; CODE=$?
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
OUT="$(node "$UPGRADE" --check --root "$U4" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "up to date"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$U4"

# --- U5: apply on an up-to-date harness is a no-op (exit 0) ----------------
start_case "apply on an up-to-date harness is a no-op (exit 0)"
U5="$(mktemp -d)"
make_harness "$U5" "$CUR"
OUT="$(node "$UPGRADE" --root "$U5" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "nothing to apply"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$U5"

# --- U6: apply migrates an outdated harness (managed file + re-seal) -------
start_case "apply migrates an outdated harness: creates managed file + re-seals"
U6="$(mktemp -d)"
make_harness "$U6" "1.5.0"
OUT="$(node "$UPGRADE" --root "$U6" 2>&1)"; CODE=$?
NEWVER="$(_json "$U6/harness.config.json" str harness_version)"
if [ "$CODE" -eq 0 ] && [ -f "$U6/.handyman/docs/business.md" ] \
   && [ "$NEWVER" = "$CUR" ] \
   && printf '%s' "$OUT" | grep -q "created: docs/business.md" \
   && printf '%s' "$OUT" | grep -q "re-sealed harness_version -> $CUR"; then
  pass
else
  fail "exit=$CODE ver=$NEWVER output: $OUT"
fi
rm -rf "$U6"

# --- U7: dry-run previews without writing -----------------------------------
start_case "dry-run previews without writing (no file, version unchanged)"
U7="$(mktemp -d)"
make_harness "$U7" "1.5.0"
OUT="$(node "$UPGRADE" --dry-run --root "$U7" 2>&1)"; CODE=$?
VER="$(_json "$U7/harness.config.json" str harness_version)"
if [ "$CODE" -eq 0 ] && [ ! -f "$U7/.handyman/docs/business.md" ] \
   && [ "$VER" = "1.5.0" ] \
   && printf '%s' "$OUT" | grep -q "would create: docs/business.md" \
   && printf '%s' "$OUT" | grep -q "would re-seal"; then
  pass
else
  fail "exit=$CODE ver=$VER output: $OUT"
fi
rm -rf "$U7"

# --- U8: apply backs up before migrating ------------------------------------
start_case "apply backs up harness.config.json before migrating"
U8="$(mktemp -d)"
make_harness "$U8" "1.5.0"
node "$UPGRADE" --root "$U8" >/dev/null 2>&1
backups=("$U8"/.handyman/.upgrade-backups/*/harness.config.json)
if [ -e "${backups[0]}" ]; then
  pass
else
  fail "no backup created under .upgrade-backups/"
fi
rm -rf "$U8"

# --- U9: apply is idempotent ------------------------------------------------
start_case "apply is idempotent: a second run is a no-op"
U9="$(mktemp -d)"
make_harness "$U9" "1.5.0"
node "$UPGRADE" --root "$U9" >/dev/null 2>&1
OUT="$(node "$UPGRADE" --root "$U9" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "nothing to apply"; then
  pass
else
  fail "second run not a no-op: exit=$CODE output: $OUT"
fi
rm -rf "$U9"

# --- U10: project-owned state is never overwritten --------------------------
start_case "apply never overwrites project-owned state (custom docs + feature_list)"
U10="$(mktemp -d)"
make_harness "$U10" "1.5.0"
mkdir -p "$U10/.handyman/docs"
printf 'CUSTOM BUSINESS CONTENT\n' > "$U10/.handyman/docs/business.md"
cat > "$U10/.handyman/feature_list.json" <<'JSON'
{ "project": "t", "config": { "install_mode": "local", "project_name": "t", "project_root": ".", "harness_workspace": ".handyman" }, "features": [ { "id": 1, "name": "keep_me", "status": "in_progress" } ] }
JSON
node "$UPGRADE" --root "$U10" >/dev/null 2>&1
BIZ="$(cat "$U10/.handyman/docs/business.md")"
FEAT="$(_json "$U10/.handyman/feature_list.json" str features.0.name)"
if [ "$BIZ" = "CUSTOM BUSINESS CONTENT" ] && [ "$FEAT" = "keep_me" ]; then
  pass
else
  fail "business=$BIZ feature=$FEAT"
fi
rm -rf "$U10"

summary
