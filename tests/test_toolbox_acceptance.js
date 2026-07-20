#!/usr/bin/env node
/*
 * toolBox acceptance-from-diff tests (feature 33, dist).
 *
 * No network and no server: the provider is a deterministic fake draft()
 * injected into relayAcceptance. Covered:
 *   T1  composeAcceptanceSystem: demands observable verbs, bans the vague
 *       phrasings by name, and pins the green gate as the last bullet.
 *   T2  composeAcceptancePrompt: distinct framing per source, and it says so
 *       when the material is empty or was truncated.
 *   T3  lastBulletIsGreenGate: true for both gate commands, for `-`/`*`/`+`
 *       and numbered bullets, and only when the gate is genuinely LAST.
 *   T4  lastBulletIsGreenGate: false for empty, prose-only, or vague endings.
 *   T5  relayAcceptance (happy path): streams deltas, reports gate_last=true,
 *       echoes source and diff_truncated.
 *   T6  relayAcceptance: a draft whose last bullet is NOT the gate is still
 *       returned, with gate_last=false - the model is reported, not censored.
 *   T7  relayAcceptance (provider error): LlmError becomes onError, no result.
 *
 * Exit code 0 when all pass, 1 otherwise.
 */
"use strict";

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

const GATE = "bash tests/run_tests.sh passes y ./init.sh exits 0.";

async function main() {
  const acc = await import(pathToFileURL(path.join(DIST, "toolbox_acceptance.js")).href);
  const { LlmError } = await import(pathToFileURL(path.join(DIST, "toolbox_llm.js")).href);
  const {
    composeAcceptanceSystem,
    composeAcceptancePrompt,
    lastBulletIsGreenGate,
    relayAcceptance,
    ACCEPTANCE_SPEC_MAX_CHARS,
  } = acc;
  console.log("toolBox acceptance suite (test_toolbox_acceptance.js)");

  // T1 — the contract lives in the system prompt
  const sys = composeAcceptanceSystem();
  check(
    "the system prompt demands observable verbs and bans the vague phrasings",
    sys.includes("OBSERVABLE") &&
      sys.includes("exit 0") &&
      sys.includes("PROHIBIDO") &&
      sys.includes("deberia funcionar") &&
      sys.includes("ULTIMA bala") &&
      sys.includes("./init.sh"),
    "a rule went missing from composeAcceptanceSystem",
  );
  check("ACCEPTANCE_SPEC_MAX_CHARS is a sane budget", ACCEPTANCE_SPEC_MAX_CHARS === 60000);

  // T2 — per-source framing + honesty about missing/truncated material
  const pDiff = composeAcceptancePrompt("diff", "diff --git a/x b/x", false);
  const pSpec = composeAcceptancePrompt("spec", "quiero un boton", false);
  const pEmpty = composeAcceptancePrompt("diff", "", false);
  const pTrunc = composeAcceptancePrompt("spec", "algo", true);
  check(
    "composeAcceptancePrompt frames diff and spec differently",
    pDiff.includes("diff de trabajo") &&
      pDiff.includes("diff --git") &&
      pSpec.includes("especificacion") &&
      pSpec.includes("quiero un boton"),
  );
  check(
    "composeAcceptancePrompt declares empty material and truncation",
    pEmpty.includes("diff vacio") && pTrunc.includes("truncado"),
  );

  // T3 — the gate check across bullet styles
  check(
    "lastBulletIsGreenGate accepts both gate commands and all bullet styles",
    lastBulletIsGreenGate(`- hace X\n- ${GATE}`) &&
      lastBulletIsGreenGate(`* hace X\n* bash tests/run_tests.sh passes.`) &&
      lastBulletIsGreenGate(`+ hace X\n+ ./init.sh exits 0.`) &&
      lastBulletIsGreenGate(`1. hace X\n2. ${GATE}`),
  );
  check(
    "lastBulletIsGreenGate is false when the gate is not the LAST bullet",
    !lastBulletIsGreenGate(`- ${GATE}\n- y ademas hace X`),
  );

  // T4 — negatives
  check(
    "lastBulletIsGreenGate is false for empty, prose-only or vague endings",
    !lastBulletIsGreenGate("") &&
      !lastBulletIsGreenGate("no hay balas aqui, solo prosa") &&
      !lastBulletIsGreenGate("- hace X\n- deberia funcionar"),
  );

  // T5 — happy path
  const deltas = [];
  let result = null;
  let errored = null;
  const good = `- POST /api/x responde 400 sin root\n- ${GATE}`;
  await relayAcceptance({
    system: "sys",
    prompt: "prompt",
    source: "diff",
    truncated: true,
    draft: async (_req, onDelta) => {
      onDelta("- POST /api/x ");
      onDelta("responde 400 sin root");
      return { text: good, model: "fake-cheap", stopReason: "stop" };
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
    "relayAcceptance streams deltas and reports gate_last, source, truncation",
    errored === null &&
      deltas.length === 2 &&
      result !== null &&
      result.acceptance_md === good &&
      result.model === "fake-cheap" &&
      result.source === "diff" &&
      result.gate_last === true &&
      result.diff_truncated === true,
    `result=${JSON.stringify(result)}`,
  );

  // T6 — non-compliant draft is reported, not censored
  let bad = null;
  await relayAcceptance({
    system: "sys",
    prompt: "prompt",
    source: "spec",
    truncated: false,
    draft: async () => ({ text: "- hace X\n- deberia funcionar", model: "m", stopReason: "stop" }),
    onDelta: () => {},
    onResult: (e) => {
      bad = e;
    },
    onError: () => {},
  });
  check(
    "a draft missing the green gate still returns, flagged gate_last=false",
    bad !== null && bad.gate_last === false && bad.acceptance_md.includes("deberia funcionar"),
    `got ${JSON.stringify(bad)}`,
  );

  // T7 — provider failure
  let errResult = null;
  let errCaught = null;
  await relayAcceptance({
    system: "sys",
    prompt: "prompt",
    source: "diff",
    truncated: false,
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
    "relayAcceptance maps a provider LlmError to onError with no result",
    errResult === null && errCaught !== null && errCaught.code === "provider_error",
  );

  console.log(`\nSummary: ${RUN} run, ${RUN - FAILED} passed, ${FAILED} failed`);
  process.exit(FAILED === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
