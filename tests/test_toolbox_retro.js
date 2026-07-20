#!/usr/bin/env node
/*
 * toolBox retro/lessons tests (feature 35, dist).
 *
 * No network and no server: the provider is a deterministic fake draft()
 * injected into relayRetro; the disk half runs against a throwaway workspace.
 * Covered:
 *   T1  readRetroCorpus: picks up history.md and the backlog of CLOSED
 *       features only - open work is not a lesson yet.
 *   T2  readRetroCorpus: a workspace with no backlog/ still returns history.
 *   T3  composeRetroSystem: demands the evidence bar, the 3-5 range, and
 *       forbids editing docs/conventions.md.
 *   T4  composeRetroPrompt: carries the closed-feature list, history and docs.
 *   T5  parseRetroPatterns: reads plain / fenced / prose-wrapped JSON.
 *   T6  parseRetroPatterns ENFORCES the evidence bar: a one-feature pattern is
 *       dropped and counted, not returned. This is the anti-generalisation
 *       rule made real rather than merely requested in the prompt.
 *   T7  parseRetroPatterns: dedupes features, defaults tipo, caps at 5, and
 *       survives junk without throwing.
 *   T8  relayRetro (happy path): streams deltas, returns patterns + discarded.
 *   T9  relayRetro (provider error): LlmError becomes onError, no result.
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

/** alpha and beta are done; gamma is still pending, so its backlog must not
 *  reach the corpus. */
function makeWorkspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "handyman-retro-"));
  fs.mkdirSync(path.join(ws, "backlog"), { recursive: true });
  fs.mkdirSync(path.join(ws, "progress"), { recursive: true });
  fs.writeFileSync(
    path.join(ws, "feature_list.json"),
    JSON.stringify({
      project: "fixture",
      features: [
        { id: 1, name: "alpha", status: "done" },
        { id: 2, name: "beta", status: "done" },
        { id: 3, name: "gamma", status: "pending" },
      ],
    }),
  );
  fs.writeFileSync(path.join(ws, "progress", "history.md"), "# History\n- cerro alpha\n");
  fs.writeFileSync(path.join(ws, "backlog", "impl_alpha.md"), "impl alpha body");
  fs.writeFileSync(path.join(ws, "backlog", "review_alpha.md"), "review alpha body");
  fs.writeFileSync(path.join(ws, "backlog", "impl_beta.md"), "impl beta body");
  fs.writeFileSync(path.join(ws, "backlog", "impl_gamma.md"), "impl gamma body");
  return ws;
}

const P = (titulo, features, extra) =>
  JSON.stringify({ titulo, tipo: "patron", features, detalle: "d", ...extra });

async function main() {
  const retro = await import(pathToFileURL(path.join(DIST, "toolbox_retro.js")).href);
  const { LlmError } = await import(pathToFileURL(path.join(DIST, "toolbox_llm.js")).href);
  const {
    readRetroCorpus,
    composeRetroSystem,
    composeRetroPrompt,
    parseRetroPatterns,
    relayRetro,
    RETRO_MIN_EVIDENCE,
    RETRO_MAX_PATTERNS,
  } = retro;
  console.log("toolBox retro suite (test_toolbox_retro.js)");

  const ws = makeWorkspace();

  // T1 — closed features only
  const corpus = readRetroCorpus(ws);
  const ids = corpus.docs.map((d) => d.id).sort();
  check(
    "readRetroCorpus takes history and the backlog of CLOSED features only",
    corpus.history.includes("cerro alpha") &&
      corpus.closed.sort().join(",") === "alpha,beta" &&
      ids.join(",") === "impl_alpha.md,impl_beta.md,review_alpha.md" &&
      !ids.includes("impl_gamma.md"),
    `closed=${corpus.closed} docs=${ids}`,
  );

  // T2 — no backlog dir
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "handyman-retro-bare-"));
  fs.mkdirSync(path.join(bare, "progress"), { recursive: true });
  fs.writeFileSync(path.join(bare, "progress", "history.md"), "# H\n");
  const bareCorpus = readRetroCorpus(bare);
  check(
    "readRetroCorpus survives a workspace with no backlog/",
    bareCorpus.docs.length === 0 && bareCorpus.history.includes("# H"),
  );

  // T3 — the rules live in the system prompt
  const sys = composeRetroSystem();
  check(
    "the system prompt demands the evidence bar, the 3-5 range and no conventions edit",
    sys.includes(String(RETRO_MIN_EVIDENCE)) &&
      sys.includes(String(RETRO_MAX_PATTERNS)) &&
      sys.toLowerCase().includes("anecdota") &&
      sys.includes("docs/conventions.md"),
    "a rule went missing from composeRetroSystem",
  );

  // T4 — the prompt carries the material
  const prompt = composeRetroPrompt(corpus);
  check(
    "composeRetroPrompt carries closed features, history and closed backlog",
    prompt.includes("alpha") &&
      prompt.includes("cerro alpha") &&
      prompt.includes("impl_beta.md") &&
      !prompt.includes("impl_gamma.md"),
  );

  // T5 — the three shapes
  const two = `{"patterns":[${P("usar shims", ["alpha", "beta"])}]}`;
  check(
    "parseRetroPatterns reads plain, fenced and prose-wrapped JSON",
    [two, "```json\n" + two + "\n```", `Mira:\n${two}\nfin`].every((raw) => {
      const r = parseRetroPatterns(raw);
      return r.patterns.length === 1 && r.patterns[0].titulo === "usar shims";
    }),
  );

  // T6 — THE rule: one feature is an anecdote
  const mixed = `{"patterns":[${P("bien", ["alpha", "beta"])},${P("anecdota", ["alpha"])},${P("sin titulo", ["alpha", "beta"], { titulo: "" })}]}`;
  const r6 = parseRetroPatterns(mixed);
  check(
    "parseRetroPatterns DROPS a one-feature pattern and counts it as discarded",
    r6.patterns.length === 1 && r6.patterns[0].titulo === "bien" && r6.discarded === 2,
    `patterns=${JSON.stringify(r6.patterns.map((p) => p.titulo))} discarded=${r6.discarded}`,
  );

  // T7 — dedupe, tipo default, cap, junk
  const dupe = parseRetroPatterns(`{"patterns":[${P("d", ["alpha", "alpha", "beta"])}]}`);
  check(
    "parseRetroPatterns dedupes the feature list",
    dupe.patterns.length === 1 && dupe.patterns[0].features.join(",") === "alpha,beta",
  );
  const badTipo = parseRetroPatterns(
    `{"patterns":[{"titulo":"t","tipo":"otra cosa","features":["a","b"],"detalle":"d"}]}`,
  );
  check(
    "parseRetroPatterns defaults an unknown tipo to 'patron' and keeps 'antipatron'",
    badTipo.patterns[0].tipo === "patron" &&
      parseRetroPatterns(
        `{"patterns":[{"titulo":"t","tipo":"antipatron","features":["a","b"],"detalle":"d"}]}`,
      ).patterns[0].tipo === "antipatron",
  );
  const many = parseRetroPatterns(
    `{"patterns":[${Array.from({ length: 8 }, (_, i) => P(`p${i}`, ["a", "b"])).join(",")}]}`,
  );
  check(
    "parseRetroPatterns caps at RETRO_MAX_PATTERNS and counts the overflow",
    many.patterns.length === RETRO_MAX_PATTERNS && many.discarded === 3,
    `len=${many.patterns.length} discarded=${many.discarded}`,
  );
  check(
    "parseRetroPatterns survives junk without throwing",
    ["", "no json", "{", '{"patterns":"nope"}'].every((raw) => {
      const r = parseRetroPatterns(raw);
      return r.patterns.length === 0 && r.discarded === 0;
    }),
  );

  // T8 — relay happy path
  const deltas = [];
  let result = null;
  let errored = null;
  const answer = `{"patterns":[${P("shims por paquete", ["alpha", "beta"])},${P("anecdota", ["alpha"])}]}`;
  await relayRetro({
    system: "sys",
    prompt: "prompt",
    draft: async (_req, onDelta) => {
      onDelta("{\"patterns\":[");
      onDelta("...]}");
      return { text: answer, model: "fake-cheap", stopReason: "stop" };
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
    "relayRetro streams deltas and returns surviving patterns + discarded + model",
    errored === null &&
      deltas.length === 2 &&
      result !== null &&
      result.patterns.length === 1 &&
      result.patterns[0].features.length >= RETRO_MIN_EVIDENCE &&
      result.discarded === 1 &&
      result.model === "fake-cheap",
    `result=${JSON.stringify(result)}`,
  );

  // T9 — provider failure
  let errResult = null;
  let errCaught = null;
  await relayRetro({
    system: "sys",
    prompt: "prompt",
    draft: async () => {
      throw new LlmError("provider_error", "boom");
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
    "relayRetro maps a provider LlmError to onError with no result",
    errResult === null && errCaught !== null && errCaught.code === "provider_error",
  );

  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(bare, { recursive: true, force: true });

  console.log(`\nSummary: ${RUN} run, ${RUN - FAILED} passed, ${FAILED} failed`);
  process.exit(FAILED === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
