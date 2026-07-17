#!/usr/bin/env python3
"""Documentation-structure tests for the Handyman skill.

Validates contracts that the skill's markdown promises:
  T1  Every assets/*.template.json file is valid JSON.
  T2  Every relative markdown link across the repo resolves to a file.
  T3  Obsidian frontmatter keys + tag namespace appear in the assets templates.
  T4  Token budgets: SKILL.md word count, frontmatter description length,
      and AGENTS.template.md word count stay within their caps.
  T5  Security contract: references/security.md exists, is referenced, and the
      data-not-instructions boundary survives in AGENTS + role templates.
  T6  W011 passive framing: the scanned skill body (SKILL.md, references/*.md,
      assets/*.md) never frames an agent as the subject that reads/ingests
      outsider-authored content, while the mitigation guidance survives.

Exit code 0 when all pass, 1 otherwise.
"""
from __future__ import annotations

import json
import os
import re
import sys

try:
    from jsonschema import Draft7Validator
    _HAVE_JSONSCHEMA = True
except ImportError:
    _HAVE_JSONSCHEMA = False

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The skill content (SKILL.md, assets/, references/) lives under handyman/;
# repo-level docs (README.md, docs/) stay at REPO_ROOT.
ROOT = os.path.join(REPO_ROOT, "handyman")

PASS = "\033[32mPASS\033[0m" if sys.stdout.isatty() else "PASS"
FAIL = "\033[31mFAIL\033[0m" if sys.stdout.isatty() else "FAIL"

_failures = 0
_run = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global _failures, _run
    _run += 1
    if ok:
        print(f"  {PASS} {name}")
    else:
        _failures += 1
        print(f"  {FAIL} {name}")
        if detail:
            print(f"       {detail}")


def fenced_blocks(text: str, lang: str):
    """Yield the body of ```lang fenced code blocks."""
    pattern = re.compile(r"```" + re.escape(lang) + r"\n(.*?)```", re.DOTALL)
    return [m.group(1) for m in pattern.finditer(text)]


def _skill_version() -> str:
    """Extract metadata.version from SKILL.md frontmatter (the stamp source)."""
    with open(os.path.join(ROOT, "SKILL.md"), encoding="utf-8") as fh:
        text = fh.read()
    match = re.search(r"^\s+version:\s*(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def test_json_templates() -> None:
    assets_dir = os.path.join(ROOT, "assets")
    json_files = sorted(
        name for name in os.listdir(assets_dir)
        if name.endswith(".template.json")
    )
    check("assets/ contains JSON templates", len(json_files) > 0,
          "no *.template.json files found")
    for name in json_files:
        with open(os.path.join(assets_dir, name), encoding="utf-8") as fh:
            block = fh.read()
        try:
            json.loads(block)
            check(f"JSON template '{name}' parses", True)
        except json.JSONDecodeError as exc:
            check(f"JSON template '{name}' parses", False, str(exc))


_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`[^`]*`")


def strip_code(text: str) -> str:
    """Remove fenced and inline code; their links are illustrative templates."""
    text = _FENCE_RE.sub("", text)
    return _INLINE_CODE_RE.sub("", text)


def test_markdown_links() -> None:
    md_files = []
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        parts = dirpath.split(os.sep)
        # Skip VCS internals and the assets/ template bodies, whose relative
        # links are illustrative and only resolve inside a target repo. Also skip
        # generated/vendored trees (node_modules, dist, coverage) introduced by the
        # TS toolchain: their third-party READMEs are not our docs to validate.
        if (".git" in parts or "assets" in parts
                or "node_modules" in parts or "dist" in parts
                or "coverage" in parts):
            continue
        for name in filenames:
            if name.endswith(".md"):
                md_files.append(os.path.join(dirpath, name))
    check("repo has markdown files", len(md_files) > 0)
    broken = []
    for md in md_files:
        with open(md, encoding="utf-8") as fh:
            content = fh.read()
        content = strip_code(content)
        for target in _LINK_RE.findall(content):
            target = target.strip()
            # Skip external URLs, anchors, mailto.
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            # Drop any in-page anchor suffix.
            target = target.split("#", 1)[0]
            if not target:
                continue
            resolved = os.path.normpath(os.path.join(os.path.dirname(md), target))
            if not os.path.exists(resolved):
                rel_md = os.path.relpath(md, REPO_ROOT)
                broken.append(f"{rel_md} -> {target}")
    check("all relative markdown links resolve", not broken,
          "; ".join(broken))


def test_obsidian_contract() -> None:
    assets_dir = os.path.join(ROOT, "assets")
    text = ""
    for name in sorted(os.listdir(assets_dir)):
        if name.endswith((".template.md", ".template")):
            with open(os.path.join(assets_dir, name), encoding="utf-8") as fh:
                text += fh.read() + "\n"
    required_frontmatter = ["feature:", "status:", "role:", "updated:", "tags:"]
    for key in required_frontmatter:
        check(f"assets templates document frontmatter key '{key}'",
              key in text)
    for tag in ["handyman/session/current", "handyman/history",
                "handyman/moc"]:
        check(f"assets templates document tag '{tag}'", tag in text)


def test_token_budgets() -> None:
    """Guard against token-budget regressions on always-loaded surfaces."""
    budgets = [
        ("SKILL.md", "words", 1000),
        (os.path.join("assets", "AGENTS.template.md"), "words", 250),
    ]
    for rel_path, unit, cap in budgets:
        with open(os.path.join(ROOT, rel_path), encoding="utf-8") as fh:
            count = len(fh.read().split())
        check(f"{rel_path} stays within {cap} {unit} ({count})",
              count <= cap, f"{count} {unit} > {cap}")
    with open(os.path.join(ROOT, "SKILL.md"), encoding="utf-8") as fh:
        skill = fh.read()
    match = re.search(r"^description:\s*'(.*)'\s*$", skill, re.MULTILINE)
    check("SKILL.md frontmatter has a single-line description",
          match is not None)
    if match:
        length = len(match.group(1))
        check(f"description stays within 500 chars ({length})",
              length <= 500, f"{length} chars > 500")


def test_security_contract() -> None:
    """Guard the indirect-prompt-injection mitigation against regressions."""
    security = os.path.join(ROOT, "references", "security.md")
    check("references/security.md exists", os.path.isfile(security))

    with open(os.path.join(ROOT, "SKILL.md"), encoding="utf-8") as fh:
        skill = fh.read()
    check("SKILL.md links to references/security.md",
          "references/security.md" in skill)
    with open(os.path.join(ROOT, "references", "README.md"),
              encoding="utf-8") as fh:
        ref_readme = fh.read()
    check("references/README.md lists security.md", "security.md" in ref_readme)

    # The data-not-instructions boundary must survive in every surface that an
    # agent loads at runtime, not only in the dedicated reference file.
    with open(os.path.join(ROOT, "assets", "AGENTS.template.md"),
              encoding="utf-8") as fh:
        agents = fh.read()
    check("AGENTS.template.md states the data-not-instructions rule",
          "not instructions" in agents)
    for role in ("leader", "implementer", "reviewer", "explorer"):
        path = os.path.join(ROOT, "assets", f"role-{role}.template.md")
        with open(path, encoding="utf-8") as fh:
            body = fh.read()
        check(f"role-{role} template carries the untrusted-content boundary",
              "not instructions" in body)


# W011 (snyk-agent-scan, indirect prompt injection): the scanned skill body must
# never frame an agent or role as the grammatical subject that reads, ingests, or
# fetches outsider-authored content. The behavioral mitigation stays (golden rule
# "data, never instructions"); only the agent-as-ingestor *descriptions* are
# rephrased as passive, resource-as-subject prose. See docs/analisis-snyk-w011.md.
_W011_REMOVED = (
    "constantly read free text",
    "continuously ingest text they did not author",
    "ingests outsider-authored content",
    "ingests arbitrary code",
    "reads that report as trusted input",
)
_W011_SUBJECT_VERB = re.compile(
    r"\b(agents?|explorers?|leaders?|reviewers?|implementers?)\b"
    r"[^.\n]{0,40}?\b(ingests?|reads?|fetch(?:es)?)\b"
    r"[^.\n]{0,30}?\b(free text|outsider|arbitrary code|untrusted|did not author)\b",
    re.IGNORECASE,
)


def _scanned_skill_body() -> dict:
    """Return {relpath: text} for the markdown files snyk-agent-scan inspects."""
    bodies = {}
    with open(os.path.join(ROOT, "SKILL.md"), encoding="utf-8") as fh:
        bodies["SKILL.md"] = fh.read()
    for sub in ("references", "assets"):
        sub_dir = os.path.join(ROOT, sub)
        for name in sorted(os.listdir(sub_dir)):
            if name.endswith(".md"):
                with open(os.path.join(sub_dir, name), encoding="utf-8") as fh:
                    bodies[f"{sub}/{name}"] = fh.read()
    return bodies


def test_w011_passive_framing() -> None:
    """Guard the W011 fix: no agent-as-ingestor framing in the scanned body."""
    bodies = _scanned_skill_body()
    joined = "\n".join(bodies.values())

    # 1. The specific agent-as-ingestor phrasings that tripped W011 stay gone.
    for phrase in _W011_REMOVED:
        check(f"W011 trigger phrase absent: '{phrase}'",
              phrase not in joined,
              "rephrase as passive, resource-as-subject prose")

    # 2. No role-subject + ingestion-verb + untrusted-object construction remains.
    for path, text in bodies.items():
        match = _W011_SUBJECT_VERB.search(text)
        check(f"{path} has no agent-as-ingestor construction",
              match is None, match.group(0) if match else "")

    # 3. Restructuring must not delete the mitigation it depends on.
    sec = bodies["references/security.md"]
    check("security.md keeps the data-not-instructions golden rule",
          "never as instructions" in sec)
    check("security.md keeps the per-role operating rules",
          "Operating Rules Per Role" in sec)
    anat = bodies["references/anatomy.md"]
    check("anatomy.md keeps the data-not-instructions boundary",
          "never instructions to the agent" in anat)


# Each schema file maps to the templates that must validate against it.
_SCHEMA_TARGETS = {
    "feature_list.schema.json": ["feature_list.template.json"],
    "harness.config.schema.json": [
        "harness.config.local.template.json",
        "harness.config.global.template.json",
    ],
}


def test_json_schemas() -> None:
    """Schemas exist, are valid draft-07, and the templates conform to them."""
    schemas_dir = os.path.join(ROOT, "assets", "schemas")
    assets_dir = os.path.join(ROOT, "assets")
    loaded = {}
    for schema_name in sorted(_SCHEMA_TARGETS):
        path = os.path.join(schemas_dir, schema_name)
        exists = os.path.isfile(path)
        check(f"schema '{schema_name}' exists", exists)
        if not exists:
            continue
        with open(path, encoding="utf-8") as fh:
            try:
                schema = json.load(fh)
            except json.JSONDecodeError as exc:
                check(f"schema '{schema_name}' parses", False, str(exc))
                continue
        check(f"schema '{schema_name}' parses", True)
        check(f"schema '{schema_name}' declares draft-07",
              "draft-07" in str(schema.get("$schema", "")))
        loaded[schema_name] = schema

    if not _HAVE_JSONSCHEMA:
        print("       NOTE: jsonschema not installed - template conformance "
              "checked in CI. Run `pip install jsonschema` for full local "
              "validation.")
        return

    for schema_name, schema in loaded.items():
        try:
            Draft7Validator.check_schema(schema)
            check(f"schema '{schema_name}' is valid draft-07", True)
        except Exception as exc:  # noqa: BLE001 - report any schema defect
            check(f"schema '{schema_name}' is valid draft-07", False, str(exc))
            continue
        validator = Draft7Validator(schema)
        for template_name in _SCHEMA_TARGETS[schema_name]:
            with open(os.path.join(assets_dir, template_name),
                      encoding="utf-8") as fh:
                instance = json.load(fh)
            errors = sorted(validator.iter_errors(instance), key=lambda e: e.path)
            detail = "; ".join(
                f"{'/'.join(map(str, e.path)) or '<root>'}: {e.message}"
                for e in errors
            )
            check(f"template '{template_name}' validates against "
                  f"'{schema_name}'", not errors, detail)


def test_harness_version() -> None:
    """Phase-0 contract: the harness can carry a stamped skill version."""
    schemas_dir = os.path.join(ROOT, "assets", "schemas")
    assets_dir = os.path.join(ROOT, "assets")
    semver = re.compile(r"^\d+\.\d+\.\d+$")

    with open(os.path.join(schemas_dir, "harness.config.schema.json"),
              encoding="utf-8") as fh:
        cfg_schema = json.load(fh)
    check("harness.config schema declares harness_version",
          "harness_version" in cfg_schema.get("properties", {}))
    check("harness_version stays optional in harness.config schema",
          "harness_version" not in cfg_schema.get("required", []))

    with open(os.path.join(schemas_dir, "feature_list.schema.json"),
              encoding="utf-8") as fh:
        fl_schema = json.load(fh)
    config_props = (fl_schema.get("definitions", {})
                    .get("config", {}).get("properties", {}))
    check("feature_list config schema declares harness_version",
          "harness_version" in config_props)

    for name in ("harness.config.local.template.json",
                 "harness.config.global.template.json"):
        with open(os.path.join(assets_dir, name), encoding="utf-8") as fh:
            data = json.load(fh)
        check(f"template '{name}' carries harness_version",
              "harness_version" in data)
    with open(os.path.join(assets_dir, "feature_list.template.json"),
              encoding="utf-8") as fh:
        fl_template = json.load(fh)
    check("feature_list template config carries harness_version",
          "harness_version" in fl_template.get("config", {}))

    version = _skill_version()
    check("SKILL.md metadata.version parses as semver",
          bool(semver.match(version)), version)


def test_discovery_config() -> None:
    """Plan A: optional discovery block (skills/mcp) in both config schemas."""
    schemas_dir = os.path.join(ROOT, "assets", "schemas")
    assets_dir = os.path.join(ROOT, "assets")

    with open(os.path.join(schemas_dir, "harness.config.schema.json"),
              encoding="utf-8") as fh:
        cfg_schema = json.load(fh)
    check("harness.config schema declares discovery",
          "discovery" in cfg_schema.get("properties", {}))
    check("discovery stays optional in harness.config schema",
          "discovery" not in cfg_schema.get("required", []))
    disc_def = cfg_schema.get("definitions", {}).get("discovery", {})
    check("discovery definition lists skills and mcp",
          "skills" in disc_def.get("properties", {})
          and "mcp" in disc_def.get("properties", {}))
    check("discovery definition lists agents",
          "agents" in disc_def.get("properties", {}))
    check("discovery rejects unknown keys (additionalProperties:false)",
          disc_def.get("additionalProperties") is False)

    with open(os.path.join(schemas_dir, "feature_list.schema.json"),
              encoding="utf-8") as fh:
        fl_schema = json.load(fh)
    config_props = (fl_schema.get("definitions", {})
                    .get("config", {}).get("properties", {}))
    check("feature_list config schema declares discovery",
          "discovery" in config_props)
    fl_disc_def = fl_schema.get("definitions", {}).get("discovery", {})
    check("feature_list discovery definition lists agents",
          "agents" in fl_disc_def.get("properties", {}))

    for name in ("harness.config.local.template.json",
                 "harness.config.global.template.json"):
        with open(os.path.join(assets_dir, name), encoding="utf-8") as fh:
            data = json.load(fh)
        disc = data.get("discovery")
        check(f"template '{name}' carries a discovery block",
              isinstance(disc, dict)
              and isinstance(disc.get("skills"), list)
              and isinstance(disc.get("mcp"), list)
              and isinstance(disc.get("agents"), list))
    with open(os.path.join(assets_dir, "feature_list.template.json"),
              encoding="utf-8") as fh:
        fl_template = json.load(fh)
    check("feature_list template config carries discovery",
          "discovery" in fl_template.get("config", {}))
    check("feature_list template discovery carries agents",
          isinstance(fl_template.get("config", {})
                     .get("discovery", {}).get("agents"), list))

    if not _HAVE_JSONSCHEMA:
        print("       NOTE: jsonschema not installed - discovery rejection "
              "checked in CI.")
        return
    with open(os.path.join(assets_dir, "harness.config.local.template.json"),
              encoding="utf-8") as fh:
        bad = json.load(fh)
    bad["discovery"]["unexpected"] = ["x"]
    check("an unknown key inside discovery is rejected",
          any(Draft7Validator(cfg_schema).iter_errors(bad)))


def test_sprint_config() -> None:
    """Plan A (sprints): optional sprint label on features, current_sprint in config.

    The sprint is a declared partition label (not a date): the feature contract
    stays a four-state machine and gains one optional key. Legacy files without
    labels keep validating.
    """
    schemas_dir = os.path.join(ROOT, "assets", "schemas")
    assets_dir = os.path.join(ROOT, "assets")

    with open(os.path.join(schemas_dir, "feature_list.schema.json"),
              encoding="utf-8") as fh:
        fl_schema = json.load(fh)
    feature_def = (fl_schema.get("definitions", {})
                   .get("feature", {}))
    check("feature definition declares sprint",
          "sprint" in feature_def.get("properties", {}))
    check("sprint stays optional in the feature contract",
          "sprint" not in feature_def.get("required", []))
    check("feature definition still rejects unknown keys",
          feature_def.get("additionalProperties") is False)
    sprint_prop = feature_def.get("properties", {}).get("sprint", {})
    check("sprint carries a partition-label pattern",
          "SP" in str(sprint_prop.get("pattern", "")))
    config_props = (fl_schema.get("definitions", {})
                    .get("config", {}).get("properties", {}))
    check("feature_list config schema declares current_sprint",
          "current_sprint" in config_props)

    with open(os.path.join(schemas_dir, "harness.config.schema.json"),
              encoding="utf-8") as fh:
        cfg_schema = json.load(fh)
    check("harness.config schema declares current_sprint",
          "current_sprint" in cfg_schema.get("properties", {}))
    check("current_sprint stays optional in harness.config schema",
          "current_sprint" not in cfg_schema.get("required", []))

    for name in ("harness.config.local.template.json",
                 "harness.config.global.template.json"):
        with open(os.path.join(assets_dir, name), encoding="utf-8") as fh:
            data = json.load(fh)
        check(f"template '{name}' carries the current_sprint sentinel",
              "current_sprint" in data and data["current_sprint"] is None)
    with open(os.path.join(assets_dir, "feature_list.template.json"),
              encoding="utf-8") as fh:
        fl_template = json.load(fh)
    check("feature_list template config carries the current_sprint sentinel",
          "current_sprint" in fl_template.get("config", {})
          and fl_template["config"]["current_sprint"] is None)

    if not _HAVE_JSONSCHEMA:
        print("       NOTE: jsonschema not installed - sprint pattern "
              "rejection checked in CI.")
        return
    validator = Draft7Validator(fl_schema)
    good = json.loads(json.dumps(fl_template))
    good["config"]["current_sprint"] = "2026-SP1"
    good["features"][0]["sprint"] = "2026-SP1"
    check("a labeled feature and open sprint validate",
          not any(validator.iter_errors(good)))
    bad = json.loads(json.dumps(fl_template))
    bad["features"][0]["sprint"] = "sprint-one"
    check("a malformed sprint label is rejected",
          any(validator.iter_errors(bad)))


def test_depends_on_contract() -> None:
    """Plan A (harness ecosystem): optional depends_on on features + ready.

    Dependencies are declared in the contract; readiness is derived by
    `feature.py ready`. The feature stays a four-state machine and gains one
    optional key; legacy files without it keep validating.
    """
    schemas_dir = os.path.join(ROOT, "assets", "schemas")
    with open(os.path.join(schemas_dir, "feature_list.schema.json"),
              encoding="utf-8") as fh:
        fl_schema = json.load(fh)
    feature_def = fl_schema.get("definitions", {}).get("feature", {})
    dep = feature_def.get("properties", {}).get("depends_on", {})
    check("feature definition declares depends_on", bool(dep))
    check("depends_on stays optional in the feature contract",
          "depends_on" not in feature_def.get("required", []))
    check("depends_on is an array of integer ids",
          dep.get("type") == "array"
          and dep.get("items", {}).get("type") == "integer")
    check("depends_on ids are unique", dep.get("uniqueItems") is True)
    check("feature definition still rejects unknown keys",
          feature_def.get("additionalProperties") is False)

    with open(os.path.join(ROOT, "references", "anatomy.md"),
              encoding="utf-8") as fh:
        anatomy = fh.read()
    check("anatomy.md documents depends_on", "depends_on" in anatomy)
    check("anatomy.md points readiness at the Node feature CLI",
          "node dist/feature.js ready" in anatomy)

    if not _HAVE_JSONSCHEMA:
        print("       NOTE: jsonschema not installed - depends_on shape "
              "rejection checked in CI.")
        return
    validator = Draft7Validator(fl_schema)
    doc = {"project": "t", "features": [
        {"id": 1, "name": "a", "status": "done"},
        {"id": 2, "name": "b", "status": "pending", "depends_on": [1]},
    ]}
    check("a feature with integer depends_on validates",
          not any(validator.iter_errors(doc)))
    bad = {"project": "t", "features": [
        {"id": 2, "name": "b", "status": "pending", "depends_on": ["a"]},
    ]}
    check("a non-integer depends_on entry is rejected",
          any(validator.iter_errors(bad)))


def test_unattended_loop_reference() -> None:
    """Plan B (harness ecosystem): the unattended-loop contract is documented.

    Handyman ships no runner; workflow.md carries the loop contract (ready as
    work detector, exit 3 as stop signal) and preflight surfaces the stop
    condition through its worklist block.
    """
    with open(os.path.join(ROOT, "references", "workflow.md"),
              encoding="utf-8") as fh:
        workflow = fh.read()
    check("workflow.md has the Unattended Loop section",
          "## Unattended Loop" in workflow)
    for token in ("node dist/feature.js ready", "exit 3", "stop", "One feature per iteration"):
        check(f"Unattended Loop documents '{token}'", token in workflow)
    check("stability check lists the worklist control",
          "**Worklist**" in workflow)

    with open(os.path.join(ROOT, "src", "preflight.ts"),
              encoding="utf-8") as fh:
        preflight = fh.read()
    check("preflight runs the worklist block", '"worklist"' in preflight)
    check("preflight prints the loop stop condition",
          "loop stop condition" in preflight)


def test_two_stage_review() -> None:
    """Plan C (harness ecosystem): the review happens in two ordered stages.

    Stage 1 checks spec compliance, Stage 2 code quality, and a Stage 1
    failure ends the review. Template + protocol only; backlog.py unchanged.
    """
    with open(os.path.join(ROOT, "assets", "backlog-review.template.md"),
              encoding="utf-8") as fh:
        template = fh.read()
    check("review template has Stage 1: Spec Compliance",
          "## Stage 1: Spec Compliance" in template)
    check("review template has Stage 2: Code Quality",
          "## Stage 2: Code Quality" in template)
    check("Stage 1 cut rule is stated in the template",
          "without moving to Stage 2" in template)
    check("Stage 1 checks the acceptance criteria",
          "acceptance criterion" in template)
    check("Stage 2 keeps the verifier gate", "Verifier exits 0" in template)

    with open(os.path.join(ROOT, "references", "workflow.md"),
              encoding="utf-8") as fh:
        workflow = fh.read()
    check("Reviewer Protocol prescribes the two ordered stages",
          "Stage 1 — spec compliance" in workflow
          and "Stage 2 — code quality" in workflow)
    check("Reviewer Protocol states the Stage 1 cut",
          "without continuing to Stage 2" in workflow)


def test_eval_set() -> None:
    """Plan A: the trigger-eval set has a schema and a deterministic structural contract.

    "Testing the model evaluation" splits in two: the *contract* of the eval set
    is deterministic (parses, right keys/types, both classes present, no duplicate
    queries) and lives here in the verifier; the *measurement* of the real trigger
    is stochastic and lives opt-in in scripts/evals.py. This guards the contract.
    """
    schema_path = os.path.join(ROOT, "assets", "schemas", "trigger_eval.schema.json")
    check("schema 'trigger_eval.schema.json' exists", os.path.isfile(schema_path))
    schema = None
    if os.path.isfile(schema_path):
        with open(schema_path, encoding="utf-8") as fh:
            try:
                schema = json.load(fh)
                check("schema 'trigger_eval.schema.json' parses", True)
            except json.JSONDecodeError as exc:
                check("schema 'trigger_eval.schema.json' parses", False, str(exc))
        if schema is not None:
            check("schema 'trigger_eval.schema.json' declares draft-07",
                  "draft-07" in str(schema.get("$schema", "")))

    eval_path = os.path.join(ROOT, "evals", "trigger-eval.json")
    check("evals/trigger-eval.json exists", os.path.isfile(eval_path))
    if not os.path.isfile(eval_path):
        return
    with open(eval_path, encoding="utf-8") as fh:
        try:
            eval_set = json.load(fh)
        except json.JSONDecodeError as exc:
            check("evals/trigger-eval.json parses", False, str(exc))
            return
    check("evals/trigger-eval.json parses", True)
    check("eval set is a non-empty array",
          isinstance(eval_set, list) and len(eval_set) > 0)
    if not isinstance(eval_set, list):
        return

    well_formed = all(
        isinstance(item, dict)
        and isinstance(item.get("query"), str) and item["query"].strip()
        and isinstance(item.get("should_trigger"), bool)
        for item in eval_set
    )
    check("every eval item has a non-empty query and a boolean should_trigger",
          well_formed)

    positives = [i for i in eval_set
                 if isinstance(i, dict) and i.get("should_trigger") is True]
    negatives = [i for i in eval_set
                 if isinstance(i, dict) and i.get("should_trigger") is False]
    check("eval set covers both classes (>=5 positive, >=5 negative)",
          len(positives) >= 5 and len(negatives) >= 5,
          f"positive={len(positives)} negative={len(negatives)}")

    queries = [i.get("query") for i in eval_set if isinstance(i, dict)]
    check("eval set has no duplicate queries",
          len(queries) == len(set(queries)))

    if not _HAVE_JSONSCHEMA:
        print("       NOTE: jsonschema not installed - eval-set schema "
              "conformance checked in CI.")
        return
    if schema is not None:
        Draft7Validator.check_schema(schema)
        check("schema 'trigger_eval.schema.json' is valid draft-07", True)
        errors = sorted(Draft7Validator(schema).iter_errors(eval_set),
                        key=lambda e: list(e.path))
        detail = "; ".join(
            f"{'/'.join(map(str, e.path)) or '<root>'}: {e.message}"
            for e in errors
        )
        check("evals/trigger-eval.json validates against its schema",
              not errors, detail)


def test_upgrade_advisory() -> None:
    """Phase-1 contract: init.template.sh carries a non-blocking version advisory."""
    with open(os.path.join(ROOT, "assets", "init.template.sh"),
              encoding="utf-8") as fh:
        body = fh.read()
    check("init.template.sh defines check_harness_version",
          "check_harness_version()" in body)
    check("init.template.sh calls check_harness_version",
          re.search(r"^\s*check_harness_version\s*$", body, re.MULTILINE) is not None)
    match = re.search(r"check_harness_version\(\)\s*\{(.*?)\n\}", body, re.DOTALL)
    advisory_body = match.group(1) if match else ""
    check("check_harness_version is advisory (does not set EXIT_CODE)",
          bool(match) and "EXIT_CODE=" not in advisory_body)


def test_business_intake_prompts() -> None:
    """Mitigación A: the business doc template is an active interview script."""
    with open(os.path.join(ROOT, "assets", "docs-business.template.md"),
              encoding="utf-8") as fh:
        body = fh.read()
    prompts = body.count("**Interview prompts (ask the user):**")
    check("docs-business.template.md carries Interview prompts",
          prompts >= 3, f"found {prompts} prompt blocks")
    check("docs-business.template.md tells the leader to interview, not guess",
          "interviewing the user" in body and "do not guess" in body)


def test_business_context_advisory() -> None:
    """Mitigación D: init.template.sh carries a non-blocking business-context advisory."""
    with open(os.path.join(ROOT, "assets", "init.template.sh"),
              encoding="utf-8") as fh:
        body = fh.read()
    check("init.template.sh defines check_business_context",
          "check_business_context()" in body)
    check("init.template.sh calls check_business_context",
          re.search(r"^\s*check_business_context\s*$", body, re.MULTILINE) is not None)
    match = re.search(r"check_business_context\(\)\s*\{(.*?)\n\}", body, re.DOTALL)
    advisory_body = match.group(1) if match else ""
    check("check_business_context is advisory (does not set EXIT_CODE)",
          bool(match) and "EXIT_CODE=" not in advisory_body)
    check("check_business_context inspects docs/business.md",
          "docs/business.md" in advisory_body)


def test_tools_discovery_advisory() -> None:
    """Plan C: init.template.sh carries a non-blocking skill/MCP discovery advisory."""
    with open(os.path.join(ROOT, "assets", "init.template.sh"),
              encoding="utf-8") as fh:
        body = fh.read()
    check("init.template.sh defines check_tools_discovery",
          "check_tools_discovery()" in body)
    check("init.template.sh calls check_tools_discovery",
          re.search(r"^\s*check_tools_discovery\s*$", body, re.MULTILINE) is not None)
    match = re.search(r"check_tools_discovery\(\)\s*\{(.*?)\n\}", body, re.DOTALL)
    advisory_body = match.group(1) if match else ""
    check("check_tools_discovery is advisory (does not set EXIT_CODE)",
          bool(match) and "EXIT_CODE=" not in advisory_body)
    check("check_tools_discovery inspects the discovery block",
          "discovery" in advisory_body)
    check("check_tools_discovery inspects agents",
          "discovery.agents" in advisory_body)


def test_evals_advisory() -> None:
    """Plan C: init.template.sh carries a non-blocking trigger-eval advisory."""
    with open(os.path.join(ROOT, "assets", "init.template.sh"),
              encoding="utf-8") as fh:
        body = fh.read()
    check("init.template.sh defines check_evals",
          "check_evals()" in body)
    check("init.template.sh calls check_evals",
          re.search(r"^\s*check_evals\s*$", body, re.MULTILINE) is not None)
    match = re.search(r"check_evals\(\)\s*\{(.*?)\n\}", body, re.DOTALL)
    advisory_body = match.group(1) if match else ""
    check("check_evals is advisory (does not set EXIT_CODE)",
          bool(match) and "EXIT_CODE=" not in advisory_body)
    check("check_evals inspects the trigger-eval set",
          "trigger-eval.json" in advisory_body)


def test_preflight_advisory() -> None:
    """Plan B: init.template.sh carries a non-blocking preflight stability advisory."""
    with open(os.path.join(ROOT, "assets", "init.template.sh"),
              encoding="utf-8") as fh:
        body = fh.read()
    check("init.template.sh defines check_preflight",
          "check_preflight()" in body)
    check("init.template.sh calls check_preflight",
          re.search(r"^\s*check_preflight\s*$", body, re.MULTILINE) is not None)
    match = re.search(r"check_preflight\(\)\s*\{(.*?)\n\}", body, re.DOTALL)
    advisory_body = match.group(1) if match else ""
    check("check_preflight is advisory (does not set EXIT_CODE)",
          bool(match) and "EXIT_CODE=" not in advisory_body)
    check("check_preflight invokes dist/preflight.js",
          "preflight.js" in advisory_body)


def test_discovery_reference() -> None:
    """Plan D: references/discovery.md exists and is listed in the catalog."""
    doc = os.path.join(ROOT, "references", "discovery.md")
    check("references/discovery.md exists", os.path.isfile(doc))
    if os.path.isfile(doc):
        with open(doc, encoding="utf-8") as fh:
            body = fh.read()
        for token in ("discovery", "tools_discovery.py", "progressive disclosure",
                      "tool_search", "discovery.agents", "Consultation agents"):
            check(f"discovery.md documents '{token}'", token in body)
        check("discovery.md documents the contract-vs-resolution path boundary",
              "names travel" in body or "Contract vs resolution" in body)
    with open(os.path.join(ROOT, "references", "tools.md"), encoding="utf-8") as fh:
        tools_doc = fh.read()
    check("tools.md cross-links agent discovery", "discovery.agents" in tools_doc)
    with open(os.path.join(ROOT, "references", "README.md"),
              encoding="utf-8") as fh:
        ref_readme = fh.read()
    check("references/README.md lists discovery.md", "discovery.md" in ref_readme)


def test_evals_reference() -> None:
    """Plan D: references/evals.md exists and is listed in the catalog."""
    doc = os.path.join(ROOT, "references", "evals.md")
    check("references/evals.md exists", os.path.isfile(doc))
    if os.path.isfile(doc):
        with open(doc, encoding="utf-8") as fh:
            body = fh.read()
        for token in ("trigger-eval.json", "evals.py", "deterministic",
                      "stochastic", "held-out", "variance"):
            check(f"evals.md documents '{token}'", token in body)
    with open(os.path.join(ROOT, "references", "README.md"),
              encoding="utf-8") as fh:
        ref_readme = fh.read()
    check("references/README.md lists evals.md", "evals.md" in ref_readme)


def test_feature_request_tools_link() -> None:
    """Plan E: the feature-request Tools>skills ties to the declared discovery set."""
    with open(os.path.join(ROOT, "references", "templates.md"),
              encoding="utf-8") as fh:
        templates = fh.read()
    check("templates.md ties Tools>skills to discovery.skills",
          "discovery.skills" in templates)
    check("templates.md links the discovery reference",
          "discovery.md" in templates)
    with open(os.path.join(ROOT, "references", "examples.md"),
              encoding="utf-8") as fh:
        examples = fh.read()
    check("examples.md points to tools_discovery.py for skill verification",
          "tools_discovery.py" in examples)
    with open(os.path.join(ROOT, "assets", "feature-request.template.md"),
              encoding="utf-8") as fh:
        form = fh.read()
    check("feature-request template ties Tools>skills to discovery",
          "discovery.skills" in form and "tools_discovery.py" in form)
    check("feature-request template ties Tools>agents to discovery.agents",
          "discovery.agents" in form)
    with open(os.path.join(ROOT, "references", "workflow.md"),
              encoding="utf-8") as fh:
        workflow = fh.read()
    check("workflow Leader Protocol ties delegation to discovery.agents",
          "discovery.agents" in workflow)


def test_description_gate() -> None:
    """Plan E: re-measuring the description trigger is wired into the workflow."""
    with open(os.path.join(ROOT, "references", "workflow.md"),
              encoding="utf-8") as fh:
        workflow = fh.read()
    check("workflow.md documents the description trigger gate",
          "node dist/evals.js measure" in workflow)
    check("workflow.md links the evals reference",
          "evals.md" in workflow)
    with open(os.path.join(ROOT, "references", "examples.md"),
              encoding="utf-8") as fh:
        examples = fh.read()
    check("examples.md models evals.py validate/measure",
          "node dist/evals.js validate" in examples
          and "node dist/evals.js measure" in examples)
    with open(os.path.join(ROOT, "assets", "feature-request.template.md"),
              encoding="utf-8") as fh:
        form = fh.read()
    check("feature-request Verification ties to re-measuring the trigger",
          "node dist/evals.js measure" in form)


def main() -> int:
    print("Doc-structure suite (test_docs.py)")
    test_json_templates()
    test_json_schemas()
    test_harness_version()
    test_discovery_config()
    test_sprint_config()
    test_depends_on_contract()
    test_unattended_loop_reference()
    test_two_stage_review()
    test_eval_set()
    test_upgrade_advisory()
    test_markdown_links()
    test_obsidian_contract()
    test_business_intake_prompts()
    test_business_context_advisory()
    test_tools_discovery_advisory()
    test_evals_advisory()
    test_preflight_advisory()
    test_discovery_reference()
    test_evals_reference()
    test_feature_request_tools_link()
    test_description_gate()
    test_token_budgets()
    test_security_contract()
    test_w011_passive_framing()
    print(f"\n  {_run} run, {_run - _failures} passed, {_failures} failed")
    return 1 if _failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
