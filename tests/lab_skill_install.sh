#!/usr/bin/env bash
# Consumer journey lab (NOT part of the gate: run_tests.sh lists its suites
# explicitly and this one stays a manual probe). Drives the published-package
# flow the way an external user lives it: unpack the npm tarball, scaffold a
# harness, register it from the package's dispatcher, review the fleet from a
# DIFFERENT cwd, and validate the shipped eval set — all under one mktemp with
# an isolated HANDYMAN_ROOT so the real ~/HANDYMAN is never touched.
#
# Oracle history: features 64/65/68 (npm publish, npx invocation) are archived,
# and the old probe measured a flow that no longer exists (npm install + tsc
# over the installed skill directory, expected-FAIL on steps 2-4). Rewritten
# for feature 100 to assert the journey the package advertises today. The
# package is unpacked with tar instead of `npm install <tarball>` on purpose:
# installing would fetch the vis-network dependency from the registry, and this
# lab stays offline by design (same contract as test_npm_pack.sh).
#
# Usage: bash tests/lab_skill_install.sh
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
PKG_SRC="$REPO_ROOT/handyman"
STAGING="$PKG_SRC/.pack-staging"

echo "consumer journey lab (lab_skill_install.sh)"

# pwd -P: mktemp returns a /var symlink on macOS and symlinked roots break the
# CLI entry guards (handoff 2026-07-19 §5.1).
LAB="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$LAB"' EXIT

# --- step 0: the publishable tarball ------------------------------------------
start_case "tarball available (pack:npm run when .pack-staging has none)"
TARBALL="$(ls "$STAGING"/handyman-harness-*.tgz 2>/dev/null | head -n 1 || true)"
if [ -z "$TARBALL" ]; then
  OUT="$( (cd "$PKG_SRC" && node scripts/pack_npm.mjs) 2>&1)"
  LAST="$(printf '%s\n' "$OUT" | tail -n 1)"
  TARBALL="$(printf '%s\n' "$OUT" | sed -n 's/^tarball: //p')"
  if [ "$LAST" = "status: ok" ] && [ -n "$TARBALL" ] && [ -f "$TARBALL" ]; then
    pass
  else
    fail "pack:npm last='$LAST'"
  fi
else
  pass
fi

mkdir -p "$LAB/install"
(cd "$LAB/install" && tar -xzf "$TARBALL")
PKG="$LAB/install/package"
CLI="$PKG/dist/cli.js"

# --- step 1: a project with a harness ------------------------------------------
start_case "scaffold.sh bootstraps the fixture project (bash, no build)"
PROYECTO="$LAB/proyecto"
mkdir -p "$PROYECTO"   # scaffold.sh requires the project root to exist
if bash "$PKG_SRC/scripts/scaffold.sh" local "$PROYECTO" journey >/dev/null 2>&1 \
  && [ -f "$PROYECTO/.handyman/feature_list.json" ]; then
  pass
else
  fail "scaffold left no .handyman/feature_list.json"
fi

# scaffold copies templates verbatim; naming the project is the user's fill-in
# step, and the toolBox reads project_name LIVE on every query
# (harness.config.json first, then feature_list.json).
node -e 'const fs=require("fs");for (const p of process.argv.slice(1)){const d=JSON.parse(fs.readFileSync(p,"utf8"));if(d.project_name)d.project_name="journey";if(d.project)d.project="journey";if(d.config&&d.config.project_name)d.config.project_name="journey";fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");}' \
  "$PROYECTO/harness.config.json" "$PROYECTO/.handyman/feature_list.json"

# --- step 2: register from the unpacked package --------------------------------
FLEET="$LAB/handyman-root"
start_case "cli.js toolbox register records the project in the registry"
OUT="$(HANDYMAN_ROOT="$FLEET" node "$CLI" toolbox register "$PROYECTO" 2>&1)"
CODE=$?
if [ "$CODE" -eq 0 ] && [ -f "$FLEET/registry.json" ] \
  && [ "$(_json "$FLEET/registry.json" str harnesses.0.project_root)" = "$PROYECTO" ]; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi

# --- step 3: review the fleet from ANOTHER cwd ---------------------------------
mkdir -p "$LAB/elsewhere"

start_case "toolbox status from another cwd reports the registered harness"
OUT="$(cd "$LAB/elsewhere" && HANDYMAN_ROOT="$FLEET" node "$CLI" toolbox status 2>&1)"
CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -qF "$PROYECTO"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi

start_case "toolbox list from another cwd shows the live project name"
OUT="$(cd "$LAB/elsewhere" && HANDYMAN_ROOT="$FLEET" node "$CLI" toolbox list 2>&1)"
CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "journey"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi

# --- step 4: the shipped eval set validates ------------------------------------
start_case "cli.js evals validate passes against the shipped eval set"
OUT="$(cd "$LAB/elsewhere" && node "$CLI" evals validate 2>&1)"
CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "validate: OK"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi

summary
