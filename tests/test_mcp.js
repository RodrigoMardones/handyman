#!/usr/bin/env node
/*
 * handyman-mcp-server tests (dist, black-box).
 *
 * Two layers:
 *   - Protocol: spawn dist/mcp.js over stdio and speak real JSON-RPC
 *     (initialize -> tools/list -> resources/templates/list) so the suite
 *     proves the wire surface, not just the handlers.
 *   - Handlers: import dist/mcp.js and drive the exported functions against
 *     throwaway fixture harnesses (same shape test_feature.sh uses).
 * Covered:
 *   M1  tools/list exposes exactly the 11 contract tools
 *   M2  resources/templates/list exposes docs/* and current
 *   M3  feature_close REFUSES the close on a red verifier (state intact)
 *   M4  feature_close closes on a green verifier (history appended)
 *   M5  harness_list reads $HANDYMAN_ROOT/registry.json
 *   M6  feature_next reports claimable work / drained backlog
 *   M7  report_write writes house-frontmatter reports into backlog/
 *   M8  resolveProject rejects unregistered names with an actionable error
 *   M9  feature_start marks a feature in_progress (single-in_progress enforced)
 *   M10 feature_log appends a bullet to the ## Log section
 *   M11 feature_next_step sets the ## Next Step section
 *   M12 sprint_status reports the open period and its features
 *   M13 upgrade_check reports harness version drift read-only
 *
 * Exit code 0 when all pass, 1 otherwise.
 */
"use strict";

const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const DIST = path.join(__dirname, "..", "handyman", "dist");
const MCP = path.join(DIST, "mcp.js");

let RUN = 0;
let FAILED = 0;
function check(name, ok, detail) {
  RUN += 1;
  if (ok) {
    console.log(`  PASS ${name}`);
  } else {
    FAILED += 1;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}

// --- fixtures ---------------------------------------------------------------

function writeHarness(root) {
  fs.mkdirSync(path.join(root, ".handyman", "progress"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".handyman", "feature_list.json"),
    JSON.stringify({
      project: "t",
      features: [
        { id: 1, name: "a", status: "pending" },
        { id: 2, name: "b", status: "pending", depends_on: [1] },
      ],
    }),
  );
  fs.writeFileSync(path.join(root, ".handyman", "progress", "current.md"), "");
  fs.writeFileSync(path.join(root, ".handyman", "progress", "history.md"), "");
}

function writeVerifier(file, exitCode) {
  fs.writeFileSync(file, `#!/usr/bin/env bash\nexit ${exitCode}\n`);
  fs.chmodSync(file, 0o755);
}

function statusOf(root, name) {
  const data = JSON.parse(fs.readFileSync(path.join(root, ".handyman", "feature_list.json"), "utf-8"));
  return (data.features.find((f) => f.name === name) || {}).status || "";
}

// --- minimal JSON-RPC client over stdio -------------------------------------

function rpcSession(requests, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [MCP], { cwd, stdio: ["pipe", "pipe", "ignore"] });
    const responses = [];
    let buffer = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("mcp server timed out"));
    }, 30000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      let idx = buffer.indexOf("\n");
      while (idx !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) {
          responses.push(JSON.parse(line));
        }
        idx = buffer.indexOf("\n");
      }
      if (responses.length >= requests.filter((r) => r.id !== undefined).length) {
        clearTimeout(timer);
        child.kill();
        resolvePromise(responses);
      }
    });
    child.on("error", reject);
    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
  });
}

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test_mcp", version: "0.0.0" },
  },
};
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };

// --- suite ------------------------------------------------------------------

async function main() {
  const mcp = await import(pathToFileURL(MCP).href);
  console.log("handyman MCP suite (test_mcp.js)");

  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-"));
  writeHarness(ROOT);

  // M1/M2 — wire surface over real stdio JSON-RPC
  {
    const responses = await rpcSession(
      [
        INIT,
        INITIALIZED,
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
        { jsonrpc: "2.0", id: 3, method: "resources/templates/list" },
      ],
      ROOT,
    );
    const tools = (responses.find((r) => r.id === 2) || {}).result?.tools ?? [];
    const names = tools.map((t) => t.name).sort();
    check(
      "tools/list exposes the 11 contract tools",
      JSON.stringify(names) ===
        JSON.stringify([
          "feature_close",
          "feature_log",
          "feature_next",
          "feature_next_step",
          "feature_start",
          "harness_list",
          "preflight",
          "report_write",
          "sprint_status",
          "upgrade_check",
          "verify",
        ]),
      `got: ${names.join(", ")}`,
    );
    const templates = (responses.find((r) => r.id === 3) || {}).result?.resourceTemplates ?? [];
    const uris = templates.map((t) => t.uriTemplate).sort();
    check(
      "resource templates expose current and docs/*",
      uris.length === 2 && uris[0].endsWith("/current") && uris[1].includes("/docs/"),
      `got: ${uris.join(", ")}`,
    );
  }

  // Claim feature 'a' so close cases operate on an in_progress feature.
  execFileSync(process.execPath, [path.join(DIST, "feature.js"), "--root", ROOT, "start", "a", "--no-preflight"], {
    stdio: "ignore",
  });
  const project = mcp.resolveProject(ROOT);

  // M3 — red verifier refuses the close
  {
    const red = path.join(ROOT, "fail.sh");
    writeVerifier(red, 1);
    const result = mcp.featureClose(project, "a", red);
    check(
      "feature_close refuses on a red verifier and keeps in_progress",
      result.exit !== 0 && statusOf(ROOT, "a") === "in_progress",
      `exit=${result.exit} status=${statusOf(ROOT, "a")}`,
    );
  }

  // M4 — green verifier closes and appends history
  {
    const green = path.join(ROOT, "ok.sh");
    writeVerifier(green, 0);
    const result = mcp.featureClose(project, "a", green);
    const history = fs.readFileSync(path.join(ROOT, ".handyman", "progress", "history.md"), "utf-8");
    check(
      "feature_close closes on a green verifier and appends history",
      result.exit === 0 && statusOf(ROOT, "a") === "done" && history.includes("a"),
      `exit=${result.exit} status=${statusOf(ROOT, "a")}`,
    );
  }

  // M5 — harness_list reads the registry at $HANDYMAN_ROOT
  {
    const HROOT = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-root-"));
    fs.writeFileSync(
      path.join(HROOT, "registry.json"),
      JSON.stringify({ version: 1, harnesses: [{ project_root: ROOT, registered: "2026-07-21" }] }),
    );
    process.env.HANDYMAN_ROOT = HROOT;
    const listed = mcp.harnessList();
    check(
      "harness_list returns the registered harness with harness=true",
      listed.handyman_root === HROOT &&
        listed.harnesses.length === 1 &&
        listed.harnesses[0].root === ROOT &&
        listed.harnesses[0].harness === true,
      JSON.stringify(listed),
    );
    // M8 — unregistered names fail with the registered alternatives
    let message = "";
    try {
      mcp.resolveProject("nope");
    } catch (e) {
      message = String(e.message || e);
    }
    check(
      "resolveProject rejects an unregistered name actionably",
      message.includes("not registered") && message.includes(path.basename(ROOT)),
      message,
    );
    fs.rmSync(HROOT, { recursive: true, force: true });
  }

  // M6 — feature_next: 'b' unblocked by a's close; drained after closing b
  {
    const next = mcp.featureNext(project);
    check(
      "feature_next lists 'b' once its dependency closed",
      next.drained === false && next.ready.some((f) => f.name === "b"),
      JSON.stringify(next),
    );
  }

  // M7 — report_write writes house frontmatter
  {
    const written = mcp.reportWrite(project, "impl", "a", "## What\n\nDid the thing.");
    const text = fs.readFileSync(written.path, "utf-8");
    check(
      "report_write creates backlog/impl_a.md with house frontmatter",
      written.action === "created" &&
        written.path.endsWith(path.join("backlog", "impl_a.md")) &&
        text.startsWith("---\ntype: Implementation Log\nfeature: a\nstatus: implemented\nrole: implementer\n") &&
        text.includes("Did the thing."),
      text.slice(0, 200),
    );
  }

  // M9/M10/M11 — feature_start, feature_log, feature_next_step
  //
  // These need their own throwaway harness because feature 'a' above is now
  // `done` and feature 'b' (depends on a) is the only claimable one. We start
  // 'b' through the MCP, which rewrites progress/current.md with the ## Log
  // and ## Next Step sections, then exercise log and next_step against it.
  {
    const ROOT2 = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-wf-"));
    writeHarness(ROOT2);
    const p2 = mcp.resolveProject(ROOT2);

    // M9 — feature_start flips pending -> in_progress and refuses a second start
    const startB = mcp.featureStart(p2, "b", true /* no_preflight */);
    check(
      "feature_start marks 'b' in_progress",
      startB.exit === 0 && statusOf(ROOT2, "b") === "in_progress",
      `exit=${startB.exit} status=${statusOf(ROOT2, "b")} output=${startB.output.slice(0, 200)}`,
    );
    const startAWhileB = mcp.featureStart(p2, "a", true);
    check(
      "feature_start refuses when another feature is in_progress",
      startAWhileB.exit !== 0 && statusOf(ROOT2, "a") === "pending" && statusOf(ROOT2, "b") === "in_progress",
      `exit=${startAWhileB.exit} status_a=${statusOf(ROOT2, "a")} output=${startAWhileB.output.slice(0, 200)}`,
    );

    // M10 — feature_log appends a bullet to ## Log (created by feature_start)
    const log = mcp.featureLog(p2, "first step via mcp");
    const cur = fs.readFileSync(path.join(ROOT2, ".handyman", "progress", "current.md"), "utf-8");
    check(
      "feature_log appends a bullet to ## Log",
      log.exit === 0 && /## Log[\s\S]*- first step via mcp/.test(cur),
      `exit=${log.exit} output=${log.output.slice(0, 200)}`,
    );

    // M11 — feature_next_step sets ## Next Step
    const next = mcp.featureNextStep(p2, "resume from here");
    const cur2 = fs.readFileSync(path.join(ROOT2, ".handyman", "progress", "current.md"), "utf-8");
    check(
      "feature_next_step sets ## Next Step",
      next.exit === 0 && /## Next Step[\s\S]*resume from here/.test(cur2),
      `exit=${next.exit} output=${next.output.slice(0, 200)}`,
    );

    fs.rmSync(ROOT2, { recursive: true, force: true });
  }

  // M12/M13 — sprint_status and upgrade_check (read-only wrappers)
  //
  // These use the repo's own harness as the fixture: both CLIs are read-only
  // and the assertions check the wrapper plumbing (exit, output mentions the
  // expected markers), not the exact drift values (which shift as the repo
  // evolves). We resolve the real project root from the dist location.
  {
    const REPO = path.resolve(__dirname, "..");
    const repoProject = mcp.resolveProject(REPO);

    // M12 — sprint_status lists features of the open period, or reports none.
    // The repo's own harness is the fixture; after a period close there may be
    // no open sprint, so both "open:" + "feature(s)" and "no sprint open" pass.
    const sprint = mcp.sprintStatus(repoProject);
    const openPeriod = /open:/.test(sprint.output) && /feature\(s\)/.test(sprint.output);
    const noPeriod = /no sprint open/.test(sprint.output);
    check(
      "sprint_status reports the open period and its features",
      sprint.exit === 0 && (openPeriod || noPeriod),
      `exit=${sprint.exit} output=${sprint.output.slice(0, 200)}`,
    );

    // M13 — upgrade_check reports drift read-only (exit may be non-zero when
    // behind, but the output must mention installed/current versions).
    const upgrade = mcp.upgradeCheck(repoProject);
    check(
      "upgrade_check reports harness version drift",
      /installed version:/.test(upgrade.output) && /current version:/.test(upgrade.output),
      `exit=${upgrade.exit} output=${upgrade.output.slice(0, 200)}`,
    );
  }

  fs.rmSync(ROOT, { recursive: true, force: true });

  console.log(`${RUN - FAILED}/${RUN} passed`);
  process.exit(FAILED === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("suite crashed:", e);
  process.exit(1);
});
