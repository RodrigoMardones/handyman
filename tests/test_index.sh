#!/usr/bin/env bash
# index.md (Obsidian MOC) regenerator tests for the Handyman skill.
# Exercises dist/index_md.js against a fixture harness: OKF-reserved shape
# (no frontmatter), title, features grouped by status, backlog markdown
# links, Notes preservation, and the existence-gated markdown links.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
DIST="$SUITE_DIR/../handyman/dist"
RUN=(node "$DIST/index_md.js")

# Self-contained: build the TS entrypoint so the suite runs from a fresh
# checkout (deps installed) with no stale-dist hazard. Cheap incremental tsc.
(cd "$SUITE_DIR/../handyman" && npm run build >/dev/null 2>&1)

echo "Index-MOC suite (test_index.sh)"

# --- fixture builder ---------------------------------------------------------

write_harness() {
  root="$1"
  mkdir -p "$root/.handyman/progress" "$root/.handyman/backlog" "$root/.handyman/docs"
  cat > "$root/.handyman/feature_list.json" <<'JSON'
{
  "project": "demo",
  "config": { "project_name": "demo" },
  "features": [
    { "id": 1, "name": "alpha", "status": "done" },
    { "id": 2, "name": "beta", "status": "in_progress" },
    { "id": 3, "name": "gamma", "status": "pending" }
  ]
}
JSON
  : > "$root/.handyman/progress/current.md"
  : > "$root/.handyman/progress/history.md"
  : > "$root/.handyman/docs/architecture.md"
}

# --- I1: regenerates title and features by status, without frontmatter ------
start_case "regenerates index.md without frontmatter (OKF reserved file), title, and features by status"
T="$(mktemp -d)"; write_harness "$T"
"${RUN[@]}" --root "$T" >/dev/null 2>&1; CODE=$?
IDX="$T/.handyman/index.md"
if [ "$CODE" -eq 0 ] && [ -f "$IDX" ] \
  && [ "$(head -n 1 "$IDX")" = "# demo - Handyman Workspace" ] \
  && ! grep -q "^---$" "$IDX" \
  && grep -q "in_progress:[*][*] beta (id 2)" "$IDX" \
  && grep -q "pending:[*][*] gamma (id 3)" "$IDX" \
  && grep -q "done:[*][*] 1 closed" "$IDX"; then
  pass
else
  fail "exit=$CODE index not regenerated as expected"
fi
rm -rf "$T"

# --- I2: lists backlog reports as markdown links ----------------------------
start_case "lists existing backlog reports as relative markdown links"
T="$(mktemp -d)"; write_harness "$T"
: > "$T/.handyman/backlog/impl_beta.md"
"${RUN[@]}" --root "$T" >/dev/null 2>&1
IDX="$T/.handyman/index.md"
if grep -q "\[impl_beta\](backlog/impl_beta.md)" "$IDX" \
  && ! grep -q "\[\[" "$IDX"; then
  pass
else
  fail "backlog markdown link missing or wikilinks still emitted"
fi
rm -rf "$T"

# --- I3: preserves a ## Notes section ---------------------------------------
start_case "preserves a ## Notes section across regeneration"
T="$(mktemp -d)"; write_harness "$T"
"${RUN[@]}" --root "$T" >/dev/null 2>&1
IDX="$T/.handyman/index.md"
# Replace the generated Notes block with a custom note, then regenerate.
node -e 'const fs=require("fs");const p=process.argv[1];const lines=fs.readFileSync(p,"utf8").split("\n");const i=lines.findIndex(l=>l.trim()==="## Notes");fs.writeFileSync(p,lines.slice(0,i).join("\n")+"\n## Notes\n\nKEEP THIS NOTE\n");' "$IDX"
"${RUN[@]}" --root "$T" >/dev/null 2>&1
if grep -q "KEEP THIS NOTE" "$IDX"; then
  pass
else
  fail "## Notes content was not preserved"
fi
rm -rf "$T"

# --- I4: markdown links are gated on file existence -------------------------
start_case "emits markdown links only to files that exist"
T="$(mktemp -d)"; write_harness "$T"
"${RUN[@]}" --root "$T" >/dev/null 2>&1
IDX="$T/.handyman/index.md"
# feature-request.md is absent in the fixture -> it must not be linked.
if grep -q "(feature_list.json)" "$IDX" \
  && ! grep -q "(feature-request.md)" "$IDX"; then
  pass
else
  fail "link emission is not gated on existence"
fi
rm -rf "$T"

# --- I5: missing feature_list.json is an error ------------------------------
start_case "missing feature_list.json is an error (exit != 0)"
T="$(mktemp -d)"
mkdir -p "$T/.handyman"
"${RUN[@]}" --root "$T" >/dev/null 2>&1; CODE=$?
if [ "$CODE" -ne 0 ]; then pass; else fail "expected non-zero exit"; fi
rm -rf "$T"

# --- I6: lists sprint and current-period docs as markdown links -------------
start_case "lists docs/sprints and docs/current files as markdown links"
T="$(mktemp -d)"; write_harness "$T"
mkdir -p "$T/.handyman/docs/sprints" "$T/.handyman/docs/current"
: > "$T/.handyman/docs/sprints/sprint.2026-SP1.md"
: > "$T/.handyman/docs/current/draft-topic.md"
"${RUN[@]}" --root "$T" >/dev/null 2>&1
IDX="$T/.handyman/index.md"
if grep -q "\[sprint.2026-SP1\](docs/sprints/sprint.2026-SP1.md)" "$IDX" \
  && grep -q "\[draft-topic\](docs/current/draft-topic.md)" "$IDX"; then
  pass
else
  fail "sprint/current docs not listed: $(grep 'docs/' "$IDX")"
fi
rm -rf "$T"

summary
