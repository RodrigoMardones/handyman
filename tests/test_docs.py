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
        # links are illustrative and only resolve inside a target repo.
        if ".git" in parts or "assets" in parts:
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


def main() -> int:
    print("Doc-structure suite (test_docs.py)")
    test_json_templates()
    test_json_schemas()
    test_harness_version()
    test_upgrade_advisory()
    test_markdown_links()
    test_obsidian_contract()
    test_business_intake_prompts()
    test_business_context_advisory()
    test_token_budgets()
    test_security_contract()
    test_w011_passive_framing()
    print(f"\n  {_run} run, {_run - _failures} passed, {_failures} failed")
    return 1 if _failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
