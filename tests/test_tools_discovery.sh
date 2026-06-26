#!/usr/bin/env bash
# Skill/MCP discovery tests for the Handyman skill.
# Exercises scripts/tools_discovery.py against fixture skill roots and a fixture
# harness: list, find (keyword filter), and check (declared-present,
# declared-missing, and no-discovery-block).
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
TD="$SUITE_DIR/../handyman/scripts/tools_discovery.py"

echo "Tools-discovery suite (test_tools_discovery.sh)"

# --- fixture builders --------------------------------------------------------

write_skills() {
  root="$1"
  mkdir -p "$root/alpha" "$root/beta"
  printf -- '---\nname: alpha\ndescription: First fixture skill for discovery.\n---\n' > "$root/alpha/SKILL.md"
  printf -- '---\nname: beta\ndescription: Second fixture skill.\n---\n' > "$root/beta/SKILL.md"
}

write_config() { # $1=root $2=discovery_json_or_empty
  root="$1"; disc="$2"
  if [ -n "$disc" ]; then
    printf '{"install_mode":"local","project_name":"x","project_root":".","harness_workspace":".handyman","discovery":%s}\n' "$disc" > "$root/harness.config.json"
  else
    printf '{"install_mode":"local","project_name":"x","project_root":".","harness_workspace":".handyman"}\n' > "$root/harness.config.json"
  fi
}

# --- T1: list enumerates installed skills -----------------------------------
start_case "list enumerates installed skills (name + description)"
T="$(mktemp -d)"; write_skills "$T/skills"
OUT="$(python3 "$TD" --skills-dir "$T/skills" list 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "^alpha	" \
  && printf '%s' "$OUT" | grep -q "^beta	"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T2: list --json emits valid JSON ---------------------------------------
start_case "list --json emits valid JSON with the skills"
T="$(mktemp -d)"; write_skills "$T/skills"
OUT="$(python3 "$TD" --skills-dir "$T/skills" list --json 2>&1)"
if printf '%s' "$OUT" | python3 -c "import json,sys;d=json.load(sys.stdin);assert {s['name'] for s in d}=={'alpha','beta'}" 2>/dev/null; then
  pass
else
  fail "invalid or unexpected JSON: $OUT"
fi
rm -rf "$T"

# --- T3: find filters by keyword (case-insensitive) -------------------------
start_case "find filters skills by keyword and excludes non-matches"
T="$(mktemp -d)"; write_skills "$T/skills"
OUT="$(python3 "$TD" --skills-dir "$T/skills" find FIRST 2>&1)"
if printf '%s' "$OUT" | grep -q "^alpha	" && ! printf '%s' "$OUT" | grep -q "^beta	"; then
  pass
else
  fail "keyword filter wrong: $OUT"
fi
rm -rf "$T"

# --- T4: check passes when every declared skill is present ------------------
start_case "check exits 0 when every declared skill is installed"
T="$(mktemp -d)"; write_skills "$T/skills"
write_config "$T" '{"skills":["alpha","beta"],"mcp":["nx"]}'
python3 "$TD" --root "$T" --skills-dir "$T/skills" check >/dev/null 2>&1
assert_exit 0 $? "check should pass with all skills present"
rm -rf "$T"

# --- T5: check fails and names the missing declared skill -------------------
start_case "check exits non-zero and names a declared-but-missing skill"
T="$(mktemp -d)"; write_skills "$T/skills"
write_config "$T" '{"skills":["alpha","gamma"],"mcp":[]}'
OUT="$(python3 "$TD" --root "$T" --skills-dir "$T/skills" check 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "gamma" \
  && printf '%s' "$OUT" | grep -q "MISSING"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T6: check is a no-op when no discovery block is declared ----------------
start_case "check exits 0 when no discovery block is declared"
T="$(mktemp -d)"; write_skills "$T/skills"
write_config "$T" ''
OUT="$(python3 "$TD" --root "$T" --skills-dir "$T/skills" check 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "nothing to verify"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

summary