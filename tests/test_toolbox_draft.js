#!/usr/bin/env node
/*
 * toolBox draft relay tests (prompt construction + BM25 dedup + relay, dist).
 *
 * No network: the provider is a deterministic fake draft() injected into
 * relayDraft, and dedup runs MiniSearch in Node over an in-memory corpus.
 * Covered:
 *   T1  buildDraftSystem + composeSystem: stable system carries the
 *       CORE/OPTIONAL template, BOTH archetype examples, and the rule that
 *       the green gate is the LAST acceptance bullet.
 *   T2  detectDuplicates (BM25): ranks a real overlap above an irrelevant
 *       doc, returns [] on empty query/corpus.
 *   T3  composeUserPrompt: includes the feature queue and discovery skills.
 *   T4  parseArchetype: research / implementation / unknown.
 *   T5  relayDraft (happy path): streams deltas, emits a final event with the
 *       parsed archetype, draft markdown and the duplicate candidates.
 *   T6  relayDraft (provider error): a LlmError becomes onError, no result.
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

async function main() {
  const draft = await import(pathToFileURL(path.join(DIST, "toolbox_draft.js")).href);
  const { LlmError } = await import(pathToFileURL(path.join(DIST, "toolbox_llm.js")).href);
  console.log("toolBox draft suite (test_toolbox_draft.js)");

  // T1 — stable system from the bundled template
  {
    const sys = draft.buildDraftSystem();
    check(
      "buildDraftSystem loads the intake template with CORE/OPTIONAL",
      sys.template.includes("CORE") && sys.template.includes("OPTIONAL"),
      `len=${sys.template.length}`,
    );
    check(
      "template carries BOTH archetype worked examples",
      sys.template.includes("Research request") &&
        sys.template.includes("Implementation request"),
      "missing one of the two examples",
    );
    const systemMsg = draft.composeSystem(sys);
    check(
      "composeSystem requires the green gate as the LAST acceptance bullet",
      systemMsg.includes("LAST acceptance bullet"),
      "no green-gate-last instruction",
    );
    check(
      "composeSystem forbids placeholders",
      systemMsg.includes("Never leave placeholders"),
      "no placeholder rule",
    );
    check(
      "composeSystem names the feature.js add contract",
      systemMsg.includes("node dist/feature.js add"),
      "no feature.js add contract",
    );
  }

  // T2 — BM25 duplicate detection
  {
    const corpus = [
      {
        id: "feature:ship_faster",
        name: "ship_faster",
        kind: "feature",
        title: "#1 ship_faster",
        text: "ship the new feature faster alpha release",
      },
      {
        id: "backlog:random_notes",
        name: "random_notes",
        kind: "backlog",
        title: "random_notes.md",
        text: "unrelated notes about documentation styling",
      },
    ];
    const dups = await draft.detectDuplicates("ship the feature faster", corpus, 5);
    check("detectDuplicates returns ranked candidates", dups.length > 0, `got ${dups.length}`);
    check(
      "detectDuplicates ranks the real overlap first",
      dups[0] && dups[0].name === "ship_faster",
      `top=${dups[0] && dups[0].name}`,
    );
    const emptyQ = await draft.detectDuplicates("   ", corpus, 5);
    check("detectDuplicates empty query -> []", Array.isArray(emptyQ) && emptyQ.length === 0);
    const emptyC = await draft.detectDuplicates("anything", [], 5);
    check("detectDuplicates empty corpus -> []", Array.isArray(emptyC) && emptyC.length === 0);
  }

  // T3 — volatile user prompt
  {
    const ctx = {
      project: "demo",
      root: "/tmp/demo",
      features: [
        { id: 7, name: "cli_recent", title: "Recent command", status: "done", depends_on: [] },
      ],
      possible_duplicates: [{ name: "cli_recent", kind: "feature", score: 12.3 }],
      skills: ["handyman", "ponytail"],
      agents: ["implementer"],
      files: [{ path: "src/recent.ts", text: "export const RECENT = [];" }],
      user_prompt: "add a recent-commands view",
    };
    const prompt = draft.composeUserPrompt(ctx);
    check("composeUserPrompt lists the feature queue", prompt.includes("cli_recent"), prompt);
    check("composeUserPrompt lists discovery skills", prompt.includes("handyman"), prompt);
    check("composeUserPrompt carries the user request verbatim", prompt.includes("recent-commands view"));
    check("composeUserPrompt lists duplicate candidates", prompt.includes("cli_recent") && prompt.includes("score"));
    check(
      "composeUserPrompt lists tagged files as context",
      prompt.includes("src/recent.ts") && prompt.includes("export const RECENT = [];"),
      "tagged file path/text not in prompt",
    );
  }

  // T4 — archetype parsing
  {
    check("parseArchetype research", draft.parseArchetype("[Research] plan it") === "research");
    check(
      "parseArchetype implementation",
      draft.parseArchetype("[Implementation] build it") === "implementation",
    );
    check("parseArchetype unknown", draft.parseArchetype("no marker here") === "unknown");
  }

  // T5 — relay happy path with a fake provider
  {
    const seen = [];
    let result = null;
    let errored = null;
    const fakeDraft = async (_req, onDelta) => {
      onDelta("## Feature\n");
      onDelta("- name: thing\n");
      return { text: "[Implementation] ## Feature\n- name: thing", model: "fake", stopReason: "stop" };
    };
    const possibleDuplicates = [{ name: "other_thing", kind: "feature", score: 5 }];
    await draft.relayDraft({
      system: "SYS",
      userPrompt: "U",
      draft: fakeDraft,
      possibleDuplicates,
      onDelta: (t) => seen.push(t),
      onResult: (e) => {
        result = e;
      },
      onError: (e) => {
        errored = e;
      },
    });
    check(
      "relay streams every delta in order",
      seen.join("") === "## Feature\n- name: thing\n",
      seen.join("|"),
    );
    check("relay final event carries archetype", result && result.archetype === "implementation");
    check("relay final event carries draft_md", result && /- name: thing/.test(result.draft_md));
    check(
      "relay final event carries duplicate candidates",
      result &&
        Array.isArray(result.possible_duplicates) &&
        result.possible_duplicates[0] &&
        result.possible_duplicates[0].name === "other_thing",
    );
    check("relay happy path does not error", errored === null);
  }

  // T6 — relay provider error
  {
    let result = null;
    let errored = null;
    await draft.relayDraft({
      system: "SYS",
      userPrompt: "U",
      draft: async () => {
        throw new LlmError("insufficient_balance", "no balance");
      },
      possibleDuplicates: [],
      onDelta: () => {},
      onResult: (e) => {
        result = e;
      },
      onError: (e) => {
        errored = e;
      },
    });
    check(
      "relay maps a LlmError to onError with the stable code",
      errored && errored.code === "insufficient_balance",
      `code=${errored && errored.code}`,
    );
    check("relay error path emits no result", result === null);
  }

  console.log(`\nSummary: ${RUN} run, ${RUN - FAILED} passed, ${FAILED} failed`);
  process.exit(FAILED === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
