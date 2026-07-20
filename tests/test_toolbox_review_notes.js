#!/usr/bin/env node
/*
 * toolBox review-notes tests (feature 34, dist).
 *
 * No network and no server: the provider is a deterministic fake draft()
 * injected into relayReviewNotes; the disk half runs against a throwaway
 * workspace and a throwaway git repo. Covered:
 *   T1  readImplReport: returns the report, null when the implementer left none.
 *   T2  readFeatureDiff: reads `git diff HEAD` in a real temp repo.
 *   T3  readFeatureDiff: a non-repo degrades to an empty diff, never throws.
 *   T4  readFeatureDiff: oversized diffs are truncated and flagged.
 *   T5  composeReviewNotesSystem: forbids verdicts AND patches, demands the
 *       draft-verify-everything framing and an explicit "not enough evidence".
 *   T6  composeReviewNotesPrompt: carries feature, impl report and diff, and
 *       says so when the impl report is missing or the diff was truncated.
 *   T7  relayReviewNotes (happy path): streams deltas, returns checklist_md +
 *       model + diff_truncated.
 *   T8  relayReviewNotes (provider error): LlmError becomes onError, no result.
 *
 * Exit code 0 when all pass, 1 otherwise.
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const DIST = path.join(__dirname, "..", "handyman", "dist");

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

function git(cwd, args) {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "ignore"] });
}

/** A real git repo with one committed file and one uncommitted change, so
 *  `git diff HEAD` has something to report. */
function makeRepo(bodyLine) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "handyman-rn-repo-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "test"]);
  fs.writeFileSync(path.join(root, "file.txt"), "original\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "init"]);
  fs.writeFileSync(path.join(root, "file.txt"), bodyLine);
  return root;
}

async function main() {
  const rn = await import(pathToFileURL(path.join(DIST, "toolbox_review_notes.js")).href);
  const { LlmError } = await import(pathToFileURL(path.join(DIST, "toolbox_llm.js")).href);
  const {
    readImplReport,
    readFeatureDiff,
    composeReviewNotesSystem,
    composeReviewNotesPrompt,
    relayReviewNotes,
    REVIEW_DIFF_MAX_CHARS,
  } = rn;
  console.log("toolBox review-notes suite (test_toolbox_review_notes.js)");

  // T1 — impl report present / absent
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "handyman-rn-ws-"));
  fs.mkdirSync(path.join(ws, "backlog"), { recursive: true });
  fs.writeFileSync(path.join(ws, "backlog", "impl_alpha.md"), "# Impl alpha\nhizo X\n");
  check(
    "readImplReport returns the report and null when there is none",
    (readImplReport(ws, "alpha") || "").includes("hizo X") && readImplReport(ws, "ghost") === null,
  );

  // T2 — a real diff
  const repo = makeRepo("changed line\n");
  const d1 = readFeatureDiff(repo);
  check(
    "readFeatureDiff reads git diff HEAD from the root",
    d1.diff.includes("changed line") && d1.diff.includes("file.txt") && d1.truncated === false,
    `got ${JSON.stringify(d1.diff.slice(0, 120))}`,
  );

  // T3 — not a repo: empty, no throw
  const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), "handyman-rn-plain-"));
  let threw = false;
  let d2 = null;
  try {
    d2 = readFeatureDiff(notRepo);
  } catch {
    threw = true;
  }
  check(
    "readFeatureDiff degrades to an empty diff outside a git repo",
    !threw && d2 !== null && d2.diff === "" && d2.truncated === false,
  );

  // T4 — truncation is flagged
  const bigRepo = makeRepo(`${"x".repeat(200)}\n`.repeat(600));
  const d3 = readFeatureDiff(bigRepo, 500);
  check(
    "readFeatureDiff truncates an oversized diff and flags it",
    d3.truncated === true && d3.diff.length === 500,
    `truncated=${d3.truncated} len=${d3.diff.length}`,
  );
  check("REVIEW_DIFF_MAX_CHARS is a sane default budget", REVIEW_DIFF_MAX_CHARS === 60000);

  // T5 — the guardrails live in the system prompt
  const sys = composeReviewNotesSystem();
  check(
    "the system prompt forbids verdicts and patches and demands the draft framing",
    sys.includes("APPROVED") &&
      sys.includes("CHANGES_REQUESTED") &&
      sys.includes("NUNCA") &&
      sys.toLowerCase().includes("borrador") &&
      sys.toLowerCase().includes("patch") &&
      sys.includes("no hay evidencia suficiente"),
    "a guardrail line went missing from composeReviewNotesSystem",
  );

  // T6 — the prompt carries the context and admits what is missing
  const full = composeReviewNotesPrompt("alpha", "# Impl alpha", "diff --git a/x b/x", false);
  const bare = composeReviewNotesPrompt("alpha", null, "", true);
  check(
    "composeReviewNotesPrompt carries feature + impl report + diff",
    full.includes("alpha") && full.includes("# Impl alpha") && full.includes("diff --git"),
  );
  check(
    "composeReviewNotesPrompt states a missing report, an empty diff and truncation",
    bare.includes("no hay reporte del implementer") &&
      bare.includes("diff vacio") &&
      bare.includes("truncado"),
  );

  // T7 — relay happy path
  const deltas = [];
  let result = null;
  let errored = null;
  await relayReviewNotes({
    system: "sys",
    prompt: "prompt",
    diffTruncated: true,
    draft: async (_req, onDelta) => {
      onDelta("- invariante X ");
      onDelta("respetada?");
      return { text: "- invariante X respetada?", model: "fake-cheap", stopReason: "stop" };
    },
    onDelta: (t) => deltas.push(t),
    onResult: (e) => {
      result = e;
    },
    onError: (e) => {
      errored = e;
    },
  });
  check(
    "relayReviewNotes streams deltas and returns checklist_md + model + diff_truncated",
    errored === null &&
      deltas.length === 2 &&
      result !== null &&
      result.checklist_md === "- invariante X respetada?" &&
      result.model === "fake-cheap" &&
      result.diff_truncated === true,
    `result=${JSON.stringify(result)}`,
  );

  // T8 — provider failure
  let errResult = null;
  let errCaught = null;
  await relayReviewNotes({
    system: "sys",
    prompt: "prompt",
    diffTruncated: false,
    draft: async () => {
      throw new LlmError("unauthorized", "bad key");
    },
    onDelta: () => {},
    onResult: (e) => {
      errResult = e;
    },
    onError: (e) => {
      errCaught = e;
    },
  });
  check(
    "relayReviewNotes maps a provider LlmError to onError with no result",
    errResult === null && errCaught !== null && errCaught.code === "unauthorized",
  );

  for (const dir of [ws, repo, notRepo, bigRepo]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\nSummary: ${RUN} run, ${RUN - FAILED} passed, ${FAILED} failed`);
  process.exit(FAILED === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
