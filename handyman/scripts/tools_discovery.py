#!/usr/bin/env python3
"""Handyman skill/MCP discovery helper.

Platform discovery of skills and MCP servers is *semantic*: a skill triggers on
its `description` (progressive disclosure) and an MCP tool surfaces through a
deferred list plus a semantic `tool_search`. This script is the deterministic
counterpart the harness asks for in docs/analisis-tool-discovery.md: it lists the
installed skills, finds them by keyword without a similarity model, and checks the
`discovery` block of `harness.config.json` against what is actually on disk.

It does not — and cannot — force the platform to trigger a skill; it only makes the
*declaration* and the *existence* of skills/MCPs reproducible and auditable.

Operations:
  list                 Print every installed skill (name + description).
  find KEYWORD          Print installed skills whose name/description match KEYWORD.
  check                Cross-check the declared discovery block against disk.

Usage:
  scripts/tools_discovery.py [--root PATH] [--skills-dir DIR ...] list [--json]
  scripts/tools_discovery.py [--skills-dir DIR ...] find KEYWORD [--json]
  scripts/tools_discovery.py [--root PATH] [--skills-dir DIR ...] check

Skill roots resolve from --skills-dir (repeatable), else $HANDYMAN_SKILL_ROOTS
(os.pathsep-separated), else the defaults ~/.agents/skills and ~/.claude/skills.
Missing roots are skipped (graceful degradation). MCP servers have no on-disk
manifest in this environment, so `check` validates only that declared MCP entries
are well-formed strings; their real availability is decided by the host.

Exit codes: 0 ok, 1 a declared skill is missing (check), 2 usage error.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

# scripts/ is on sys.path[0] when run as a script, so this resolves.
from validate_harness import resolve_workspace

DEFAULT_SKILL_ROOTS = ("~/.agents/skills", "~/.claude/skills")

_FRONT_FENCE = re.compile(r"^---\s*$")


def err(msg: str) -> int:
    print(f"error: {msg}", file=sys.stderr)
    return 2


def skill_roots(cli_dirs: list[str] | None) -> list[Path]:
    """Resolve the ordered list of skill root directories to scan."""
    if cli_dirs:
        raw = cli_dirs
    elif os.environ.get("HANDYMAN_SKILL_ROOTS"):
        raw = os.environ["HANDYMAN_SKILL_ROOTS"].split(os.pathsep)
    else:
        raw = list(DEFAULT_SKILL_ROOTS)
    roots: list[Path] = []
    for item in raw:
        path = Path(item).expanduser()
        if path.is_dir() and path not in roots:
            roots.append(path)
    return roots


def _parse_frontmatter(skill_md: Path) -> dict[str, str]:
    """Extract `name` and `description` from a SKILL.md YAML frontmatter block.

    Minimal, dependency-free parser: read the first `---` fenced block and pick up
    single-line `key: value` pairs, folding indented continuation lines into the
    previous value (enough for the `description` field).
    """
    try:
        lines = skill_md.read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    if not lines or not _FRONT_FENCE.match(lines[0]):
        return {}
    fields: dict[str, str] = {}
    last_key: str | None = None
    for line in lines[1:]:
        if _FRONT_FENCE.match(line):
            break
        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if match:
            last_key = match.group(1).lower()
            value = match.group(2).strip()
            if value in (">", "|", ">-", "|-", ">+", "|+"):
                value = ""  # YAML block scalar; fold the following lines
            fields[last_key] = value
        elif last_key and line.strip():
            # Continuation of a folded/multi-line value.
            fields[last_key] = (fields[last_key] + " " + line.strip()).strip()
    return fields


def discover_skills(roots: list[Path]) -> list[dict[str, str]]:
    """Return a sorted, de-duplicated catalog of installed skills.

    A skill is any `<root>/<dir>/SKILL.md`. Its name is the frontmatter `name`
    (falling back to the directory name) and its description is the frontmatter
    `description` (possibly empty). First occurrence wins on duplicate names.
    """
    seen: dict[str, dict[str, str]] = {}
    for root in roots:
        for skill_md in sorted(root.glob("*/SKILL.md")):
            front = _parse_frontmatter(skill_md)
            name = front.get("name") or skill_md.parent.name
            if name in seen:
                continue
            seen[name] = {
                "name": name,
                "description": front.get("description", ""),
                "path": str(skill_md),
            }
    return [seen[name] for name in sorted(seen)]


def read_discovery(root: Path) -> dict | None:
    """Read the `discovery` block following the config precedence.

    Order: harness.config.json -> feature_list.json config (in the workspace).
    Returns None when no discovery block is declared.
    """
    config = root / "harness.config.json"
    if config.is_file():
        try:
            data = json.loads(config.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            data = {}
        if isinstance(data.get("discovery"), dict):
            return data["discovery"]
    workspace = resolve_workspace(root)
    feature_list = workspace / "feature_list.json"
    if feature_list.is_file():
        try:
            data = json.loads(feature_list.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            data = {}
        disc = (data.get("config") or {}).get("discovery")
        if isinstance(disc, dict):
            return disc
    return None


def cmd_list(args) -> int:
    roots = skill_roots(args.skills_dir)
    skills = discover_skills(roots)
    if args.json:
        print(json.dumps(skills, indent=2))
        return 0
    if not skills:
        print("no skills found in: " + (", ".join(str(r) for r in roots) or "<none>"))
        return 0
    for skill in skills:
        print(f"{skill['name']}\t{skill['description']}")
    return 0


def cmd_find(args) -> int:
    needle = args.keyword.lower()
    roots = skill_roots(args.skills_dir)
    matches = [
        s for s in discover_skills(roots)
        if needle in s["name"].lower() or needle in s["description"].lower()
    ]
    if args.json:
        print(json.dumps(matches, indent=2))
        return 0
    if not matches:
        print(f"no skill matches '{args.keyword}'")
        return 0
    for skill in matches:
        print(f"{skill['name']}\t{skill['description']}")
    return 0


def cmd_check(args) -> int:
    root = Path(args.root).resolve()
    discovery = read_discovery(root)
    if discovery is None:
        print("no discovery block declared; nothing to verify")
        return 0

    roots = skill_roots(args.skills_dir)
    installed = {s["name"] for s in discover_skills(roots)}

    declared_skills = discovery.get("skills") or []
    missing = [s for s in declared_skills if s not in installed]
    for name in declared_skills:
        flag = "MISSING" if name in missing else "ok"
        print(f"skill {name}: {flag}")

    undeclared = sorted(installed - set(declared_skills))
    for name in undeclared:
        print(f"NOTE: installed but not declared: {name}")

    declared_mcp = discovery.get("mcp") or []
    for name in declared_mcp:
        shape = "ok (declared, not verifiable on disk)" if isinstance(name, str) and name.strip() else "INVALID"
        print(f"mcp {name}: {shape}")

    if missing:
        print(f"error: {len(missing)} declared skill(s) missing: {', '.join(missing)}",
              file=sys.stderr)
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="List, find, and check Handyman skills and MCP declarations.")
    parser.add_argument("--root", default=".",
                        help="Project root (for resolving the discovery block).")
    parser.add_argument("--skills-dir", action="append", default=None,
                        help="Skill root directory to scan (repeatable).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="List installed skills.")
    p_list.add_argument("--json", action="store_true", help="Emit JSON.")
    p_list.set_defaults(func=cmd_list)

    p_find = sub.add_parser("find", help="Find installed skills by keyword.")
    p_find.add_argument("keyword")
    p_find.add_argument("--json", action="store_true", help="Emit JSON.")
    p_find.set_defaults(func=cmd_find)

    p_check = sub.add_parser("check", help="Check declared discovery against disk.")
    p_check.set_defaults(func=cmd_check)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
