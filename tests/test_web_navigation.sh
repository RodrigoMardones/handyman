#!/usr/bin/env bash
# Shared global navigation contract for apps/web (feature 74).
# Structural only: no server, browser, or external network.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
APP_NAV="$WEB_DIR/components/AppNav.tsx"
APP_NAV_CSS="$WEB_DIR/components/AppNav.module.css"
PALETTE="$WEB_DIR/lib/palette.ts"

echo "apps/web shared navigation suite (test_web_navigation.sh)"

start_case "AppNav component and stylesheet exist"
if [ -f "$APP_NAV" ] && [ -f "$APP_NAV_CSS" ]; then
  pass
else
  fail "apps/web/components/AppNav.tsx or AppNav.module.css is missing"
fi

start_case "five global destinations are centralized once and in order"
if [ -f "$APP_NAV" ]; then
  OUT="$(node -e '
const fs = require("fs");
const source = fs.readFileSync(process.argv[1], "utf8");
const block = source.match(/APP_NAV_ITEMS\s*=\s*\[([\s\S]*?)\]\s*as const/);
const expected = [
  ["Fleet", "/fleet"],
  ["Activity", "/timeline"],
  ["Find", "/search"],
  ["Draft", "/intake"],
  ["Ask", "/ask"],
];
if (!block) process.exit(1);
const items = [...block[1].matchAll(/label:\s*"([^"]+)"\s*,\s*href:\s*"([^"]+)"/g)]
  .map((match) => [match[1], match[2]]);
if (JSON.stringify(items) !== JSON.stringify(expected)) {
  console.log(JSON.stringify(items));
  process.exit(1);
}
' "$APP_NAV" 2>&1)"
  CODE=$?
  if [ "$CODE" -eq 0 ]; then pass; else fail "destination data mismatch: $OUT"; fi
else
  fail "AppNav.tsx is missing"
fi

start_case "AppNav derives separate desktop and mobile lists from one source"
OUT="$(node -e '
const fs = require("fs");
const source = fs.readFileSync(process.argv[1], "utf8");
const detailsStart = source.indexOf("<details");
const detailsEnd = source.indexOf("</details>", detailsStart);
const desktop = source.indexOf("<ul className={styles.desktopLinks}>");
const mobile = source.indexOf("<ul className={styles.mobileLinks}>");
const mapCount = (source.match(/APP_NAV_ITEMS\.map/g) || []).length;
const renderCount = (source.match(/\{renderLinks\(\)\}/g) || []).length;
if (
  detailsStart < 0 ||
  detailsEnd < 0 ||
  desktop < 0 ||
  desktop > detailsStart ||
  mobile < detailsStart ||
  mobile > detailsEnd ||
  mapCount !== 1 ||
  renderCount !== 2
) process.exit(1);
' "$APP_NAV" 2>&1)"
CODE=$?
if [ "$CODE" -eq 0 ] \
  && grep -q 'href="/fleet"' "$APP_NAV" \
  && grep -q '>toolBox<' "$APP_NAV" \
  && grep -q '<summary[^>]*>Menu</summary>' "$APP_NAV" \
  && grep -q 'activeItem' "$APP_NAV" \
  && grep -q 'currentKind' "$APP_NAV" \
  && grep -q '"page" | "location"' "$APP_NAV" \
  && [ "$(grep -o '<ul' "$APP_NAV" | wc -l | tr -d ' ')" -eq 2 ] \
  && [ "$(grep -o 'aria-current=' "$APP_NAV" | wc -l | tr -d ' ')" -eq 1 ] \
  && [ "$(grep -o '<ToolboxShell' "$APP_NAV" | wc -l | tr -d ' ')" -eq 1 ] \
  && ! grep -qE 'usePathname|addEventListener|"use client"' "$APP_NAV"; then
  pass
else
  fail "desktop/mobile list structure, shared item mapping, active semantics, native Menu, or single ToolboxShell contract is missing: $OUT"
fi

start_case "seven pages adopt AppNav with one active global destination"
PAGES=(
  "$WEB_DIR/app/fleet/page.tsx:Fleet:page"
  "$WEB_DIR/app/timeline/page.tsx:Activity:page"
  "$WEB_DIR/app/search/page.tsx:Find:page"
  "$WEB_DIR/app/intake/page.tsx:Draft:page"
  "$WEB_DIR/app/ask/page.tsx:Ask:page"
  "$WEB_DIR/app/harness/[name]/page.tsx:Fleet:location"
  "$WEB_DIR/app/harness/[name]/new/page.tsx:Fleet:location"
)
PAGE_FAILURES=""
for entry in "${PAGES[@]}"; do
  page=${entry%%:*}
  rest=${entry#*:}
  active=${rest%%:*}
  kind=${rest#*:}
  if [ ! -f "$page" ] \
    || ! grep -q 'components/AppNav' "$page" \
    || ! grep -q '<AppNav' "$page" \
    || ! grep -q 'harnesses=' "$page" \
    || ! grep -q "activeItem=\"$active\"" "$page" \
    || ! grep -q "currentKind=\"$kind\"" "$page" \
    || grep -qE '<nav|navLinks|<ToolboxShell' "$page"; then
    PAGE_FAILURES="$PAGE_FAILURES ${page#"$REPO_ROOT/"}"
  fi
done
if [ -z "$PAGE_FAILURES" ]; then
  pass
else
  fail "pages missing shared-nav contract:$PAGE_FAILURES"
fi

start_case "page styles no longer define duplicated global navigation selectors"
PAGE_CSS=(
  "$WEB_DIR/app/fleet/page.module.css"
  "$WEB_DIR/app/timeline/page.module.css"
  "$WEB_DIR/app/search/page.module.css"
  "$WEB_DIR/app/intake/page.module.css"
  "$WEB_DIR/app/ask/page.module.css"
  "$WEB_DIR/app/harness/[name]/page.module.css"
)
CSS_FAILURES=""
for css in "${PAGE_CSS[@]}"; do
  if grep -qE '^\.(nav|brand|brandMark|brandName|navLinks)([,{[:space:]]|$)' "$css"; then
    CSS_FAILURES="$CSS_FAILURES ${css#"$REPO_ROOT/"}"
  fi
done
if [ -z "$CSS_FAILURES" ]; then
  pass
else
  fail "duplicated navigation CSS remains:$CSS_FAILURES"
fi

start_case "harness routes retain breadcrumb and contextual Add feature"
HARNESS_PAGE="$WEB_DIR/app/harness/[name]/page.tsx"
NEW_PAGE="$WEB_DIR/app/harness/[name]/new/page.tsx"
if grep -q 'aria-label="Breadcrumb"' "$HARNESS_PAGE" \
  && grep -q '>Add feature</a>' "$HARNESS_PAGE" \
  && grep -q 'aria-label="Breadcrumb"' "$NEW_PAGE" \
  && grep -q '>New feature</li>' "$NEW_PAGE" \
  && grep -q 'href={`/harness/${encodeURIComponent(name)}`}' "$NEW_PAGE"; then
  pass
else
  fail "Harness/Add feature/New feature context is missing"
fi

start_case "AppNav CSS mutually switches desktop links and mobile details"
OUT="$(node -e '
const fs = require("fs");
const source = fs.readFileSync(process.argv[1], "utf8");
const mediaAt = source.indexOf("@media (max-width: 760px)");
if (mediaAt < 0 || source.includes("display: contents")) process.exit(1);
const desktop = source.slice(0, mediaAt);
const mobile = source.slice(mediaAt);
const body = (part, selector) => {
  const match = part.match(new RegExp("\\." + selector + "\\s*\\{([^}]*)\\}"));
  return match ? match[1] : "";
};
if (
  !/display:\s*flex/.test(body(desktop, "desktopLinks")) ||
  !/display:\s*none/.test(body(desktop, "mobileMenu")) ||
  !/display:\s*none/.test(body(mobile, "desktopLinks")) ||
  !/display:\s*block/.test(body(mobile, "mobileMenu")) ||
  !/\.mobileMenu\[open\]\s+\.mobileLinks\s*\{/.test(mobile)
) process.exit(1);
' "$APP_NAV_CSS" 2>&1)"
CODE=$?
if [ "$CODE" -eq 0 ] \
  && grep -q 'white-space:[[:space:]]*nowrap' "$APP_NAV_CSS" \
  && grep -q 'flex-wrap:[[:space:]]*nowrap' "$APP_NAV_CSS" \
  && [ "$(grep -c 'min-height:[[:space:]]*44px' "$APP_NAV_CSS")" -ge 2 ] \
  && grep -q ':focus-visible' "$APP_NAV_CSS"; then
  pass
else
  fail "desktop/mobile visibility, no-display-contents, nowrap, 44px targets, or focus-visible contract is missing: $OUT"
fi

start_case "command palette exposes the same five global labels and hrefs"
OUT="$(node -e '
const fs = require("fs");
const source = fs.readFileSync(process.argv[1], "utf8");
const block = source.match(/PALETTE_VIEWS[^=]*=\s*\[([\s\S]*?)\];/);
const expected = [
  ["Fleet", "/fleet"],
  ["Activity", "/timeline"],
  ["Find", "/search"],
  ["Draft", "/intake"],
  ["Ask", "/ask"],
];
if (!block) process.exit(1);
const items = [...block[1].matchAll(/label:\s*"(?:go to )?([^"]+)"[\s\S]*?href:\s*"([^"]+)"/g)]
  .map((match) => [match[1], match[2]]);
if (JSON.stringify(items) !== JSON.stringify(expected)) {
  console.log(JSON.stringify(items));
  process.exit(1);
}
' "$PALETTE" 2>&1)"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "palette destination mismatch: $OUT"; fi

start_case "ToolboxShell keeps exactly one document keydown listener"
LISTENER_COUNT="$(grep -Rho "document\.addEventListener(\"keydown\"" \
  "$WEB_DIR/components" "$WEB_DIR/app" "$WEB_DIR/lib" | wc -l | tr -d ' ')"
if [ "$LISTENER_COUNT" -eq 1 ]; then
  pass
else
  fail "expected one document keydown listener, found $LISTENER_COUNT"
fi

summary