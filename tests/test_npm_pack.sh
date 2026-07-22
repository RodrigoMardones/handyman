#!/usr/bin/env bash
# Packaging-contract suite for the npm `handyman-harness` tarball (feature 64).
# Builds the staging bundle via handyman/scripts/pack_npm.mjs, then asserts the
# tarball inventory (no .env, no workspace:*, 12 verbs + dispatcher, no TS
# sources) and the outside-the-monorepo smoke contract: the bundled dist runs
# against an empty harness workspace with no node_modules at all. Offline by
# design — `npm pack` never touches the registry.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
PKG_DIR="$SUITE_DIR/../handyman"

echo "npm pack suite (test_npm_pack.sh)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

start_case "pack:npm builds the staging tarball (status: ok)"
OUT="$( (cd "$PKG_DIR" && node scripts/pack_npm.mjs) 2>&1)"
CODE=$?
LAST="$(printf '%s\n' "$OUT" | tail -n 1)"
if [ "$CODE" -eq 0 ] && [ "$LAST" = "status: ok" ]; then
  pass
else
  fail "exit=$CODE last='$LAST'"
fi

TARBALL="$(printf '%s\n' "$OUT" | sed -n 's/^tarball: //p')"

start_case "tarball exists at the reported path"
if [ -n "$TARBALL" ] && [ -f "$TARBALL" ]; then pass; else fail "path='$TARBALL'"; fi

LISTING="$(tar -tzf "$TARBALL")"

start_case "tarball leaks no .env"
if printf '%s\n' "$LISTING" | grep -q "\.env"; then fail "found .env entry"; else pass; fi

start_case "tarball ships the 13 verbs plus the cli dispatcher"
MISSING=""
for v in cli backlog evals feature index_md mcp metrics preflight sprint toolbox \
         tools_discovery update_harness upgrade_harness validate_harness; do
  printf '%s\n' "$LISTING" | grep -qx "package/dist/$v.js" || MISSING="$MISSING $v"
done
if [ -z "$MISSING" ]; then pass; else fail "missing:$MISSING"; fi

start_case "tarball ships no TypeScript sources"
if printf '%s\n' "$LISTING" | grep -q "\.ts$"; then fail "found .ts entry"; else pass; fi

(cd "$TMP" && tar -xzf "$TARBALL")
MANIFEST="$TMP/package/package.json"

start_case "publish manifest: handyman-harness, not private, bin dist/cli.js"
NAME="$(_json "$MANIFEST" str name)"
PRIV="$(_json "$MANIFEST" str private)"
BIN="$(_json "$MANIFEST" str bin.handyman)"
if [ "$NAME" = "handyman-harness" ] && [ -z "$PRIV" ] && [ "$BIN" = "dist/cli.js" ]; then
  pass
else
  fail "name=$NAME private=$PRIV bin=$BIN"
fi

start_case "publish manifest: version tracks the repo package and left 2.1.1 behind"
V="$(_json "$MANIFEST" str version)"
RV="$(_json "$PKG_DIR/package.json" str version)"
if [ "$V" = "$RV" ] && [ "$V" != "2.1.1" ]; then pass; else fail "version=$V repo=$RV"; fi

start_case "publish manifest: no workspace:* dependencies"
if grep -q "workspace:" "$MANIFEST"; then fail "workspace:* survived"; else pass; fi

start_case "publish manifest: author is Rodrigo Mardones"
AUTHOR="$(_json "$MANIFEST" str author)"
if [ "$AUTHOR" = "Rodrigo Mardones" ]; then pass; else fail "author='$AUTHOR'"; fi

# Deployment attribution guard. Functional identifiers survive on purpose:
# `.claude/agents` platform paths and the Anthropic-wire-format adapter in
# dist/ (env keys, endpoints - the GLM Coding Plan speaks that protocol).
# What must never ship: attribution/branding markers anywhere, and any
# `anthropic` mention in the human-facing files (assets, README, NOTICE,
# LICENSE, manifest).
start_case "tarball carries no attribution strings; human-facing files clean"
ATTR="$(grep -riEl 'co-authored-by|noreply@anthropic|Claude (Sonnet|Opus|Haiku|Fable)' "$TMP/package" 2>/dev/null || true)"
DOCS="$(grep -riEl 'anthropic' "$TMP/package/assets" "$TMP/package/README.md" "$TMP/package/NOTICE" "$TMP/package/LICENSE" "$MANIFEST" 2>/dev/null || true)"
if [ -z "$ATTR" ] && [ -z "$DOCS" ]; then pass; else fail "attribution:$ATTR docs:$DOCS"; fi

# Outside-the-monorepo smoke: empty workspace, zero node_modules next to it.
APP="$TMP/app"
mkdir -p "$APP/.handyman"
printf '{\n  "project": "smoke",\n  "features": []\n}\n' > "$APP/.handyman/feature_list.json"

start_case "bundled feature.js ready: drained backlog exits 3"
FOUT="$(cd "$APP" && node "$TMP/package/dist/feature.js" ready 2>&1)"
CODE=$?
assert_exit 3 "$CODE" "feature ready on empty workspace"

start_case "dispatcher cli.js feature ready: identical contract"
DOUT="$(cd "$APP" && node "$TMP/package/dist/cli.js" feature ready 2>&1)"
CODE=$?
if [ "$CODE" -eq 3 ] && [ "$DOUT" = "$FOUT" ]; then pass; else fail "exit=$CODE"; fi

start_case "dispatcher: no args and unknown verb both exit 2"
(cd "$APP" && node "$TMP/package/dist/cli.js" >/dev/null 2>&1)
C1=$?
(cd "$APP" && node "$TMP/package/dist/cli.js" nope >/dev/null 2>&1)
C2=$?
if [ "$C1" -eq 2 ] && [ "$C2" -eq 2 ]; then pass; else fail "noargs=$C1 unknown=$C2"; fi

start_case "bundled toolbox.js resolves its core import (usage exits 0)"
(cd "$APP" && node "$TMP/package/dist/toolbox.js" >/dev/null 2>&1)
CODE=$?
assert_exit 0 "$CODE" "toolbox usage"

summary
