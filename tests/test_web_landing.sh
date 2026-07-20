#!/usr/bin/env bash
# apps/web landing page tests (feature toolbox_next_landing). Structural,
# not a build: pnpm --filter @handyman/web build is deliberately kept out of
# this suite (too slow for the default run_tests.sh loop; verified manually
# and documented in the implementer's backlog report). Portable on macOS
# bash 3.2: the em-dash/en-dash scan uses node (the sole runtime this repo
# already requires) instead of grep -P, which macOS's grep does not support.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
PAGE="$WEB_DIR/app/page.tsx"

echo "apps/web landing suite (test_web_landing.sh)"

# --- TWL1: the landing page file exists ---------------------------------------
start_case "apps/web/app/page.tsx exists"
if [ -f "$PAGE" ]; then
  pass
else
  fail "missing $PAGE"
fi

# --- TWL2: zero em-dashes (U+2014) or en-dashes (U+2013) across apps/web ------
start_case "apps/web has zero em-dashes (U+2014) and zero en-dashes (U+2013)"
DASH_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const root = process.argv[1];
const skipDirs = new Set(["node_modules", ".next"]);
const textExt = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".md", ".mjs", ".cjs"]);
let hits = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    if (!textExt.has(path.extname(entry.name))) continue;
    const full = path.join(dir, entry.name);
    const text = fs.readFileSync(full, "utf8");
    text.split("\n").forEach((line, i) => {
      if (line.indexOf("—") !== -1 || line.indexOf("–") !== -1) {
        hits.push(full + ":" + (i + 1));
      }
    });
  }
}
walk(root);
if (hits.length) {
  console.log(hits.join("\n"));
  process.exit(1);
}
process.exit(0);
' "$WEB_DIR" 2>&1)"
DASH_CODE=$?
if [ "$DASH_CODE" -eq 0 ]; then
  pass
else
  fail "em-dash or en-dash found: $DASH_OUT"
fi

# --- TWL3: page.tsx uses at least 8 <section markers (acceptance floor) ------
start_case "page.tsx contains at least 8 <section occurrences"
if [ -f "$PAGE" ]; then
  SECTION_COUNT="$(grep -o '<section' "$PAGE" | wc -l | tr -d ' ')"
  if [ "$SECTION_COUNT" -ge 8 ]; then
    pass
  else
    fail "found $SECTION_COUNT <section occurrences, need at least 8"
  fi
else
  fail "missing $PAGE"
fi

summary
