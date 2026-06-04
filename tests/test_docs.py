#!/usr/bin/env python3
"""Documentation-structure tests for the Handyman skill.

Validates contracts that the skill's markdown promises:
  T1  Every assets/*.template.json file is valid JSON.
  T2  Every relative markdown link across the repo resolves to a file.
  T3  Obsidian frontmatter keys + tag namespace appear in the assets templates.

Exit code 0 when all pass, 1 otherwise.
"""
from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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
    for dirpath, dirnames, filenames in os.walk(ROOT):
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
                rel_md = os.path.relpath(md, ROOT)
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


def main() -> int:
    print("Doc-structure suite (test_docs.py)")
    test_json_templates()
    test_markdown_links()
    test_obsidian_contract()
    print(f"\n  {_run} run, {_run - _failures} passed, {_failures} failed")
    return 1 if _failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
