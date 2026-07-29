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
 *   M1  tools/list exposes exactly the 20 contract tools
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
 *   M14 feature_add appends a pending feature (acceptance + depends_on)
 *   M15 feature_block/feature_unblock move a feature blocked <-> pending
 *   M16 feature_acceptance refuses to rewrite a done feature's contract
 *   M17 backlog_review stamps status: approved into backlog/review_<f>.md
 *   M18 backlog_review refuses a conflicting verdict (no silent flip)
 *   M19 metrics returns the parsed metrics.js --json snapshot
 *   M20 fleet_status returns the registry-wide fleet view
 *   M21 fleet_health reports signals; --strict drives the exit code
 *   M22 fleet_timeline returns the merged closure chronology
 *   M23 resources/read serves the resume briefing (session + queue)
 *   M24 prompts/list exposes the 4 role prompts; prompts/get renders the role
 *   M25 feature_close_async + task_result close via background task
 *   M26 streamable HTTP transport: stateful sessions, 404 on unknown id
 *   M27 sprint_close: elicitation confirms, confirm:true fallback, preview first
 *   M28 handoff_submit/handoff_claim round-trip the disk queue
 *   M29 resolveProject rejects an ambiguous name; the absolute root still resolves
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

function featureOf(root, name) {
  const data = JSON.parse(fs.readFileSync(path.join(root, ".handyman", "feature_list.json"), "utf-8"));
  return data.features.find((f) => f.name === name) || {};
}

// --- minimal JSON-RPC client over stdio -------------------------------------

function rpcSession(requests, cwd, opts = {}) {
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
          const msg = JSON.parse(line);
          if (msg.method === "elicitation/create" && msg.id !== undefined) {
            // Server -> client request (elicitation): answer it with the
            // scripted user decision; it is NOT one of the awaited responses.
            child.stdin.write(
              `${JSON.stringify({
                jsonrpc: "2.0",
                id: msg.id,
                result: opts.elicitResult ?? { action: "accept", content: { confirm: true } },
              })}\n`,
            );
          } else {
            responses.push(msg);
          }
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

  // M1/M2/M23/M24 — wire surface over real stdio JSON-RPC
  {
    // Register the fixture so resource/prompt URIs resolve by harness name.
    const WIRE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-wire-root-"));
    fs.writeFileSync(
      path.join(WIRE_ROOT, "registry.json"),
      JSON.stringify({ version: 1, harnesses: [{ project_root: ROOT, registered: "2026-07-26" }] }),
    );
    process.env.HANDYMAN_ROOT = WIRE_ROOT;
    const responses = await rpcSession(
      [
        INIT,
        INITIALIZED,
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
        { jsonrpc: "2.0", id: 3, method: "resources/templates/list" },
        {
          jsonrpc: "2.0",
          id: 4,
          method: "resources/read",
          params: { uri: `handyman://${path.basename(ROOT)}/resume` },
        },
        { jsonrpc: "2.0", id: 5, method: "prompts/list" },
        {
          jsonrpc: "2.0",
          id: 6,
          method: "prompts/get",
          params: {
            name: "role_leader",
            arguments: { project: path.basename(ROOT), feature: "a" },
          },
        },
      ],
      ROOT,
    );
    const tools = (responses.find((r) => r.id === 2) || {}).result?.tools ?? [];
    const names = tools.map((t) => t.name).sort();
    check(
      "tools/list exposes the 25 contract tools",
      JSON.stringify(names) ===
        JSON.stringify([
          "backlog_review",
          "feature_acceptance",
          "feature_add",
          "feature_block",
          "feature_close",
          "feature_close_async",
          "feature_log",
          "feature_next",
          "feature_next_step",
          "feature_start",
          "feature_unblock",
          "fleet_health",
          "fleet_status",
          "fleet_timeline",
          "handoff_claim",
          "handoff_submit",
          "harness_list",
          "metrics",
          "preflight",
          "report_write",
          "sprint_close",
          "sprint_status",
          "task_result",
          "upgrade_check",
          "verify",
        ]),
      `got: ${names.join(", ")}`,
    );
    const templates = (responses.find((r) => r.id === 3) || {}).result?.resourceTemplates ?? [];
    const uris = templates.map((t) => t.uriTemplate).sort();
    check(
      "resource templates expose current, docs/* and resume",
      uris.length === 3 &&
        uris[0].endsWith("/current") &&
        uris[1].includes("/docs/") &&
        uris[2].endsWith("/resume"),
      `got: ${uris.join(", ")}`,
    );
    const resume = (responses.find((r) => r.id === 4) || {}).result?.contents?.[0]?.text ?? "";
    check(
      "resources/read serves the resume briefing",
      resume.includes("## Active session") &&
        resume.includes("## Queue") &&
        resume.includes("## Branch") &&
        resume.includes("## Pending handoffs") &&
        resume.includes("## Memory index"),
      resume.slice(0, 300),
    );
    const prompts = (responses.find((r) => r.id === 5) || {}).result?.prompts ?? [];
    const promptNames = prompts.map((p) => p.name).sort();
    const leaderText =
      (responses.find((r) => r.id === 6) || {}).result?.messages?.[0]?.content?.text ?? "";
    check(
      "prompts/list exposes the 4 role prompts and prompts/get renders the role",
      JSON.stringify(promptNames) ===
        JSON.stringify(["role_explorer", "role_implementer", "role_leader", "role_reviewer"]) &&
        leaderText.includes("# Leader") &&
        leaderText.includes("- Feature: a") &&
        leaderText.includes("- PROJECT_ROOT:"),
      `prompts: ${promptNames.join(", ")}; leader body head: ${leaderText.slice(0, 200)}`,
    );
    fs.rmSync(WIRE_ROOT, { recursive: true, force: true });
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

    // M12 — sprint_status lists features of the open period
    const sprint = mcp.sprintStatus(repoProject);
    check(
      "sprint_status reports the open period and its features",
      sprint.exit === 0 && /open:/.test(sprint.output) && /feature\(s\)/.test(sprint.output),
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

  // M14/M15/M16 — feature_add, feature_block/feature_unblock, feature_acceptance
  //
  // Their own throwaway harness: intake appends a pending feature, block and
  // unblock round-trip a state transition, and acceptance exercises the refusal
  // on a done feature — the CLI refuses without --force, which the MCP
  // deliberately does not expose, so the non-zero exit is the contract.
  {
    const ROOT3 = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-state-"));
    writeHarness(ROOT3);
    const p3 = mcp.resolveProject(ROOT3);

    // M14 — feature_add appends a pending feature with its contract keys
    const added = mcp.featureAdd(p3, "c", {
      title: "Third feature",
      acceptance: ["does the third thing"],
      dependsOn: [1],
    });
    const c = featureOf(ROOT3, "c");
    check(
      "feature_add appends a pending feature with acceptance and depends_on",
      added.exit === 0 &&
        c.id === 3 &&
        c.status === "pending" &&
        JSON.stringify(c.acceptance) === JSON.stringify(["does the third thing"]) &&
        JSON.stringify(c.depends_on) === JSON.stringify([1]),
      `exit=${added.exit} feature=${JSON.stringify(c)} output=${added.output.slice(0, 200)}`,
    );

    // M15 — feature_block/feature_unblock round-trip blocked -> pending
    const blocked = mcp.featureBlock(p3, "b", "waiting on the panel API");
    const bBlocked = featureOf(ROOT3, "b");
    check(
      "feature_block marks the feature blocked with the reason",
      blocked.exit === 0 &&
        bBlocked.status === "blocked" &&
        bBlocked.blocked_reason === "waiting on the panel API",
      `exit=${blocked.exit} feature=${JSON.stringify(bBlocked)} output=${blocked.output.slice(0, 200)}`,
    );
    const unblocked = mcp.featureUnblock(p3, "b");
    const bUnblocked = featureOf(ROOT3, "b");
    check(
      "feature_unblock returns the feature to pending and drops the reason",
      unblocked.exit === 0 && bUnblocked.status === "pending" && !("blocked_reason" in bUnblocked),
      `exit=${unblocked.exit} feature=${JSON.stringify(bUnblocked)} output=${unblocked.output.slice(0, 200)}`,
    );

    // M16 — feature_acceptance refuses on a done feature
    execFileSync(
      process.execPath,
      [path.join(DIST, "feature.js"), "--root", ROOT3, "start", "a", "--no-preflight"],
      { stdio: "ignore" },
    );
    const green3 = path.join(ROOT3, "ok.sh");
    writeVerifier(green3, 0);
    mcp.featureClose(p3, "a", green3);
    const refused = mcp.featureAcceptance(p3, "a", ["rewritten contract"]);
    check(
      "feature_acceptance refuses to rewrite a done feature's contract",
      refused.exit !== 0 &&
        statusOf(ROOT3, "a") === "done" &&
        /acceptance list is the contract/.test(refused.output),
      `exit=${refused.exit} status=${statusOf(ROOT3, "a")} output=${refused.output.slice(0, 200)}`,
    );

    fs.rmSync(ROOT3, { recursive: true, force: true });
  }

  // M17/M18 — backlog_review stamps the verdict and refuses a conflicting one
  //
  // Own throwaway harness: backlog.js review stamps the template regardless of
  // feature state, so a bare fixture is enough. The conflict path is the
  // contract the MCP must surface, not swallow: a second, different verdict
  // without --force exits non-zero and the file keeps the original verdict.
  {
    const ROOT4 = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-review-"));
    writeHarness(ROOT4);
    const p4 = mcp.resolveProject(ROOT4);

    // M17 — happy path stamps status: approved into the frontmatter
    const stamped = mcp.backlogReview(p4, "a", "approved");
    const reviewPath = path.join(ROOT4, ".handyman", "backlog", "review_a.md");
    const reviewText = fs.existsSync(reviewPath) ? fs.readFileSync(reviewPath, "utf-8") : "";
    check(
      "backlog_review writes backlog/review_a.md with status: approved",
      stamped.exit === 0 && /^status: approved$/m.test(reviewText),
      `exit=${stamped.exit} output=${stamped.output.slice(0, 200)}`,
    );

    // M18 — a conflicting verdict exits non-zero and flips nothing
    const conflict = mcp.backlogReview(p4, "a", "changes_requested");
    const afterText = fs.readFileSync(reviewPath, "utf-8");
    check(
      "backlog_review surfaces the verdict conflict without flipping the file",
      conflict.exit !== 0 &&
        /declares 'approved' but --status asked for 'changes_requested'/.test(conflict.output) &&
        /^status: approved$/m.test(afterText),
      `exit=${conflict.exit} output=${conflict.output.slice(0, 200)}`,
    );

    fs.rmSync(ROOT4, { recursive: true, force: true });
  }

  // M19 — metrics parses the metrics.js --json snapshot into structured data
  //
  // Asserts against the fixture state built above: 'a' is done (M4), 'b' is
  // still pending, and backlog/ holds only impl_a.md (M7) with no review
  // counterpart — so coverage flags 'a' as missing its report pair.
  {
    const snap = mcp.metrics(project);
    check(
      "metrics returns the parsed per-harness snapshot",
      snap.exit === 0 &&
        snap.status_counts?.done === 1 &&
        snap.status_counts?.pending === 1 &&
        snap.coverage?.done === 1 &&
        snap.coverage?.with_reports === 0 &&
        JSON.stringify(snap.coverage?.missing) === JSON.stringify(["a"]),
      JSON.stringify(snap).slice(0, 300),
    );
  }

  // M20/M21/M22 — fleet_status, fleet_health, fleet_timeline over the registry
  //
  // Same registry fixture pattern as M5: point $HANDYMAN_ROOT at a throwaway
  // dir whose registry.json registers ROOT. The fleet verbs are registry-wide
  // (toolbox.ts parseFlags would ignore an injected --root), so the handlers
  // shell out without --root and the registry alone decides the view.
  {
    const HROOT2 = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-fleet-"));
    fs.writeFileSync(
      path.join(HROOT2, "registry.json"),
      JSON.stringify({ version: 1, harnesses: [{ project_root: ROOT, registered: "2026-07-21" }] }),
    );
    process.env.HANDYMAN_ROOT = HROOT2;

    // M20 — fleet_status returns the live per-harness snapshots + fleet rollup
    const status = mcp.fleetStatus();
    check(
      "fleet_status returns the fleet view with the fixture harness",
      status.exit === 0 &&
        status.fleet?.harnesses === 1 &&
        Array.isArray(status.harnesses) &&
        status.harnesses[0]?.project_name === "t" &&
        status.harnesses[0]?.status_counts?.done === 1,
      JSON.stringify(status).slice(0, 300),
    );

    // M21 — fleet_health returns per-harness signal lists and --strict plumbs
    // through to the exit code (1 exactly when signals are present). Which
    // signals fire depends on the skill version vs the unsealed fixture
    // (BEHIND), so the case asserts the exit/total_signals contract rather
    // than specific signals — that part is not deterministic in the fixture.
    const health = mcp.fleetHealth();
    const healthStrict = mcp.fleetHealth(true);
    check(
      "fleet_health reports signals and --strict drives the exit code",
      health.exit === 0 &&
        Array.isArray(health.harnesses) &&
        health.harnesses[0]?.project_name === "t" &&
        Array.isArray(health.harnesses[0]?.signals) &&
        typeof health.total_signals === "number" &&
        healthStrict.exit === (healthStrict.total_signals > 0 ? 1 : 0),
      `exit=${health.exit} strict_exit=${healthStrict.exit} total=${health.total_signals}`,
    );

    // M22 — fleet_timeline merges the closure chronology: M4's close of 'a'
    // is the single dated entry in the fixture history.
    const timeline = mcp.fleetTimeline();
    check(
      "fleet_timeline returns the merged closure chronology",
      timeline.exit === 0 &&
        timeline.total === 1 &&
        Array.isArray(timeline.entries) &&
        timeline.entries[0]?.feature === "a" &&
        timeline.entries[0]?.feature_id === 1 &&
        timeline.entries[0]?.source === "history",
      JSON.stringify(timeline).slice(0, 300),
    );

    fs.rmSync(HROOT2, { recursive: true, force: true });
  }

  // M25 — feature_close_async + task_result: the background close path
  //
  // Own throwaway harness: start 'b', detach the close against a green
  // verifier, then poll task_result until the record flips. The verifier is
  // instant, so a handful of 200ms polls is generous. Negative ids must throw
  // before touching disk (traversal-shaped) or report unknown (well-formed).
  {
    const ROOT5 = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-async-"));
    writeHarness(ROOT5);
    const p5 = mcp.resolveProject(ROOT5);
    mcp.featureStart(p5, "b", true /* no_preflight */);
    const green5 = path.join(ROOT5, "ok.sh");
    writeVerifier(green5, 0);

    const started = mcp.featureCloseAsync(p5, "b", green5);
    let final = null;
    for (let i = 0; i < 50 && (!final || final.status === "running"); i++) {
      await new Promise((r) => setTimeout(r, 200));
      final = mcp.taskResult(p5, started.task_id);
    }
    check(
      "feature_close_async closes via background task and task_result reports it",
      /^close-b-[a-z0-9]+$/.test(started.task_id) &&
        started.status === "running" &&
        final !== null &&
        final.status === "completed" &&
        final.closed === true &&
        statusOf(ROOT5, "b") === "done",
      `started=${JSON.stringify(started)} final=${JSON.stringify(final)} status=${statusOf(ROOT5, "b")}`,
    );

    let invalid = "";
    let unknown = "";
    try {
      mcp.taskResult(p5, "../escape");
    } catch (e) {
      invalid = String(e.message || e);
    }
    try {
      mcp.taskResult(p5, "close-nope-000");
    } catch (e) {
      unknown = String(e.message || e);
    }
    check(
      "task_result rejects traversal-shaped and unknown ids",
      invalid.includes("invalid task_id") && unknown.includes("unknown task"),
      `invalid=${invalid} unknown=${unknown}`,
    );
    fs.rmSync(ROOT5, { recursive: true, force: true });
  }

  // M26 — Streamable HTTP transport over the wire
  //
  // Spawn dist/mcp.js --http --port 0 (OS-assigned port, announced on stderr),
  // then drive the session lifecycle with fetch: initialize assigns an
  // Mcp-Session-Id, tools/list with the id answers the full surface, and an
  // unknown id gets a 404 so the client re-initializes per spec.
  {
    const httpChild = spawn(process.execPath, [MCP, "--http", "--port", "0"], {
      cwd: ROOT,
      stdio: ["ignore", "ignore", "pipe"],
    });
    try {
      const port = await new Promise((resolvePort, rejectPort) => {
        let errBuf = "";
        const timer = setTimeout(
          () => rejectPort(new Error(`http server did not announce its port; stderr: ${errBuf}`)),
          15000,
        );
        httpChild.stderr.on("data", (chunk) => {
          errBuf += chunk.toString();
          const m = errBuf.match(/listening on http:\/\/127\.0\.0\.1:(\d+)\/mcp/);
          if (m) {
            clearTimeout(timer);
            resolvePort(Number(m[1]));
          }
        });
        httpChild.on("error", rejectPort);
      });
      const post = (body, sid) =>
        fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...(sid ? { "mcp-session-id": sid } : {}),
          },
          body: JSON.stringify(body),
        });
      const initRes = await post(INIT);
      const sid = initRes.headers.get("mcp-session-id");
      const toolsRes = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, sid);
      const toolsBody = await toolsRes.text();
      const deadRes = await post(
        { jsonrpc: "2.0", id: 3, method: "tools/list" },
        "deadbeef-dead-dead-dead-deaddeadbeef",
      );
      check(
        "streamable HTTP assigns sessions, serves tools, 404s unknown ids",
        initRes.status === 200 &&
          typeof sid === "string" &&
          sid.length > 0 &&
          toolsRes.status === 200 &&
          toolsBody.includes("feature_close_async") &&
          deadRes.status === 404,
        `init=${initRes.status} sid=${sid} tools=${toolsRes.status} dead=${deadRes.status}`,
      );
    } finally {
      httpChild.kill();
    }
  }

  // M27 — sprint_close: human confirmation gates the destructive period verb
  //
  // Two clients over stdio against fixtures with an open period
  // (harness.config.json current_sprint). The eliciting client gets the
  // mid-call elicitation/create request and its accept executes the close.
  // The non-eliciting client gets the dry-run preview plus the confirm hint,
  // and only the explicit confirm:true re-call executes.
  {
    const openPeriod = (root) => {
      writeHarness(root);
      fs.writeFileSync(
        path.join(root, "harness.config.json"),
        JSON.stringify({ project: "t", current_sprint: "test-period" }),
      );
    };
    const sprintDocOf = (root) =>
      [
        path.join(root, ".handyman", "memory", "sprints", "sprint.test-period.md"),
        path.join(root, ".handyman", "docs", "sprints", "sprint.test-period.md"),
      ].find((p) => fs.existsSync(p)) ?? null;
    const currentSprintOf = (root) =>
      JSON.parse(fs.readFileSync(path.join(root, "harness.config.json"), "utf-8")).current_sprint ??
      null;

    // M27a — elicitation-capable client: mid-call confirm executes the close
    const ROOT6 = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-elicit-"));
    openPeriod(ROOT6);
    const elicitResponses = await rpcSession(
      [
        {
          ...INIT,
          params: { ...INIT.params, capabilities: { elicitation: {} } },
        },
        INITIALIZED,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "sprint_close", arguments: { project: ROOT6 } },
        },
      ],
      ROOT,
      { elicitResult: { action: "accept", content: { confirm: true } } },
    );
    const elicitResult = (elicitResponses.find((r) => r.id === 2) || {}).result?.structuredContent ?? {};
    check(
      "sprint_close executes after elicited human confirmation",
      elicitResult.closed === true &&
        elicitResult.confirmed_via === "elicitation" &&
        currentSprintOf(ROOT6) === null &&
        sprintDocOf(ROOT6) !== null,
      `result=${JSON.stringify(elicitResult).slice(0, 300)} sprint=${currentSprintOf(ROOT6)} doc=${sprintDocOf(ROOT6)}`,
    );
    fs.rmSync(ROOT6, { recursive: true, force: true });

    // M27b/c — non-eliciting client: preview first, confirm:true executes
    // Two separate sessions: the "nothing written" state assertions must be
    // evaluated AFTER the preview call but BEFORE the confirm call lands.
    const ROOT7 = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-confirm-"));
    openPeriod(ROOT7);
    const previewResponses = await rpcSession(
      [
        INIT,
        INITIALIZED,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "sprint_close", arguments: { project: ROOT7 } },
        },
      ],
      ROOT,
    );
    const previewResult = (previewResponses.find((r) => r.id === 2) || {}).result?.structuredContent ?? {};
    check(
      "sprint_close without confirmation returns the preview and writes nothing",
      previewResult.closed === false &&
        typeof previewResult.preview === "string" &&
        previewResult.preview.includes("DRY RUN") &&
        /confirm: true/.test(previewResult.hint ?? "") &&
        currentSprintOf(ROOT7) === "test-period" &&
        sprintDocOf(ROOT7) === null,
      `result=${JSON.stringify(previewResult).slice(0, 300)} sprint=${currentSprintOf(ROOT7)}`,
    );
    const confirmResponses = await rpcSession(
      [
        INIT,
        INITIALIZED,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "sprint_close", arguments: { project: ROOT7, confirm: true } },
        },
      ],
      ROOT,
    );
    const confirmResult = (confirmResponses.find((r) => r.id === 2) || {}).result?.structuredContent ?? {};
    check(
      "sprint_close with confirm:true executes via the param fallback",
      confirmResult.closed === true &&
        confirmResult.confirmed_via === "param" &&
        currentSprintOf(ROOT7) === null &&
        sprintDocOf(ROOT7) !== null,
      `result=${JSON.stringify(confirmResult).slice(0, 300)} sprint=${currentSprintOf(ROOT7)}`,
    );
    fs.rmSync(ROOT7, { recursive: true, force: true });
  }

  // M28 — handoff_submit/handoff_claim: the structured role handoff queue
  //
  // Own throwaway harness: submit leader -> implementer, claim as the
  // implementer (oldest pending wins, marked claimed on disk), then claim
  // again to prove a claimed handoff is never handed out twice. The pending
  // entry also surfaces in the resume briefing while unclaimed.
  {
    const ROOT8 = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-handoff-"));
    writeHarness(ROOT8);
    const p8 = mcp.resolveProject(ROOT8);

    const submitted = mcp.handoffSubmit(
      p8,
      "leader",
      "implementer",
      "backlog/impl_a.md",
      "impl ready for review",
    );
    const inResume = mcp.buildResume(p8).includes("leader -> implementer: backlog/impl_a.md");
    const claimed = mcp.handoffClaim(p8, "implementer");
    const second = mcp.handoffClaim(p8, "implementer");
    const otherRole = mcp.handoffClaim(p8, "reviewer");
    check(
      "handoff_submit/handoff_claim round-trip the disk queue",
      submitted.status === "pending" &&
        submitted.from === "leader" &&
        submitted.to === "implementer" &&
        inResume &&
        claimed.claimed === true &&
        claimed.handoff.artifact === "backlog/impl_a.md" &&
        claimed.handoff.status === "claimed" &&
        typeof claimed.handoff.claimed_at === "string" &&
        second.claimed === false &&
        otherRole.claimed === false,
      `submitted=${JSON.stringify(submitted)} claimed=${JSON.stringify(claimed)} second=${JSON.stringify(second)}`,
    );
    fs.rmSync(ROOT8, { recursive: true, force: true });
  }

  // M29 — resolveProject refuses an ambiguous harness name
  //
  // Two registered roots sharing a basename make name-based resolution
  // ambiguous: the error must list both candidate project_roots and point at
  // the absolute path, which itself keeps resolving (unregistered absolute
  // roots were always accepted).
  {
    const AMB = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-amb-"));
    const DUP1 = path.join(AMB, "one", "hm-studio");
    const DUP2 = path.join(AMB, "two", "hm-studio");
    writeHarness(DUP1);
    writeHarness(DUP2);
    const HROOT = fs.mkdtempSync(path.join(os.tmpdir(), "hmcp-amb-root-"));
    fs.writeFileSync(
      path.join(HROOT, "registry.json"),
      JSON.stringify({
        version: 1,
        harnesses: [
          { project_root: DUP1, registered: "2026-07-29" },
          { project_root: DUP2, registered: "2026-07-29" },
        ],
      }),
    );
    process.env.HANDYMAN_ROOT = HROOT;
    let message = "";
    try {
      mcp.resolveProject("hm-studio");
    } catch (e) {
      message = String(e.message || e);
    }
    check(
      "resolveProject rejects an ambiguous name listing both candidate roots",
      message.includes("ambiguous") && message.includes(DUP1) && message.includes(DUP2),
      message,
    );
    const viaPath = mcp.resolveProject(DUP2);
    check(
      "resolveProject still accepts the absolute root of a name-duplicated harness",
      viaPath.root === DUP2 && viaPath.name === "hm-studio",
      JSON.stringify(viaPath),
    );
    fs.rmSync(HROOT, { recursive: true, force: true });
    fs.rmSync(AMB, { recursive: true, force: true });
  }

  fs.rmSync(ROOT, { recursive: true, force: true });

  console.log(`${RUN - FAILED}/${RUN} passed`);
  process.exit(FAILED === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("suite crashed:", e);
  process.exit(1);
});
