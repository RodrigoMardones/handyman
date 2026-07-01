#!/usr/bin/env python3
"""Handyman skill, MCP, and agent discovery helper.

Platform discovery of skills and MCP servers is *semantic*: a skill triggers on
its `description` (progressive disclosure) and an MCP tool surfaces through a
deferred list plus a semantic `tool_search`. This script is the deterministic
counterpart the harness asks for in docs/analisis-tool-discovery.md: it lists the
installed skills, finds them by keyword without a similarity model, and checks the
`discovery` block of `harness.config.json` against what is actually on disk.

It does not — and cannot — force the platform to trigger a skill; it only makes the
*declaration* and the *existence* of skills, MCP servers, and consultation agents
reproducible and auditable.

Operations:
  list                 Print every installed skill (name + description).
  find KEYWORD          Print installed skills whose name/description match KEYWORD.
  check                Cross-check the declared discovery block (skills, agents, MCP)
                       against disk, printing the resolved path of each present
                       skill and agent as a direct reference.

Usage:
  scripts/tools_discovery.py [--root PATH] [--skills-dir DIR ...] list [--json]
  scripts/tools_discovery.py [--root PATH] [--skills-dir DIR ...] find KEYWORD [--json]
  scripts/tools_discovery.py [--root PATH] [--skills-dir DIR ...] check

Skill roots resolve from --skills-dir (verbatim override), else the project-local
roots (<root>/.agents/skills, .claude/skills, .github/skills) FIRST, then the
global roots from $HANDYMAN_SKILL_ROOTS (os.pathsep-separated) or the ~/... defaults
— "always local, then global". Missing roots are skipped (graceful degradation).

MCP servers are validated against on-disk host manifests declared in
MCP_CONFIG_SOURCES (VS Code's .vscode/mcp.json today; the registry is open to new
hosts): a declared server present in a manifest is `ok`, an absent one is a
non-gating NOTE (it may be host/extension-provided), and a configured-but-undeclared
server is noted. With no manifest on disk, `check` falls back to shape validation.

Agents (consultation subagents) are role files (`*.agent.md`) under the platform
role directories imported from validate_harness (`.github/agents`, `.claude/agents`).
Because a role file is a document on disk, a declared agent is verified like a skill:
present is `ok` with its path, absent is `MISSING` and gates. The contract declares
*names* (portable); `check` resolves and prints the *path* (machine-specific) as a
direct reference — it is never persisted in the declaration.

Exit codes: 0 ok, 1 a declared skill or agent is missing (check), 2 usage error.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

# scripts/ is on sys.path[0] when run as a script, so this resolves.
from validate_harness import resolve_workspace, PLATFORM_ROLE_DIRS

DEFAULT_LOCAL_SKILL_DIRS = (".agents/skills", ".claude/skills", ".github/skills")
DEFAULT_GLOBAL_SKILL_ROOTS = ("~/.agents/skills", "~/.claude/skills", "~/.github/skills")

# MCP server configuration sources, in precedence order. Each row maps a host label
# to its workspace-relative config file and the JSON key holding the server map.
# The registry is intentionally open: add a row to support a new host (for example
# ".cursor/mcp.json" or a root ".mcp.json") without touching the logic below.
MCP_CONFIG_SOURCES = (
    ("vscode", ".vscode/mcp.json", "servers"),
)

_FRONT_FENCE = re.compile(r"^---\s*$")


def err(msg: str) -> int:
    print(f"error: {msg}", file=sys.stderr)
    return 2


def skill_roots(cli_dirs: list[str] | None, root: Path | str | None = None) -> list[Path]:
    """Resolve the ordered skill roots to scan, *local first, then global*.

    `--skills-dir` is an explicit, hermetic override and is used verbatim. Otherwise
    the project-local roots (`<root>/.agents/skills`, `.claude/skills`,
    `.github/skills`) are scanned BEFORE the global roots (from
    `$HANDYMAN_SKILL_ROOTS`, else the `~/...` defaults). Because the first occurrence
    of a skill name wins (see `discover_skills`), a locally vendored skill shadows a
    same-named global one — "always local, then global". Missing roots are skipped.
    """
    if cli_dirs:
        raw = list(cli_dirs)
    else:
        base = Path(root).expanduser() if root is not None else Path(".")
        local = [str(base / rel) for rel in DEFAULT_LOCAL_SKILL_DIRS]
        if os.environ.get("HANDYMAN_SKILL_ROOTS"):
            global_roots = os.environ["HANDYMAN_SKILL_ROOTS"].split(os.pathsep)
        else:
            global_roots = list(DEFAULT_GLOBAL_SKILL_ROOTS)
        raw = local + global_roots
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
            fields[last_key] = value # type: ignore
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


def discover_agents(root: Path) -> list[dict[str, str]]:
    """Return a sorted, de-duplicated catalog of consultation agents (role files).

    An agent is any `<root>/<dir>/*.agent.md` where `<dir>` is one of the platform
    role directories (`.github/agents`, `.claude/agents`, imported from
    validate_harness so the two stay in sync). Its name is the frontmatter `name`
    (falling back to the file stem without the `.agent` suffix) and its description
    is the frontmatter `description`. First occurrence wins on duplicate names.
    Because a role file is a document on disk, its presence is verifiable — unlike a
    host-defined MCP server.
    """
    seen: dict[str, dict[str, str]] = {}
    for rel in PLATFORM_ROLE_DIRS:
        directory = root / rel
        if not directory.is_dir():
            continue
        for agent_md in sorted(directory.glob("*.agent.md")):
            front = _parse_frontmatter(agent_md)
            name = front.get("name") or agent_md.name[: -len(".agent.md")]
            if name in seen:
                continue
            seen[name] = {
                "name": name,
                "description": front.get("description", ""),
                "path": str(agent_md),
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


def discover_mcp_servers(root: Path) -> dict[str, str]:
    """Return a map of configured MCP server name -> host label.

    Scans every source in `MCP_CONFIG_SOURCES` relative to the project root (for
    example VS Code's `.vscode/mcp.json` `servers` map). Missing files and malformed
    JSON are skipped (graceful degradation); the first host to declare a name wins.
    """
    found: dict[str, str] = {}
    for host, rel, key in MCP_CONFIG_SOURCES:
        path = root / rel
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        block = data.get(key) if isinstance(data, dict) else None
        if isinstance(block, dict):
            for name in block:
                found.setdefault(name, host)
        elif isinstance(block, list):
            for item in block:
                if isinstance(item, str):
                    found.setdefault(item, host)
                elif isinstance(item, dict) and isinstance(item.get("name"), str):
                    found.setdefault(item["name"], host)
    return found


def mcp_sources_present(root: Path) -> list[str]:
    """List the MCP config files that actually exist under the project root."""
    return [rel for _host, rel, _key in MCP_CONFIG_SOURCES if (root / rel).is_file()]


def cmd_list(args) -> int:
    roots = skill_roots(args.skills_dir, args.root)
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
    roots = skill_roots(args.skills_dir, args.root)
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

    roots = skill_roots(args.skills_dir, root)
    skill_path = {s["name"]: s["path"] for s in discover_skills(roots)}
    installed = set(skill_path)

    declared_skills = discovery.get("skills") or []
    missing = [s for s in declared_skills if s not in installed]
    for name in declared_skills:
        if name in missing:
            print(f"skill {name}: MISSING")
        else:
            print(f"skill {name}: ok -> {skill_path[name]}")

    undeclared = sorted(installed - set(declared_skills))
    for name in undeclared:
        print(f"NOTE: installed but not declared: {name}")

    declared_agents = discovery.get("agents") or []
    agent_path = {a["name"]: a["path"] for a in discover_agents(root)}
    installed_agents = set(agent_path)
    missing_agents = [a for a in declared_agents if a not in installed_agents]
    for name in declared_agents:
        if name in missing_agents:
            print(f"agent {name}: MISSING")
        else:
            print(f"agent {name}: ok -> {agent_path[name]}")
    for name in sorted(installed_agents - set(declared_agents)):
        print(f"NOTE: installed but not declared: agent {name}")

    declared_mcp = discovery.get("mcp") or []
    configured = discover_mcp_servers(root)
    sources = mcp_sources_present(root)
    for name in declared_mcp:
        if not (isinstance(name, str) and name.strip()):
            print(f"mcp {name}: INVALID")
        elif name in configured:
            print(f"mcp {name}: ok (configured in {configured[name]})")
        elif sources:
            # A manifest exists but does not list it; likely host/extension-provided.
            print(f"mcp {name}: NOTE not configured in {', '.join(sources)} "
                  "(host-provided?)")
        else:
            print(f"mcp {name}: ok (declared, not verifiable on disk)")

    if sources:
        declared_names = {n for n in declared_mcp if isinstance(n, str)}
        for name in sorted(set(configured) - declared_names):
            print(f"NOTE: configured but not declared: {name} ({configured[name]})")

    if missing:
        print(f"error: {len(missing)} declared skill(s) missing: {', '.join(missing)}",
              file=sys.stderr)
        return 1
    if missing_agents:
        print(f"error: {len(missing_agents)} declared agent(s) missing: "
              f"{', '.join(missing_agents)}", file=sys.stderr)
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
