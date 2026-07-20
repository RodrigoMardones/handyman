#!/usr/bin/env node
/*
 * toolBox core-package tests (packages/toolbox-core + handyman shims).
 *
 * Feature 42 moved the HTTP-agnostic observer data layer to
 * @handyman/toolbox-core and left re-export shims in handyman/dist. This
 * suite pins the move: the registry-allowlisted readers behave identically,
 * the shims share module identity with the package (one LlmError class), and
 * buildState (handyman/dist/toolbox_state.js, the "./state" export) keeps its
 * document shape. No network, all reads on a temp fixture.
 *
 *   T1  buildCorpus: kinds, ids prefixed by root, /api/md-compatible refs.
 *   T2  resolveMd: whitelist hits, traversal and unregistered root -> null.
 *   T3  listTagFiles: text files in, binaries/dot-dirs out.
 *   T4  readTagFiles: resolves inside the root, drops escapes, dedupes.
 *   T5  shim identity: handyman/dist re-exports ARE the package exports.
 *   T6  buildState: document shape (registry, harnesses, fleet, timeline).
 *   T7  writeIntake/intakeHttp (feature 46): validation order, footer,
 *       single allowlisted file, byte-identical HTTP mapping.
 *
 * Exit code 0 when all pass, 1 otherwise.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const REPO = path.join(__dirname, "..");
const CORE_DIST = path.join(REPO, "packages", "toolbox-core", "dist", "index.js");
const LLM_SHIM = path.join(REPO, "handyman", "dist", "toolbox_llm.js");
const DRAFT_SHIM = path.join(REPO, "handyman", "dist", "toolbox_draft.js");
const STATE_DIST = path.join(REPO, "handyman", "dist", "toolbox_state.js");

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

/** One registered harness on disk: root + .handyman workspace + registry. */
function makeFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "toolbox-state-"));
  const hroot = path.join(base, "HANDYMAN");
  const root = path.join(base, "proj1");
  const ws = path.join(root, ".handyman");
  fs.mkdirSync(path.join(ws, "progress"), { recursive: true });
  fs.mkdirSync(path.join(ws, "backlog"), { recursive: true });
  fs.mkdirSync(path.join(ws, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(hroot, { recursive: true });
  fs.writeFileSync(
    path.join(root, "harness.config.json"),
    `${JSON.stringify({ project_name: "proj1", harness_workspace: ".handyman" }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(ws, "feature_list.json"),
    `${JSON.stringify({
      project: "proj1",
      features: [
        { id: 1, name: "alpha", title: "Alpha feature", status: "done" },
        { id: 2, name: "beta", title: "Beta feature", status: "pending", depends_on: [1] },
      ],
    })}\n`,
  );
  fs.writeFileSync(path.join(ws, "progress", "current.md"), "# Current\nsearchable_marker_current\n");
  fs.writeFileSync(path.join(ws, "progress", "history.md"), "# History\n- 2026-06-01: closed alpha\n");
  fs.writeFileSync(path.join(ws, "backlog", "impl_alpha.md"), "impl notes searchable_marker_backlog\n");
  fs.writeFileSync(path.join(ws, "docs", "business.md"), "domain searchable_marker_docs\n");
  fs.writeFileSync(path.join(root, "CHECKPOINTS.md"), "# CHECKPOINTS\n");
  fs.writeFileSync(path.join(root, "src", "cli.ts"), "export const x = 1;\n");
  fs.writeFileSync(path.join(root, "note.bin"), Buffer.from([0, 1, 2]));
  fs.writeFileSync(
    path.join(hroot, "registry.json"),
    `${JSON.stringify({ version: 1, harnesses: [{ project_root: root, registered: "2026-01-01" }] })}\n`,
  );
  return { base, hroot, root, ws };
}

async function main() {
  const core = await import(pathToFileURL(CORE_DIST).href);
  const { base, hroot, root, ws } = makeFixture();

  try {
    // T1: corpus over the registered fleet.
    const corpus = core.buildCorpus(hroot);
    const kinds = new Set(corpus.map((d) => d.kind));
    check(
      "buildCorpus covers feature/progress/backlog/docs kinds",
      ["feature", "progress", "backlog", "docs"].every((k) => kinds.has(k)),
      `kinds: ${[...kinds].join(",")}`,
    );
    check(
      "buildCorpus ids are prefixed by the harness root",
      corpus.length > 0 && corpus.every((d) => d.id.startsWith(`${root}::`)),
    );
    const backlogDoc = corpus.find((d) => d.ref === "backlog:impl_alpha.md");
    check(
      "buildCorpus refs are /api/md-compatible",
      Boolean(backlogDoc) && backlogDoc.project === "proj1",
      JSON.stringify(backlogDoc ?? null),
    );

    // T2: markdown allowlist.
    check(
      "resolveMd maps 'current' into the workspace",
      core.resolveMd(hroot, root, "current") === path.join(ws, "progress", "current.md"),
    );
    check(
      "resolveMd maps backlog:impl_alpha.md",
      core.resolveMd(hroot, root, "backlog:impl_alpha.md") === path.join(ws, "backlog", "impl_alpha.md"),
    );
    check(
      "resolveMd blocks path traversal",
      core.resolveMd(hroot, root, "backlog:../../secrets.md") === null,
    );
    check(
      "resolveMd rejects an unregistered root",
      core.resolveMd(hroot, "/etc", "current") === null,
    );
    check(
      "resolveMd rejects a non-whitelisted name",
      core.resolveMd(hroot, root, "random") === null,
    );

    // T3: taggable file listing.
    const files = core.listTagFiles(root).map((f) => f.path);
    check(
      "listTagFiles includes text files",
      files.includes("src/cli.ts") && files.includes("CHECKPOINTS.md"),
      files.join(","),
    );
    check(
      "listTagFiles excludes binaries and dot-dirs",
      !files.includes("note.bin") && files.every((f) => !f.startsWith(".handyman")),
    );

    // T4: tagged reads stay inside the registered root.
    const tags = core.readTagFiles(hroot, root, [
      "src/cli.ts",
      "src/cli.ts",
      "../outside.ts",
      "note.bin",
    ]);
    check(
      "readTagFiles resolves, dedupes and drops escapes/binaries",
      tags.length === 1 && tags[0].path === "src/cli.ts" && tags[0].text.includes("export const x"),
      JSON.stringify(tags),
    );

    // T5: the handyman shims share module identity with the package.
    const llmShim = await import(pathToFileURL(LLM_SHIM).href);
    const draftShim = await import(pathToFileURL(DRAFT_SHIM).href);
    check("shim LlmError IS the package LlmError", llmShim.LlmError === core.LlmError);
    check("shim buildProviders IS the package buildProviders", llmShim.buildProviders === core.buildProviders);
    check(
      "draft shim keeps the bundled-template default",
      draftShim.buildDraftSystem().template.includes("## Feature"),
    );

    // T6: buildState document shape via the handyman ./state export.
    const stateMod = await import(pathToFileURL(STATE_DIST).href);
    const state = stateMod.buildState(hroot);
    check(
      "buildState carries registry path and no registry error",
      state.registry === path.join(hroot, "registry.json") && state.registry_error === null,
      JSON.stringify({ registry: state.registry, registry_error: state.registry_error }),
    );
    const harness = Array.isArray(state.harnesses) ? state.harnesses[0] : undefined;
    check(
      "buildState harness snapshot has queue, signals and metrics fields",
      Boolean(harness) &&
        Array.isArray(harness.features) &&
        harness.features.length === 2 &&
        Array.isArray(harness.signals) &&
        harness.has_graph === false,
      JSON.stringify(harness ?? null).slice(0, 200),
    );
    check(
      "buildState aggregates fleet and timeline",
      state.fleet && state.fleet.harnesses === 1 && Array.isArray(state.timeline),
      JSON.stringify(state.fleet ?? null),
    );
    // T7: the single intake write (feature 46).
    const okResult = core.writeIntake(hroot, root, "## Feature\nname: thing\n", [
      "src/cli.ts",
      "src/cli.ts",
    ]);
    const written = fs.readFileSync(path.join(ws, "feature-request.md"), "utf8");
    check(
      "writeIntake persists the draft with the tagged-files footer",
      okResult.status === "ok" &&
        okResult.path === path.join(ws, "feature-request.md") &&
        written.includes("name: thing") &&
        written.includes("intake context files: src/cli.ts"),
      JSON.stringify({ okResult, written: written.slice(0, 120) }),
    );
    check(
      "writeIntake validation order: root -> empty draft -> registry",
      core.writeIntake(hroot, "", "", []).status === "root_required" &&
        core.writeIntake(hroot, root, "   ", []).status === "empty_draft" &&
        core.writeIntake(hroot, "/etc", "draft", []).status === "root_not_registered",
    );
    const httpOk = core.intakeHttp(okResult);
    const http422 = core.intakeHttp({ status: "empty_draft" });
    const http400 = core.intakeHttp({ status: "root_not_registered" });
    check(
      "intakeHttp maps byte-identical statuses and bodies",
      httpOk.status === 200 &&
        httpOk.body.ok === true &&
        httpOk.body.spawned_process === false &&
        http422.status === 422 &&
        http422.body.error === "draft_md must not be empty" &&
        http400.status === 400 &&
        http400.body.error === "root not registered",
      JSON.stringify({ httpOk, http422, http400 }),
    );
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }

  console.log(`\nSummary: ${RUN} run, ${RUN - FAILED} passed, ${FAILED} failed`);
  process.exit(FAILED === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
