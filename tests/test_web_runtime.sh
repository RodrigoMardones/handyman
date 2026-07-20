#!/usr/bin/env bash
# apps/web runtime tests (feature toolbox_next_runtime_events). Structural +
# behavior of the pure change hub (lib/changeHub.ts), the exact mirror of
# toolbox_serve.ts's armWatchers/onFsEvent/broadcast closure. The behavior
# check transpiles the hub with the project's own typescript and drives it
# with injected fakes: no fs, no network, no Next build (same discipline as
# the fleetHtml/harnessHtml renderer suites).
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
CHANGE_HUB="$WEB_DIR/lib/changeHub.ts"
RUNTIME="$WEB_DIR/lib/runtime.ts"
INSTRUMENTATION="$WEB_DIR/instrumentation.ts"
EVENTS_ROUTE="$WEB_DIR/app/events/route.ts"
STATE_ROUTE="$WEB_DIR/app/api/state/route.ts"
PROXY="$WEB_DIR/proxy.ts"

echo "apps/web runtime suite (test_web_runtime.sh)"

# --- TWR1: the runtime files exist -------------------------------------------
start_case "lib/changeHub.ts + lib/runtime.ts + instrumentation.ts exist"
if [ -f "$CHANGE_HUB" ] && [ -f "$RUNTIME" ] && [ -f "$INSTRUMENTATION" ]; then
  pass
else
  fail "missing runtime files"
fi

start_case "app/events/route.ts + app/api/state/route.ts exist (native SSE + state)"
if [ -f "$EVENTS_ROUTE" ] && [ -f "$STATE_ROUTE" ]; then
  pass
else
  fail "missing route handlers"
fi

# --- TWR2: strangler wiring + single-process discipline ----------------------
# Feature 50 removed proxy.ts's route manifest along with the Node upstream it
# used to guard; proxy.ts is now the DNS-rebinding host guard and nothing else.
start_case "proxy.ts is the host guard only (no upstream, no route manifest)"
if grep -q 'hostAllowed' "$PROXY" && grep -q '403' "$PROXY" \
  && ! grep -q 'NEXT_HANDLED\|TOOLBOX_UPSTREAM\|fetch(' "$PROXY"; then
  pass
else
  fail "proxy.ts still carries strangler forwarding or a route manifest"
fi

start_case "route handlers are force-dynamic and the events stream mirrors serve framing"
if grep -q 'force-dynamic' "$EVENTS_ROUTE" && grep -q 'force-dynamic' "$STATE_ROUTE" \
  && grep -q 'retry: 2000' "$EVENTS_ROUTE" \
  && grep -q '"type":"change"' "$EVENTS_ROUTE" \
  && grep -q ': keepalive' "$EVENTS_ROUTE"; then
  pass
else
  fail "route handlers missing force-dynamic or the serve SSE framing"
fi

start_case "runtime singleton lives on globalThis (HMR-safe) and arms watchers"
if grep -q 'globalThis' "$RUNTIME" && grep -q 'armWatchers()' "$RUNTIME" \
  && grep -q 'NEXT_RUNTIME' "$INSTRUMENTATION"; then
  pass
else
  fail "runtime singleton or instrumentation wiring missing"
fi

# --- TWR3: change hub behavior (transpiled pure, injected fakes) -------------
start_case "changeHub arms/debounces/re-arms exactly like the serve closure"
HUB_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const src = path.join(process.argv[1], "apps/web/lib/changeHub.ts");
const code = fs.readFileSync(src, "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "changeHub.test." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
const { createChangeHub } = require(tmp);

const fails = [];
function expect(name, ok) { if (!ok) fails.push(name); }

let targets = ["/hroot", "/ws-a"];
const watched = [];   // live watchers
const armed = [];     // every watchTarget call
let onEventCb = null;
const hub = createChangeHub({
  debounceMs: 5,
  listTargets: () => [...targets],
  watchTarget: (target, onEvent) => {
    onEventCb = onEvent;
    const w = { target, closed: false, close() { this.closed = true; } };
    watched.push(w);
    armed.push(target);
    return w;
  },
});

hub.armWatchers();
expect("arms one watcher per target", armed.length === 2);
hub.armWatchers();
expect("same target set does not re-arm", armed.length === 2);

let ticks = 0;
const unsubscribe = hub.subscribe(() => { ticks += 1; });
expect("subscriberCount reflects the subscription", hub.subscriberCount() === 1);

// A burst of watcher events must collapse into ONE broadcast (debounce).
onEventCb(); onEventCb(); onEventCb();
setTimeout(() => {
  expect("burst debounces to a single broadcast", ticks === 1);

  // Registry change: broadcast re-arms with the new target set.
  targets = ["/hroot", "/ws-a", "/ws-b"];
  onEventCb();
  setTimeout(() => {
    expect("second quiet period broadcasts again", ticks === 2);
    expect("re-arm picked up the new target", armed.length === 5 && armed.includes("/ws-b"));
    expect("old watchers were closed on re-arm", watched.slice(0, 2).every((w) => w.closed));

    unsubscribe();
    onEventCb();
    setTimeout(() => {
      expect("unsubscribed listener stops receiving", ticks === 2);
      hub.close();
      expect("close closes every live watcher", watched.every((w) => w.closed));
      fs.unlinkSync(tmp);
      if (fails.length) { console.log("FAILED: " + fails.join("; ")); process.exit(1); }
      process.exit(0);
    }, 20);
  }, 20);
}, 20);
' "$REPO_ROOT" 2>&1)"
HUB_CODE=$?
if [ "$HUB_CODE" -eq 0 ]; then pass; else fail "changeHub behavior: $HUB_OUT"; fi

# --- TWR4: pages read state by direct call (no upstream fetch) ---------------
# buildState is loaded at runtime by lib/toolboxState.ts (the handyman CLI
# package must never be bundled: import.meta.url asset resolution), so the
# pages call getBuildState() instead of fetching the upstream /api/state.
start_case "/fleet and /harness/[name] call buildState directly (no upstream fetch)"
FLEET_PAGE="$WEB_DIR/app/fleet/page.tsx"
HARNESS_PAGE="$WEB_DIR/app/harness/[name]/page.tsx"
TOOLBOX_STATE="$WEB_DIR/lib/toolboxState.ts"
if [ -f "$TOOLBOX_STATE" ] \
  && grep -q 'getBuildState' "$FLEET_PAGE" && grep -q 'getBuildState' "$HARNESS_PAGE" \
  && ! grep -q 'fetch(`${UPSTREAM}/api/state`' "$FLEET_PAGE" \
  && ! grep -q 'fetch(`${UPSTREAM}/api/state`' "$HARNESS_PAGE"; then
  pass
else
  fail "pages still fetch the upstream instead of calling buildState"
fi

summary
