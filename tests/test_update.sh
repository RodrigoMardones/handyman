#!/usr/bin/env bash
# Updater-contract tests for the Handyman skill.
# Exercises scripts/update_harness.py against fixture harnesses: discovery,
# audit (--list), dry-run safety, and consistent updates across the config
# JSON and the role-file frontmatter.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
UPDATER="$SUITE_DIR/../handyman/scripts/update_harness.py"

echo "Updater-contract suite (test_update.sh)"

# --- fixture builders --------------------------------------------------------

# Build a minimal installed harness (local scope) in $1.
write_installed_harness() {
  root="$1"
  mkdir -p "$root/.github/agents" "$root/.claude/agents"
  cat > "$root/harness.config.json" <<'JSON'
{
  "install_mode": "local",
  "project_name": "demo",
  "project_root": ".",
  "handyman_root": null,
  "harness_workspace": ".handyman",
  "models": {
    "leader": "editor-default",
    "implementer": "Old Model",
    "reviewer": "Old Model",
    "explorer": "Old Model"
  },
  "tools": {
    "leader": ["vscode", "execute", "read", "agent", "edit", "search", "web", "browser", "todo"],
    "implementer": ["vscode", "execute", "read", "edit", "search", "todo"],
    "reviewer": ["vscode", "execute", "read", "edit", "search", "todo"],
    "explorer": ["vscode", "execute", "read", "search", "todo"]
  }
}
JSON
  cat > "$root/.github/agents/implementer.agent.md" <<'MD'
---
name: implementer
description: Implements exactly one feature.
model: Old Model
tools: [vscode, execute, read, edit, search, todo]
---

# Implementer
MD
  cat > "$root/.claude/agents/implementer.md" <<'MD'
---
name: implementer
description: Implements exactly one feature.
model: Old Model
tools: [vscode, execute, read, edit, search, todo]
---

# Implementer
MD
}

json_get() { # $1=file $2=python expression over `d`
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print($2)" "$1"
}

# --- T1: --list audits config and role files ---------------------------------
start_case "--list reports models from config and role frontmatter"
T1="$(mktemp -d)"
write_installed_harness "$T1"
OUT="$(python3 "$UPDATER" --root "$T1" --list 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "installed harness" \
  && printf '%s' "$OUT" | grep -q "implementer.*Old Model" \
  && printf '%s' "$OUT" | grep -q ".github/agents/implementer.agent.md"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$T1"

# --- T2: dry-run never writes ------------------------------------------------
start_case "--dry-run prints a diff and leaves every file untouched"
T2="$(mktemp -d)"
write_installed_harness "$T2"
BEFORE_CFG="$(cat "$T2/harness.config.json")"
BEFORE_GH="$(cat "$T2/.github/agents/implementer.agent.md")"
OUT="$(python3 "$UPDATER" --root "$T2" --dry-run --model implementer="New Model" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q '+.*New Model' \
  && [ "$BEFORE_CFG" = "$(cat "$T2/harness.config.json")" ] \
  && [ "$BEFORE_GH" = "$(cat "$T2/.github/agents/implementer.agent.md")" ]; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$T2"

# --- T3: model update hits config + both platform role files ------------------
start_case "--model updates config map and both role frontmatters"
T3="$(mktemp -d)"
write_installed_harness "$T3"
python3 "$UPDATER" --root "$T3" --model implementer="New Model" >/dev/null 2>&1
CODE=$?
CFG="$(json_get "$T3/harness.config.json" "d['models']['implementer']")"
if [ "$CODE" -eq 0 ] && [ "$CFG" = "New Model" ] \
  && grep -q '^model: New Model$' "$T3/.github/agents/implementer.agent.md" \
  && grep -q '^model: New Model$' "$T3/.claude/agents/implementer.md" \
  && grep -q '^name: implementer$' "$T3/.github/agents/implementer.agent.md"; then
  pass
else
  fail "exit=$CODE config_model=$CFG"
fi
rm -rf "$T3"

# --- T4: tools update stays consistent across surfaces ------------------------
start_case "--tools updates config list and frontmatter inline list"
T4="$(mktemp -d)"
write_installed_harness "$T4"
python3 "$UPDATER" --root "$T4" --tools implementer=vscode,read,todo >/dev/null 2>&1
CODE=$?
CFG="$(json_get "$T4/harness.config.json" "','.join(d['tools']['implementer'])")"
if [ "$CODE" -eq 0 ] && [ "$CFG" = "vscode,read,todo" ] \
  && grep -q '^tools: \[vscode, read, todo\]$' "$T4/.github/agents/implementer.agent.md" \
  && grep -q '^tools: \[vscode, read, todo\]$' "$T4/.claude/agents/implementer.md"; then
  pass
else
  fail "exit=$CODE config_tools=$CFG"
fi
rm -rf "$T4"

# --- T5: --set updates allowed top-level keys only -----------------------------
start_case "--set updates an allowed key and rejects unknown keys"
T5="$(mktemp -d)"
write_installed_harness "$T5"
python3 "$UPDATER" --root "$T5" --set project_name=renamed >/dev/null 2>&1
OK_CODE=$?
NAME="$(json_get "$T5/harness.config.json" "d['project_name']")"
python3 "$UPDATER" --root "$T5" --set bogus_key=1 >/dev/null 2>&1
BAD_CODE=$?
if [ "$OK_CODE" -eq 0 ] && [ "$NAME" = "renamed" ] && [ "$BAD_CODE" -eq 2 ]; then
  pass
else
  fail "ok_exit=$OK_CODE name=$NAME bad_exit=$BAD_CODE"
fi
rm -rf "$T5"

# --- T6: skill-repo mode updates the distributed templates ---------------------
start_case "skill repo mode updates assets templates instead"
T6="$(mktemp -d)"
mkdir -p "$T6/assets"
: > "$T6/SKILL.md"
SKILL_ROOT="$SUITE_DIR/../handyman"
cp "$SKILL_ROOT/assets/harness.config.local.template.json" "$T6/assets/"
cp "$SKILL_ROOT/assets/harness.config.global.template.json" "$T6/assets/"
cp "$SKILL_ROOT/assets/role-implementer.template.md" "$T6/assets/"
python3 "$UPDATER" --root "$T6" --model implementer="New Model" >/dev/null 2>&1
CODE=$?
LOCAL_CFG="$(json_get "$T6/assets/harness.config.local.template.json" "d['models']['implementer']")"
GLOBAL_CFG="$(json_get "$T6/assets/harness.config.global.template.json" "d['models']['implementer']")"
if [ "$CODE" -eq 0 ] && [ "$LOCAL_CFG" = "New Model" ] && [ "$GLOBAL_CFG" = "New Model" ] \
  && grep -q '^model: New Model$' "$T6/assets/role-implementer.template.md"; then
  pass
else
  fail "exit=$CODE local=$LOCAL_CFG global=$GLOBAL_CFG"
fi
rm -rf "$T6"

# --- T7: refuses to run with nothing to do or no harness -----------------------
start_case "no-op invocations and missing harnesses exit non-zero"
T7="$(mktemp -d)"
write_installed_harness "$T7"
python3 "$UPDATER" --root "$T7" >/dev/null 2>&1
NOOP_CODE=$?
EMPTY="$(mktemp -d)"
python3 "$UPDATER" --root "$EMPTY" --list >/dev/null 2>&1
EMPTY_CODE=$?
if [ "$NOOP_CODE" -eq 2 ] && [ "$EMPTY_CODE" -eq 1 ]; then
  pass
else
  fail "noop_exit=$NOOP_CODE empty_exit=$EMPTY_CODE"
fi
rm -rf "$T7" "$EMPTY"

# --- T8: --check passes when config and role files agree ---------------------
start_case "--check exits 0 when config models match the role frontmatter"
T8="$(mktemp -d)"
write_installed_harness "$T8"
OUT="$(python3 "$UPDATER" --root "$T8" --check 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "sync OK"; then
  pass
else
  fail "expected exit 0 + sync OK; exit=$CODE out=$OUT"
fi
rm -rf "$T8"

# --- T9: --check flags drift between config and role files -------------------
start_case "--check exits non-zero and reports drift when a role file diverges"
T9="$(mktemp -d)"
write_installed_harness "$T9"
# diverge the role-file model from the config without touching the config
python3 - "$T9/.github/agents/implementer.agent.md" <<'PY'
import re, sys
p = sys.argv[1]
t = open(p).read()
open(p, "w").write(re.sub(r"^model: .*$", "model: Drifted Model", t, count=1, flags=re.M))
PY
OUT="$(python3 "$UPDATER" --root "$T9" --check 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "DRIFT" \
  && printf '%s' "$OUT" | grep -q "implementer.agent.md"; then
  pass
else
  fail "expected non-zero + DRIFT report; exit=$CODE out=$OUT"
fi
rm -rf "$T9"

# --- T10: --check is read-only (writes nothing) -----------------------------
start_case "--check writes nothing (read-only audit)"
T10="$(mktemp -d)"
write_installed_harness "$T10"
BEFORE_CFG="$(cat "$T10/harness.config.json")"
BEFORE_GH="$(cat "$T10/.github/agents/implementer.agent.md")"
python3 "$UPDATER" --root "$T10" --check >/dev/null 2>&1
if [ "$BEFORE_CFG" = "$(cat "$T10/harness.config.json")" ] \
  && [ "$BEFORE_GH" = "$(cat "$T10/.github/agents/implementer.agent.md")" ]; then
  pass
else
  fail "--check modified files"
fi
rm -rf "$T10"

# --- T11: --sync reconciles role files to the config ------------------------
start_case "--sync writes config models into role files and clears the drift"
T11="$(mktemp -d)"
write_installed_harness "$T11"
# diverge the role-file model from the config
python3 - "$T11/.github/agents/implementer.agent.md" <<'PY'
import re, sys
p = sys.argv[1]; t = open(p).read()
open(p, "w").write(re.sub(r"^model: .*$", "model: Drifted", t, count=1, flags=re.M))
PY
python3 "$UPDATER" --root "$T11" --sync >/dev/null 2>&1; CODE=$?
python3 "$UPDATER" --root "$T11" --check >/dev/null 2>&1; CHECK=$?
if [ "$CODE" -eq 0 ] && [ "$CHECK" -eq 0 ] \
  && grep -q '^model: Old Model$' "$T11/.github/agents/implementer.agent.md"; then
  pass
else
  fail "exit=$CODE check=$CHECK role file not reconciled to config"
fi
rm -rf "$T11"

# --- T12: --sync --dry-run previews without writing -------------------------
start_case "--sync --dry-run previews without touching any file"
T12="$(mktemp -d)"
write_installed_harness "$T12"
python3 - "$T12/.github/agents/implementer.agent.md" <<'PY'
import re, sys
p = sys.argv[1]; t = open(p).read()
open(p, "w").write(re.sub(r"^model: .*$", "model: Drifted", t, count=1, flags=re.M))
PY
BEFORE="$(cat "$T12/.github/agents/implementer.agent.md")"
python3 "$UPDATER" --root "$T12" --sync --dry-run >/dev/null 2>&1; CODE=$?
if [ "$CODE" -eq 0 ] && [ "$BEFORE" = "$(cat "$T12/.github/agents/implementer.agent.md")" ]; then
  pass
else
  fail "exit=$CODE --sync --dry-run modified the role file"
fi
rm -rf "$T12"

summary
