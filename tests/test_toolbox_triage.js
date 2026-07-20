#!/usr/bin/env node
/*
 * toolBox backlog-triage tests (feature 32, dist).
 *
 * No network and no server: the provider is a deterministic fake draft()
 * injected into relayTriage, and the disk half runs against a throwaway
 * harness workspace built in a temp dir. Covered:
 *   T1  listBacklogDocs: classifies impl_/review_/explore_/other, recovers
 *       the feature name from the filename, bounds the excerpt.
 *   T2  listBacklogDocs: a workspace with no backlog/ yields [] (no throw).
 *   T3  computeEvidenceDebt: flags features `done` with no review_<name>.md
 *       and ONLY those - the gap validate_harness does not cover.
 *   T4  parseTriageReport: plain JSON, fenced JSON, JSON wrapped in prose.
 *   T5  parseTriageReport: junk yields [] (never throws) and malformed
 *       entries are dropped rather than poisoning the report.
 *   T6  relayTriage (happy path): streams deltas, emits a result carrying the
 *       parsed report AND the server-computed evidence debt verbatim.
 *   T7  relayTriage (provider error): a LlmError becomes onError, no result.
 *
 * Exit code 0 when all pass, 1 otherwise.
 */
"use strict";

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

/** A harness workspace with a deliberate evidence gap: `alpha` is done and
 *  reviewed, `beta` is done but NEVER reviewed, `gamma` is still pending. */
function makeWorkspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "handyman-triage-"));
  fs.mkdirSync(path.join(ws, "backlog"), { recursive: true });
  fs.writeFileSync(
    path.join(ws, "feature_list.json"),
    JSON.stringify({
      project: "fixture",
      features: [
        { id: 1, name: "alpha", title: "Alpha", status: "done" },
        { id: 2, name: "beta", title: "Beta", status: "done" },
        { id: 3, name: "gamma", title: "Gamma", status: "pending" },
      ],
    }),
  );
  fs.writeFileSync(path.join(ws, "backlog", "impl_alpha.md"), `# Impl alpha\n${"x".repeat(2000)}`);
  fs.writeFileSync(path.join(ws, "backlog", "review_alpha.md"), "# Review alpha\n");
  fs.writeFileSync(path.join(ws, "backlog", "impl_beta.md"), "# Impl beta\n");
  fs.writeFileSync(path.join(ws, "backlog", "explore_infra.md"), "# Explore infra\n");
  fs.writeFileSync(path.join(ws, "backlog", "notes.md"), "# Loose note\n");
  return ws;
}

async function main() {
  const triage = await import(pathToFileURL(path.join(DIST, "toolbox_triage.js")).href);
  const { LlmError } = await import(pathToFileURL(path.join(DIST, "toolbox_llm.js")).href);
  const {
    listBacklogDocs,
    computeEvidenceDebt,
    parseTriageReport,
    relayTriage,
    TRIAGE_EXCERPT_CHARS,
  } = triage;
  console.log("toolBox triage suite (test_toolbox_triage.js)");

  const ws = makeWorkspace();

  // T1 — classification + excerpt bound
  const docs = listBacklogDocs(ws);
  const byId = Object.fromEntries(docs.map((d) => [d.id, d]));
  check(
    "listBacklogDocs classifies prefixes and recovers the feature name",
    docs.length === 5 &&
      byId["impl_alpha.md"].kind === "impl" &&
      byId["impl_alpha.md"].feature === "alpha" &&
      byId["review_alpha.md"].kind === "review" &&
      byId["explore_infra.md"].kind === "explore" &&
      byId["explore_infra.md"].feature === "infra" &&
      byId["notes.md"].kind === "other",
    `got ${JSON.stringify(docs.map((d) => [d.id, d.kind, d.feature]))}`,
  );
  check(
    "listBacklogDocs bounds each excerpt",
    byId["impl_alpha.md"].excerpt.length === TRIAGE_EXCERPT_CHARS,
    `excerpt was ${byId["impl_alpha.md"].excerpt.length}`,
  );

  // T2 — a workspace with no backlog/ is not an error
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "handyman-triage-empty-"));
  check("listBacklogDocs returns [] when backlog/ is missing", listBacklogDocs(empty).length === 0);

  // T3 — the evidence gap: beta only
  const debt = computeEvidenceDebt(ws);
  check(
    "computeEvidenceDebt flags done-without-review and only that",
    debt.length === 1 && debt[0].name === "beta" && debt[0].id === 2 && debt[0].missing === "review_beta.md",
    `got ${JSON.stringify(debt)}`,
  );

  // T4 — the three shapes a model actually emits
  const plain = '{"report":[{"id":"impl_alpha.md","categoria":"impl","confianza":0.9}]}';
  const fenced = "```json\n" + plain + "\n```";
  const prosed = `Aqui tienes el analisis:\n${plain}\nEspero que sirva.`;
  check(
    "parseTriageReport reads plain, fenced and prose-wrapped JSON",
    [plain, fenced, prosed].every((raw) => {
      const r = parseTriageReport(raw);
      return r.length === 1 && r[0].id === "impl_alpha.md" && r[0].categoria === "impl" && r[0].confianza === 0.9;
    }),
  );
  check(
    "parseTriageReport keeps duplicado_de when present",
    parseTriageReport('{"report":[{"id":"a.md","categoria":"impl","confianza":0.5,"duplicado_de":"b.md"}]}')[0]
      .duplicado_de === "b.md",
  );

  // T5 — junk in, empty out; bad entries dropped
  check(
    "parseTriageReport survives junk without throwing",
    ["", "no json here", "{", "[]", '{"report":"nope"}'].every((raw) => parseTriageReport(raw).length === 0),
  );
  check(
    "parseTriageReport drops entries with no usable id",
    parseTriageReport('{"report":[{"categoria":"impl"},{"id":"","categoria":"impl"},{"id":"ok.md"}]}').length === 1,
  );

  // T6 — relay happy path: deltas stream, result carries report + debt
  const deltas = [];
  let result = null;
  let errored = null;
  await relayTriage({
    system: "sys",
    prompt: "prompt",
    evidenceDebt: debt,
    draft: async (_req, onDelta) => {
      onDelta("{\"report\":[");
      onDelta('{"id":"impl_beta.md","categoria":"impl","confianza":0.7}]}');
      return {
        text: '{"report":[{"id":"impl_beta.md","categoria":"impl","confianza":0.7}]}',
        model: "fake-cheap",
        stopReason: "stop",
      };
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
    "relayTriage streams deltas and returns report + evidence_debt + model",
    errored === null &&
      deltas.length === 2 &&
      result !== null &&
      result.model === "fake-cheap" &&
      result.report.length === 1 &&
      result.report[0].id === "impl_beta.md" &&
      result.evidence_debt.length === 1 &&
      result.evidence_debt[0].name === "beta",
    `result=${JSON.stringify(result)} err=${errored && errored.message}`,
  );

  // T7 — provider failure never throws out of the relay
  let errResult = null;
  let errCaught = null;
  await relayTriage({
    system: "sys",
    prompt: "prompt",
    evidenceDebt: debt,
    draft: async () => {
      throw new LlmError("insufficient_balance", "no balance");
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
    "relayTriage maps a provider LlmError to onError with no result",
    errResult === null && errCaught !== null && errCaught.code === "insufficient_balance",
    `result=${JSON.stringify(errResult)} err=${errCaught && errCaught.code}`,
  );

  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });

  console.log(`\nSummary: ${RUN} run, ${RUN - FAILED} passed, ${FAILED} failed`);
  process.exit(FAILED === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
