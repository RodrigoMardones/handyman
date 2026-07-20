#!/usr/bin/env bash
# Lab probe (NOT part of the gate: run_tests.sh lists its suites explicitly and
# this one is report-only). Simulates what an external user receives today from
# `npx skills add RodrigoMardones/handyman`: the handyman/ directory alone,
# without node_modules/ and without dist/ (gitignored), and reports which of the
# four steps of the advertised flow work.
#
# This is the oracle for features 64 (publish handyman-harness to npm) and 65
# (SKILL.md invokes npx): when they land, steps 2-4 must flip to OK — rerun this
# and update the expectations below.
#
# Usage: bash tests/lab_skill_install.sh
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
# pwd -P: mktemp returns a /var symlink on macOS and symlinked roots break the
# CLI entry guards (handoff 2026-07-19 §5.1).
LAB="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$LAB"' EXIT

INSTALL="$LAB/handyman-skill-install"
cp -R "$REPO_ROOT/handyman" "$INSTALL"
rm -rf "$INSTALL/node_modules" "$INSTALL/dist"

step() { printf '\n== %s ==\n' "$1"; }
report() { printf -- '-> %s\n' "$1"; }

step "1. bootstrap sin build: scripts/scaffold.sh"
mkdir -p "$LAB/proyecto"
if (cd "$INSTALL" && bash scripts/scaffold.sh local "$LAB/proyecto" >/dev/null 2>&1) \
  && [ -f "$LAB/proyecto/.handyman/feature_list.json" ]; then
  report "OK: el scaffold funciona con bash puro (unica pieza ejecutable hoy)"
else
  report "FAIL: el scaffold dejo de ser autonomo — REGRESION, esto hoy funciona"
fi

step "2. npm install (deps del paquete)"
if (cd "$INSTALL" && npm install --no-audit --no-fund >/dev/null 2>&1); then
  report "OK: las deps instalan fuera del monorepo (feature 64 aterrizada?)"
else
  report "FAIL esperado hoy: EUNSUPPORTEDPROTOCOL workspace:* (@handyman/toolbox-core)"
fi

step "3. build (tsc -b)"
if (cd "$INSTALL" && npm exec --no -- tsc -b >/dev/null 2>&1); then
  report "OK: compila standalone"
else
  report "FAIL esperado hoy: sin node_modules no hay typescript; tsconfig referencia ../packages/toolbox-core"
  report "TRAMPA: 'npx tsc' a secas instala el paquete equivocado tsc@2.0.4 (deprecado, no es TypeScript)"
fi

step "4. verbos del CLI (node dist/feature.js ready)"
if (cd "$INSTALL" && node dist/feature.js ready >/dev/null 2>&1); then
  report "OK: los verbos que SKILL.md ordena existen y corren"
else
  report "FAIL esperado hoy: no hay dist/ (gitignoreado) — los ~30 comandos 'node dist/*.js' de SKILL.md/references estan rotos post-install"
fi

printf '\nResumen: hoy solo el paso 1 debe estar OK. Features 64-65 deben voltear 2-4.\n'
