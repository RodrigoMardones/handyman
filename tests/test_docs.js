#!/usr/bin/env node
/*
 * Documentation-structure tests for the Handyman skill (Node port).
 *
 * Black-box contract tests, ported 1:1 from tests/test_docs.py after the
 * Python→TypeScript migration made Node the sole runtime. Validates the
 * contracts the skill's markdown promises:
 *   T1  Every assets/*.template.json file is valid JSON.
 *   T2  Every relative markdown link across the repo resolves to a file.
 *   T3  Obsidian frontmatter keys + tag namespace appear in the assets templates.
 *   T4  Token budgets: SKILL.md word count, frontmatter description length,
 *       and AGENTS.template.md word count stay within their caps.
 *   T5  Security contract: references/security.md exists, is referenced, and the
 *       data-not-instructions boundary survives in AGENTS + role templates.
 *   T6  W011 passive framing: the scanned skill body never frames an agent as
 *       the subject that reads/ingests outsider-authored content, while the
 *       mitigation guidance survives.
 *
 * Schema conformance (the former jsonschema/Draft7Validator checks) now uses
 * ajv, the same validator the TS toolchain ships with.
 *
 * Exit code 0 when all pass, 1 otherwise.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { pathToFileURL } = require("url");

// ajv lives in the handyman toolchain's node_modules; resolve it from there.
const HANDYMAN_DIR = path.join(__dirname, "..", "handyman");
const handymanRequire = createRequire(pathToFileURL(HANDYMAN_DIR + path.sep + "x.js").href);
const AjvMod = handymanRequire("ajv");
const Ajv = AjvMod.default || AjvMod;

const REPO_ROOT = path.join(__dirname, "..");
// The skill content (SKILL.md, assets/, references/) lives under handyman/;
// repo-level docs (README.md, docs/) stay at REPO_ROOT.
const ROOT = path.join(REPO_ROOT, "handyman");

const PASS = process.stdout.isatty ? "\x1b[32mPASS\x1b[0m" : "PASS";
const FAIL = process.stdout.isatty ? "\x1b[31mFAIL\x1b[0m" : "FAIL";

let _failures = 0;
let _run = 0;

function check(name, ok, detail) {
  _run += 1;
  if (ok) {
    console.log("  " + PASS + " " + name);
  } else {
    _failures += 1;
    console.log("  " + FAIL + " " + name);
    if (detail) console.log("       " + detail);
  }
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function readJSON(p) {
  return JSON.parse(readText(p));
}

function fencedBlocks(text, lang) {
  const pattern = new RegExp("```" + lang.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\n([\\s\\S]*?)```", "g");
  const out = [];
  let m;
  while ((m = pattern.exec(text)) !== null) out.push(m[1]);
  return out;
}

function skillVersion() {
  const text = readText(path.join(ROOT, "SKILL.md"));
  const match = text.match(/^\s+version:\s*(.+)$/m);
  return match ? match[1].trim() : "";
}

function testJsonTemplates() {
  const assetsDir = path.join(ROOT, "assets");
  const jsonFiles = fs.readdirSync(assetsDir)
    .filter((n) => n.endsWith(".template.json"))
    .sort();
  check("assets/ contains JSON templates", jsonFiles.length > 0, "no *.template.json files found");
  for (const name of jsonFiles) {
    const block = readText(path.join(assetsDir, name));
    try {
      JSON.parse(block);
      check("JSON template '" + name + "' parses", true);
    } catch (exc) {
      check("JSON template '" + name + "' parses", false, String(exc.message));
    }
  }
}

const LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]*`/g;

function stripCode(text) {
  text = text.replace(FENCE_RE, "");
  return text.replace(INLINE_CODE_RE, "");
}

function testMarkdownLinks() {
  const mdFiles = [];
  const stack = [REPO_ROOT];
  while (stack.length) {
    const dirpath = stack.pop();
    const parts = dirpath.split(path.sep);
    if (parts.includes(".git") || parts.includes("assets")
        || parts.includes("node_modules") || parts.includes("dist")
        || parts.includes("coverage")) {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(dirpath, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dirpath, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.name.endsWith(".md")) {
        mdFiles.push(full);
      }
    }
  }
  check("repo has markdown files", mdFiles.length > 0);
  const broken = [];
  for (const md of mdFiles) {
    let content = readText(md);
    content = stripCode(content);
    let m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(content)) !== null) {
      let target = m[1].trim();
      if (/^(https?:|www\.|#|mailto:)/.test(target)) continue;
      target = target.split("#", 1)[0];
      if (!target) continue;
      const resolved = path.normalize(path.join(path.dirname(md), target));
      if (!fs.existsSync(resolved)) {
        broken.push(path.relative(REPO_ROOT, md) + " -> " + target);
      }
    }
  }
  check("all relative markdown links resolve", broken.length === 0, broken.join("; "));
}

function testObsidianContract() {
  const assetsDir = path.join(ROOT, "assets");
  let text = "";
  for (const name of fs.readdirSync(assetsDir).sort()) {
    if (name.endsWith(".template.md") || name.endsWith(".template")) {
      text += readText(path.join(assetsDir, name)) + "\n";
    }
  }
  const requiredFrontmatter = ["feature:", "status:", "role:", "updated:", "tags:"];
  for (const key of requiredFrontmatter) {
    check("assets templates document frontmatter key '" + key + "'", text.includes(key));
  }
  for (const tag of ["handyman/session/current", "handyman/history", "handyman/moc"]) {
    check("assets templates document tag '" + tag + "'", text.includes(tag));
  }
}

function testTokenBudgets() {
  const budgets = [
    ["SKILL.md", "words", 1000],
    [path.join("assets", "AGENTS.template.md"), "words", 250],
  ];
  for (const [relPath, unit, cap] of budgets) {
    const count = readText(path.join(ROOT, relPath)).split(/\s+/).filter(Boolean).length;
    check(relPath + " stays within " + cap + " " + unit + " (" + count + ")", count <= cap, count + " " + unit + " > " + cap);
  }
  const skill = readText(path.join(ROOT, "SKILL.md"));
  const match = skill.match(/^description:\s*'(.*)'\s*$/m);
  check("SKILL.md frontmatter has a single-line description", match !== null);
  if (match) {
    const length = match[1].length;
    check("description stays within 500 chars (" + length + ")", length <= 500, length + " chars > 500");
  }
}

function testSecurityContract() {
  const security = path.join(ROOT, "references", "security.md");
  check("references/security.md exists", fs.existsSync(security) && fs.statSync(security).isFile());
  const skill = readText(path.join(ROOT, "SKILL.md"));
  check("SKILL.md links to references/security.md", skill.includes("references/security.md"));
  const refReadme = readText(path.join(ROOT, "references", "README.md"));
  check("references/README.md lists security.md", refReadme.includes("security.md"));
  const agents = readText(path.join(ROOT, "assets", "AGENTS.template.md"));
  check("AGENTS.template.md states the data-not-instructions rule", agents.includes("not instructions"));
  for (const role of ["leader", "implementer", "reviewer", "explorer"]) {
    const body = readText(path.join(ROOT, "assets", "role-" + role + ".template.md"));
    check("role-" + role + " template carries the untrusted-content boundary", body.includes("not instructions"));
  }
}

const W011_REMOVED = [
  "constantly read free text",
  "continuously ingest text they did not author",
  "ingests outsider-authored content",
  "ingests arbitrary code",
  "reads that report as trusted input",
];
const W011_SUBJECT_VERB = new RegExp(
  "\\b(agents?|explorers?|leaders?|reviewers?|implementers?)\\b" +
  "[^.\\n]{0,40}?\\b(ingests?|reads?|fetch(?:es)?)\\b" +
  "[^.\\n]{0,30}?\\b(free text|outsider|arbitrary code|untrusted|did not author)\\b",
  "i",
);

function scannedSkillBody() {
  const bodies = {};
  bodies["SKILL.md"] = readText(path.join(ROOT, "SKILL.md"));
  for (const sub of ["references", "assets"]) {
    const subDir = path.join(ROOT, sub);
    for (const name of fs.readdirSync(subDir).sort()) {
      if (name.endsWith(".md")) {
        bodies[sub + "/" + name] = readText(path.join(subDir, name));
      }
    }
  }
  return bodies;
}

function testW011PassiveFraming() {
  const bodies = scannedSkillBody();
  const joined = Object.values(bodies).join("\n");
  for (const phrase of W011_REMOVED) {
    check("W011 trigger phrase absent: '" + phrase + "'", !joined.includes(phrase),
      "rephrase as passive, resource-as-subject prose");
  }
  for (const [p, text] of Object.entries(bodies)) {
    const m = text.match(W011_SUBJECT_VERB);
    check(p + " has no agent-as-ingestor construction", m === null, m ? m[0] : "");
  }
  const sec = bodies["references/security.md"];
  check("security.md keeps the data-not-instructions golden rule", sec.includes("never as instructions"));
  check("security.md keeps the per-role operating rules", sec.includes("Operating Rules Per Role"));
  const anat = bodies["references/anatomy.md"];
  check("anatomy.md keeps the data-not-instructions boundary", anat.includes("never instructions to the agent"));
}

// Each schema file maps to the templates that must validate against it.
const SCHEMA_TARGETS = {
  "feature_list.schema.json": ["feature_list.template.json"],
  "harness.config.schema.json": [
    "harness.config.local.template.json",
    "harness.config.global.template.json",
  ],
};

function compileSchema(schema) {
  // strict:false so ajv accepts draft-07 idioms (definitions/$ref) without
  // complaining about its stricter 2019-09 defaults.
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

function schemaErrors(schema, instance) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validator = ajv.compile(schema);
  if (validator(instance)) return [];
  return validator.errors || [];
}

function testJsonSchemas() {
  const schemasDir = path.join(ROOT, "assets", "schemas");
  const assetsDir = path.join(ROOT, "assets");
  const loaded = {};
  for (const schemaName of Object.keys(SCHEMA_TARGETS).sort()) {
    const p = path.join(schemasDir, schemaName);
    const exists = fs.existsSync(p) && fs.statSync(p).isFile();
    check("schema '" + schemaName + "' exists", exists);
    if (!exists) continue;
    let schema;
    try {
      schema = readJSON(p);
      check("schema '" + schemaName + "' parses", true);
    } catch (exc) {
      check("schema '" + schemaName + "' parses", false, String(exc.message));
      continue;
    }
    check("schema '" + schemaName + "' declares draft-07", String(schema.$schema || "").includes("draft-07"));
    loaded[schemaName] = schema;
  }

  for (const [schemaName, schema] of Object.entries(loaded)) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    let okSchema;
    try {
      okSchema = ajv.validateSchema(schema);
    } catch (exc) {
      check("schema '" + schemaName + "' is valid draft-07", false, String(exc.message));
      continue;
    }
    check("schema '" + schemaName + "' is valid draft-07", okSchema);
    const errors = schemaErrors.bind(null, schema);
    for (const templateName of SCHEMA_TARGETS[schemaName]) {
      const instance = readJSON(path.join(assetsDir, templateName));
      const errs = errors(instance);
      const detail = errs.map((e) => ((e.instancePath || "<root>") + ": " + e.message)).join("; ");
      check("template '" + templateName + "' validates against '" + schemaName + "'", errs.length === 0, detail);
    }
  }
}

function testHarnessVersion() {
  const schemasDir = path.join(ROOT, "assets", "schemas");
  const assetsDir = path.join(ROOT, "assets");
  const semver = /^\d+\.\d+\.\d+$/;
  const cfgSchema = readJSON(path.join(schemasDir, "harness.config.schema.json"));
  check("harness.config schema declares harness_version", Object.keys(cfgSchema.properties || {}).includes("harness_version"));
  check("harness_version stays optional in harness.config schema", !(cfgSchema.required || []).includes("harness_version"));
  const flSchema = readJSON(path.join(schemasDir, "feature_list.schema.json"));
  const configProps = (((flSchema.definitions || {}).config || {}).properties || {});
  check("feature_list config schema declares harness_version", Object.keys(configProps).includes("harness_version"));
  for (const name of ["harness.config.local.template.json", "harness.config.global.template.json"]) {
    const data = readJSON(path.join(assetsDir, name));
    check("template '" + name + "' carries harness_version", Object.keys(data).includes("harness_version"));
  }
  const flTemplate = readJSON(path.join(assetsDir, "feature_list.template.json"));
  check("feature_list template config carries harness_version", Object.keys(flTemplate.config || {}).includes("harness_version"));
  const version = skillVersion();
  check("SKILL.md metadata.version parses as semver", semver.test(version), version);
}

function testDiscoveryConfig() {
  const schemasDir = path.join(ROOT, "assets", "schemas");
  const assetsDir = path.join(ROOT, "assets");
  const cfgSchema = readJSON(path.join(schemasDir, "harness.config.schema.json"));
  check("harness.config schema declares discovery", Object.keys(cfgSchema.properties || {}).includes("discovery"));
  check("discovery stays optional in harness.config schema", !(cfgSchema.required || []).includes("discovery"));
  const discDef = (cfgSchema.definitions || {}).discovery || {};
  check("discovery definition lists skills and mcp",
    Object.keys(discDef.properties || {}).includes("skills") && Object.keys(discDef.properties || {}).includes("mcp"));
  check("discovery definition lists agents", Object.keys(discDef.properties || {}).includes("agents"));
  check("discovery rejects unknown keys (additionalProperties:false)", discDef.additionalProperties === false);
  const flSchema = readJSON(path.join(schemasDir, "feature_list.schema.json"));
  const configProps = (((flSchema.definitions || {}).config || {}).properties || {});
  check("feature_list config schema declares discovery", Object.keys(configProps).includes("discovery"));
  const flDiscDef = (flSchema.definitions || {}).discovery || {};
  check("feature_list discovery definition lists agents", Object.keys(flDiscDef.properties || {}).includes("agents"));
  for (const name of ["harness.config.local.template.json", "harness.config.global.template.json"]) {
    const data = readJSON(path.join(assetsDir, name));
    const disc = data.discovery;
    check("template '" + name + "' carries a discovery block",
      disc !== null && typeof disc === "object" && Array.isArray(disc.skills) && Array.isArray(disc.mcp) && Array.isArray(disc.agents));
  }
  const flTemplate = readJSON(path.join(assetsDir, "feature_list.template.json"));
  check("feature_list template config carries discovery", Object.keys(flTemplate.config || {}).includes("discovery"));
  check("feature_list template discovery carries agents",
    Array.isArray((((flTemplate.config || {}).discovery) || {}).agents));
  const bad = readJSON(path.join(assetsDir, "harness.config.local.template.json"));
  bad.discovery.unexpected = ["x"];
  check("an unknown key inside discovery is rejected", schemaErrors(cfgSchema, bad).length > 0);
}

function testSprintConfig() {
  const schemasDir = path.join(ROOT, "assets", "schemas");
  const assetsDir = path.join(ROOT, "assets");
  const flSchema = readJSON(path.join(schemasDir, "feature_list.schema.json"));
  const featureDef = (flSchema.definitions || {}).feature || {};
  check("feature definition declares sprint", Object.keys(featureDef.properties || {}).includes("sprint"));
  check("sprint stays optional in the feature contract", !(featureDef.required || []).includes("sprint"));
  check("feature definition still rejects unknown keys", featureDef.additionalProperties === false);
  const sprintProp = (featureDef.properties || {}).sprint || {};
  check("sprint carries a partition-label pattern", String(sprintProp.pattern || "").includes("SP"));
  const configProps = (((flSchema.definitions || {}).config || {}).properties || {});
  check("feature_list config schema declares current_sprint", Object.keys(configProps).includes("current_sprint"));
  const cfgSchema = readJSON(path.join(schemasDir, "harness.config.schema.json"));
  check("harness.config schema declares current_sprint", Object.keys(cfgSchema.properties || {}).includes("current_sprint"));
  check("current_sprint stays optional in harness.config schema", !(cfgSchema.required || []).includes("current_sprint"));
  for (const name of ["harness.config.local.template.json", "harness.config.global.template.json"]) {
    const data = readJSON(path.join(assetsDir, name));
    check("template '" + name + "' carries the current_sprint sentinel", Object.keys(data).includes("current_sprint") && data.current_sprint === null);
  }
  const flTemplate = readJSON(path.join(assetsDir, "feature_list.template.json"));
  check("feature_list template config carries the current_sprint sentinel",
    Object.keys(flTemplate.config || {}).includes("current_sprint") && flTemplate.config.current_sprint === null);
  const good = JSON.parse(JSON.stringify(flTemplate));
  good.config.current_sprint = "2026-SP1";
  good.features[0].sprint = "2026-SP1";
  check("a labeled feature and open sprint validate", schemaErrors(flSchema, good).length === 0);
  const bad = JSON.parse(JSON.stringify(flTemplate));
  bad.features[0].sprint = "sprint-one";
  check("a malformed sprint label is rejected", schemaErrors(flSchema, bad).length > 0);
}

function testDependsOnContract() {
  const schemasDir = path.join(ROOT, "assets", "schemas");
  const flSchema = readJSON(path.join(schemasDir, "feature_list.schema.json"));
  const featureDef = (flSchema.definitions || {}).feature || {};
  const dep = (featureDef.properties || {}).depends_on || {};
  check("feature definition declares depends_on", Object.keys(dep).length > 0);
  check("depends_on stays optional in the feature contract", !(featureDef.required || []).includes("depends_on"));
  check("depends_on is an array of integer ids", dep.type === "array" && ((dep.items || {}).type === "integer"));
  check("depends_on ids are unique", dep.uniqueItems === true);
  check("feature definition still rejects unknown keys", featureDef.additionalProperties === false);
  const anatomy = readText(path.join(ROOT, "references", "anatomy.md"));
  check("anatomy.md documents depends_on", anatomy.includes("depends_on"));
  check("anatomy.md points readiness at the Node feature CLI", anatomy.includes("node dist/feature.js ready"));
  const doc = { project: "t", features: [
    { id: 1, name: "a", status: "done" },
    { id: 2, name: "b", status: "pending", depends_on: [1] },
  ] };
  check("a feature with integer depends_on validates", schemaErrors(flSchema, doc).length === 0);
  const bad = { project: "t", features: [
    { id: 2, name: "b", status: "pending", depends_on: ["a"] },
  ] };
  check("a non-integer depends_on entry is rejected", schemaErrors(flSchema, bad).length > 0);
}

function testUnattendedLoopReference() {
  const workflow = readText(path.join(ROOT, "references", "workflow.md"));
  check("workflow.md has the Unattended Loop section", workflow.includes("## Unattended Loop"));
  for (const token of ["node dist/feature.js ready", "exit 3", "stop", "One feature per iteration"]) {
    check("Unattended Loop documents '" + token + "'", workflow.includes(token));
  }
  check("stability check lists the worklist control", workflow.includes("**Worklist**"));
  const preflight = readText(path.join(ROOT, "src", "preflight.ts"));
  check("preflight runs the worklist block", preflight.includes('"worklist"'));
  check("preflight prints the loop stop condition", preflight.includes("loop stop condition"));
}

function testTwoStageReview() {
  const template = readText(path.join(ROOT, "assets", "backlog-review.template.md"));
  check("review template has Stage 1: Spec Compliance", template.includes("## Stage 1: Spec Compliance"));
  check("review template has Stage 2: Code Quality", template.includes("## Stage 2: Code Quality"));
  check("Stage 1 cut rule is stated in the template", template.includes("without moving to Stage 2"));
  check("Stage 1 checks the acceptance criteria", template.includes("acceptance criterion"));
  check("Stage 2 keeps the verifier gate", template.includes("Verifier exits 0"));
  const workflow = readText(path.join(ROOT, "references", "workflow.md"));
  check("Reviewer Protocol prescribes the two ordered stages",
    workflow.includes("Stage 1 — spec compliance") && workflow.includes("Stage 2 — code quality"));
  check("Reviewer Protocol states the Stage 1 cut", workflow.includes("without continuing to Stage 2"));
}

function testEvalSet() {
  const schemaPath = path.join(ROOT, "assets", "schemas", "trigger_eval.schema.json");
  check("schema 'trigger_eval.schema.json' exists", fs.existsSync(schemaPath) && fs.statSync(schemaPath).isFile());
  let schema = null;
  if (fs.existsSync(schemaPath)) {
    try {
      schema = readJSON(schemaPath);
      check("schema 'trigger_eval.schema.json' parses", true);
    } catch (exc) {
      check("schema 'trigger_eval.schema.json' parses", false, String(exc.message));
    }
    if (schema !== null) {
      check("schema 'trigger_eval.schema.json' declares draft-07", String(schema.$schema || "").includes("draft-07"));
    }
  }
  const evalPath = path.join(ROOT, "evals", "trigger-eval.json");
  check("evals/trigger-eval.json exists", fs.existsSync(evalPath) && fs.statSync(evalPath).isFile());
  if (!fs.existsSync(evalPath)) return;
  let evalSet;
  try {
    evalSet = readJSON(evalPath);
    check("evals/trigger-eval.json parses", true);
  } catch (exc) {
    check("evals/trigger-eval.json parses", false, String(exc.message));
    return;
  }
  check("eval set is a non-empty array", Array.isArray(evalSet) && evalSet.length > 0);
  if (!Array.isArray(evalSet)) return;
  const wellFormed = evalSet.every((item) =>
    item !== null && typeof item === "object"
    && typeof item.query === "string" && item.query.trim() !== ""
    && typeof item.should_trigger === "boolean");
  check("every eval item has a non-empty query and a boolean should_trigger", wellFormed);
  const positives = evalSet.filter((i) => i && typeof i === "object" && i.should_trigger === true);
  const negatives = evalSet.filter((i) => i && typeof i === "object" && i.should_trigger === false);
  check("eval set covers both classes (>=5 positive, >=5 negative)", positives.length >= 5 && negatives.length >= 5,
    "positive=" + positives.length + " negative=" + negatives.length);
  const queries = evalSet.filter((i) => i && typeof i === "object").map((i) => i.query);
  check("eval set has no duplicate queries", queries.length === new Set(queries).size);
  if (schema !== null) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    let okSchema = true;
    try { ajv.validateSchema(schema); } catch (e) { okSchema = false; }
    check("schema 'trigger_eval.schema.json' is valid draft-07", okSchema);
    const errs = schemaErrors(schema, evalSet);
    const detail = errs.map((e) => ((e.instancePath || "<root>") + ": " + e.message)).join("; ");
    check("evals/trigger-eval.json validates against its schema", errs.length === 0, detail);
  }
}

function testUpgradeAdvisory() {
  const body = readText(path.join(ROOT, "assets", "init.template.sh"));
  check("init.template.sh defines check_harness_version", body.includes("check_harness_version()"));
  check("init.template.sh calls check_harness_version", /^\s*check_harness_version\s*$/m.test(body));
  const match = body.match(/check_harness_version\(\)\s*\{([\s\S]*?)\n\}/);
  const advisoryBody = match ? match[1] : "";
  check("check_harness_version is advisory (does not set EXIT_CODE)", match !== null && !advisoryBody.includes("EXIT_CODE="));
}

function testBusinessIntakePrompts() {
  const body = readText(path.join(ROOT, "assets", "docs-business.template.md"));
  const prompts = (body.match(/\*\*Interview prompts \(ask the user\):\*\*/g) || []).length;
  check("docs-business.template.md carries Interview prompts", prompts >= 3, "found " + prompts + " prompt blocks");
  check("docs-business.template.md tells the leader to interview, not guess",
    body.includes("interviewing the user") && body.includes("do not guess"));
}

function advisoryChecks(checkFnName, definesSub, inspectsToken) {
  const body = readText(path.join(ROOT, "assets", "init.template.sh"));
  check("init.template.sh defines " + checkFnName, body.includes(checkFnName + "()"));
  check("init.template.sh calls " + checkFnName, new RegExp("^\\s*" + checkFnName + "\\s*$", "m").test(body));
  const match = body.match(new RegExp(checkFnName + "\\(\\)\\s*\\{([\\s\\S]*?)\\n\\}"));
  const advisoryBody = match ? match[1] : "";
  check(checkFnName + " is advisory (does not set EXIT_CODE)", match !== null && !advisoryBody.includes("EXIT_CODE="));
  if (inspectsToken) check(checkFnName + " inspects " + inspectsToken, advisoryBody.includes(inspectsToken));
  return advisoryBody;
}

function testBusinessContextAdvisory() {
  const body = advisoryChecks("check_business_context", null, null);
  check("check_business_context inspects docs/business.md", body.includes("docs/business.md"));
}

function testToolsDiscoveryAdvisory() {
  const body = advisoryChecks("check_tools_discovery", null, null);
  check("check_tools_discovery inspects the discovery block", body.includes("discovery"));
  check("check_tools_discovery inspects agents", body.includes("discovery.agents"));
}

function testEvalsAdvisory() {
  const body = advisoryChecks("check_evals", null, null);
  check("check_evals inspects the trigger-eval set", body.includes("trigger-eval.json"));
}

function testPreflightAdvisory() {
  const body = advisoryChecks("check_preflight", null, null);
  check("check_preflight invokes dist/preflight.js", body.includes("preflight.js"));
}

function testDiscoveryReference() {
  const doc = path.join(ROOT, "references", "discovery.md");
  check("references/discovery.md exists", fs.existsSync(doc) && fs.statSync(doc).isFile());
  if (fs.existsSync(doc)) {
    const body = readText(doc);
    for (const token of ["discovery", "tools_discovery.js", "progressive disclosure", "tool_search", "discovery.agents", "Consultation agents"]) {
      check("discovery.md documents '" + token + "'", body.includes(token));
    }
    check("discovery.md documents the contract-vs-resolution path boundary", body.includes("names travel") || body.includes("Contract vs resolution"));
  }
  const toolsDoc = readText(path.join(ROOT, "references", "tools.md"));
  check("tools.md cross-links agent discovery", toolsDoc.includes("discovery.agents"));
  const refReadme = readText(path.join(ROOT, "references", "README.md"));
  check("references/README.md lists discovery.md", refReadme.includes("discovery.md"));
}

function testEvalsReference() {
  const doc = path.join(ROOT, "references", "evals.md");
  check("references/evals.md exists", fs.existsSync(doc) && fs.statSync(doc).isFile());
  if (fs.existsSync(doc)) {
    const body = readText(doc);
    for (const token of ["trigger-eval.json", "evals.py", "deterministic", "stochastic", "held-out", "variance"]) {
      check("evals.md documents '" + token + "'", body.includes(token));
    }
  }
  const refReadme = readText(path.join(ROOT, "references", "README.md"));
  check("references/README.md lists evals.md", refReadme.includes("evals.md"));
}

function testFeatureRequestToolsLink() {
  const templates = readText(path.join(ROOT, "references", "templates.md"));
  check("templates.md ties Tools>skills to discovery.skills", templates.includes("discovery.skills"));
  check("templates.md links the discovery reference", templates.includes("discovery.md"));
  const examples = readText(path.join(ROOT, "references", "examples.md"));
  check("examples.md points to tools_discovery.js for skill verification", examples.includes("tools_discovery.js"));
  const form = readText(path.join(ROOT, "assets", "feature-request.template.md"));
  check("feature-request template ties Tools>skills to discovery", form.includes("discovery.skills") && form.includes("tools_discovery.js"));
  check("feature-request template ties Tools>agents to discovery.agents", form.includes("discovery.agents"));
  const workflow = readText(path.join(ROOT, "references", "workflow.md"));
  check("workflow Leader Protocol ties delegation to discovery.agents", workflow.includes("discovery.agents"));
}

function testDescriptionGate() {
  const workflow = readText(path.join(ROOT, "references", "workflow.md"));
  check("workflow.md documents the description trigger gate", workflow.includes("node dist/evals.js measure"));
  check("workflow.md links the evals reference", workflow.includes("evals.md"));
  const examples = readText(path.join(ROOT, "references", "examples.md"));
  check("examples.md models evals.py validate/measure",
    examples.includes("node dist/evals.js validate") && examples.includes("node dist/evals.js measure"));
  const form = readText(path.join(ROOT, "assets", "feature-request.template.md"));
  check("feature-request Verification ties to re-measuring the trigger", form.includes("node dist/evals.js measure"));
}

// Feature exact-moment metadata (start_and_close_timestamps): the feature_list
// schema must declare an optional `meta` object with started_at/done_at that
// honors additionalProperties:false, keeping the contract backward-compatible.
function testFeatureMeta() {
  const flSchema = readJSON(path.join(ROOT, "assets", "schemas", "feature_list.schema.json"));
  const featureDef = (flSchema.definitions || {}).feature || {};
  const props = featureDef.properties || {};
  check("feature schema declares an optional meta field", Object.keys(props).includes("meta"));
  check("feature meta stays out of required", !((featureDef.required || []).includes("meta")));
  const metaDef = (flSchema.definitions || {}).meta || {};
  check("feature meta honors additionalProperties:false", metaDef.additionalProperties === false);
  const metaProps = metaDef.properties || {};
  check("feature meta declares started_at", Object.keys(metaProps).includes("started_at"));
  check("feature meta declares done_at", Object.keys(metaProps).includes("done_at"));
  // a feature with a valid meta still validates against the whole schema
  const ok = schemaErrors(flSchema, {
    project: "p",
    features: [{ id: 1, name: "f", status: "in_progress", meta: { started_at: "2026-07-17T12:00:00.000Z" } }],
  });
  check("feature_list accepts a feature carrying a valid meta", ok.length === 0, JSON.stringify(ok));
  // an invented meta key is rejected by the contract
  const bad = schemaErrors(flSchema, {
    project: "p",
    features: [{ id: 1, name: "f", status: "done", meta: { bogus: 1 } }],
  });
  check("feature meta rejects unknown keys", bad.length > 0);
}

// The derived sprint document's frontmatter state surface has a draft-07
// schema; closed_at is the exact ISO close moment the observer reads.
function testSprintSchema() {
  const schemasDir = path.join(ROOT, "assets", "schemas");
  const p = path.join(schemasDir, "sprint.schema.json");
  check("sprint.schema.json exists", fs.existsSync(p) && fs.statSync(p).isFile());
  const schema = readJSON(p);
  check("sprint.schema.json declares draft-07", String(schema.$schema || "").includes("draft-07"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  check("sprint.schema.json is valid draft-07", ajv.validateSchema(schema));
  check("sprint schema declares closed_at", Object.keys(schema.properties || {}).includes("closed_at"));
  const ok = schemaErrors(schema, {
    sprint: "2026-SP3",
    status: "closed",
    updated: "2026-07-17",
    closed_at: "2026-07-17T18:00:00.000Z",
    tags: ["handyman/sprint"],
  });
  check("sprint schema accepts a valid closed frontmatter with closed_at", ok.length === 0, JSON.stringify(ok));
  const bad = schemaErrors(schema, { sprint: "2026-SP1", status: "closed", bogus: 1 });
  check("sprint schema rejects unknown frontmatter keys", bad.length > 0);
}

function main() {
  console.log("Doc-structure suite (test_docs.js)");
  testJsonTemplates();
  testJsonSchemas();
  testFeatureMeta();
  testSprintSchema();
  testHarnessVersion();
  testDiscoveryConfig();
  testSprintConfig();
  testDependsOnContract();
  testUnattendedLoopReference();
  testTwoStageReview();
  testEvalSet();
  testUpgradeAdvisory();
  testMarkdownLinks();
  testObsidianContract();
  testBusinessIntakePrompts();
  testBusinessContextAdvisory();
  testToolsDiscoveryAdvisory();
  testEvalsAdvisory();
  testPreflightAdvisory();
  testDiscoveryReference();
  testEvalsReference();
  testFeatureRequestToolsLink();
  testDescriptionGate();
  testTokenBudgets();
  testSecurityContract();
  testW011PassiveFraming();
  console.log("\n  " + _run + " run, " + (_run - _failures) + " passed, " + _failures + " failed");
  process.exit(_failures ? 1 : 0);
}

main();
