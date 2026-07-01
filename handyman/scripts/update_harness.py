#!/usr/bin/env python3
"""Handyman harness updater.

Complements scripts/scaffold.sh: scaffold never overwrites, this script
updates parameters of an EXISTING harness consistently across every surface
where they are declared, so config and role frontmatter never drift apart.

Surfaces updated per role:
  - harness.config.json            -> "models" / "tools" maps
  - .github/agents/<role>.agent.md -> frontmatter `model:` / `tools:`
  - .claude/agents/<role>.md       -> frontmatter `model:` / `tools:`

When pointed at the Handyman skill repo itself (detected by SKILL.md +
assets/), it updates the distributed templates instead:
  - assets/harness.config.local.template.json / .global.template.json
  - assets/role-<role>.template.md

Usage:
  scripts/update_harness.py [--root PATH] --list
  scripts/update_harness.py [--root PATH] --check
  scripts/update_harness.py [--root PATH] [--dry-run] --sync
  scripts/update_harness.py [--root PATH] [--dry-run] \
      [--model ROLE=MODEL]... [--tools ROLE=t1,t2,...]... [--set KEY=VALUE]...

Examples:
  # Audit current per-role models/tools of the harness in the cwd
  scripts/update_harness.py --list

  # Report config <-> role-file drift (read-only, exit 1 on drift)
  scripts/update_harness.py --check

  # Reconcile role files to the config deterministically (config is the source)
  scripts/update_harness.py --sync

  # Bump the cheap-tier model everywhere it is declared
  scripts/update_harness.py --model implementer="Claude Sonnet 5" \
      --model reviewer="Claude Sonnet 5" --model explorer="Claude Sonnet 5"

  # Preview without writing
  scripts/update_harness.py --dry-run --model leader=editor-default

  # Restrict reviewer tools
  scripts/update_harness.py --tools reviewer=vscode,read,search,todo

  # Update a top-level scalar config key
  scripts/update_harness.py --set project_name=my-project

Exit codes: 0 ok, 1 error, 2 usage.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys

ROLES = ("leader", "implementer", "reviewer", "explorer")
# Top-level scalar keys allowed via --set. Workspace moves are a migration
# (see SKILL.md "Migrate local to global"), but the keys stay editable for
# repointing after an approved migration.
CONFIG_KEYS = (
    "install_mode",
    "project_name",
    "project_root",
    "handyman_root",
    "harness_workspace",
)

CHANGED, KEEP, ABSENT = "CHANGED", "KEEP", "ABSENT"


def info(msg: str) -> None:
    print(msg)


def err(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)


# --- discovery ---------------------------------------------------------------

def is_skill_repo(root: str) -> bool:
    return (
        os.path.isfile(os.path.join(root, "SKILL.md"))
        and os.path.isdir(os.path.join(root, "assets"))
    )


def discover(root: str) -> dict:
    """Return {'configs': [paths], 'roles': {role: [paths]}} for the root."""
    configs: list[str] = []
    roles: dict[str, list[str]] = {role: [] for role in ROLES}
    if is_skill_repo(root):
        for name in (
            "harness.config.local.template.json",
            "harness.config.global.template.json",
        ):
            path = os.path.join(root, "assets", name)
            if os.path.isfile(path):
                configs.append(path)
        for role in ROLES:
            path = os.path.join(root, "assets", f"role-{role}.template.md")
            if os.path.isfile(path):
                roles[role].append(path)
    else:
        path = os.path.join(root, "harness.config.json")
        if os.path.isfile(path):
            configs.append(path)
        for role in ROLES:
            for rel in (
                os.path.join(".github", "agents", f"{role}.agent.md"),
                os.path.join(".claude", "agents", f"{role}.md"),
            ):
                candidate = os.path.join(root, rel)
                if os.path.isfile(candidate):
                    roles[role].append(candidate)
    return {"configs": configs, "roles": roles}


# --- frontmatter editing -----------------------------------------------------

_FM_RE = re.compile(r"\A---\n(.*?\n)---\n", re.DOTALL)


def edit_frontmatter(text: str, key: str, value: str) -> str | None:
    """Set `key: value` inside the YAML frontmatter. None when no frontmatter."""
    match = _FM_RE.match(text)
    if not match:
        return None
    body = match.group(1)
    line = f"{key}: {value}\n"
    key_re = re.compile(rf"^{re.escape(key)}:[^\n]*\n", re.MULTILINE)
    if key_re.search(body):
        new_body = key_re.sub(line, body, count=1)
    else:
        new_body = body + line
    return text[: match.start(1)] + new_body + text[match.end(1):]


def tools_yaml(tools: list[str]) -> str:
    return "[" + ", ".join(tools) + "]"


# --- file IO -----------------------------------------------------------------

def apply_text(path: str, new_text: str, dry_run: bool) -> str:
    with open(path, encoding="utf-8") as fh:
        old_text = fh.read()
    if old_text == new_text:
        return KEEP
    if dry_run:
        rel = os.path.basename(path)
        diff = difflib.unified_diff(
            old_text.splitlines(keepends=True),
            new_text.splitlines(keepends=True),
            fromfile=f"a/{rel}",
            tofile=f"b/{rel}",
        )
        sys.stdout.writelines(diff)
    else:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(new_text)
    return CHANGED


def load_json(path: str) -> dict | None:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        err(f"invalid JSON in {path}: {exc}")
        return None


def dump_json(data: dict) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


# --- operations ----------------------------------------------------------------

def update_config(path: str, models: dict, tools: dict, sets: dict,
                  dry_run: bool) -> str:
    data = load_json(path)
    if data is None:
        return ABSENT
    if models:
        data.setdefault("models", {}).update(models)
    if tools:
        data.setdefault("tools", {}).update(
            {role: list(value) for role, value in tools.items()}
        )
    data.update(sets)
    return apply_text(path, dump_json(data), dry_run)


def update_role_file(path: str, model: str | None, tools: list[str] | None,
                     dry_run: bool) -> str:
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    new_text: str | None = text
    if model is not None:
        new_text = edit_frontmatter(new_text, "model", model)
        if new_text is None:
            err(f"no YAML frontmatter in {path}; skipped")
            return ABSENT
    if tools is not None:
        new_text = edit_frontmatter(new_text, "tools", tools_yaml(tools))
        if new_text is None:
            err(f"no YAML frontmatter in {path}; skipped")
            return ABSENT
    return apply_text(path, new_text, dry_run)


def list_state(root: str, found: dict) -> None:
    mode = "skill-repo templates" if is_skill_repo(root) else "installed harness"
    info(f"==> root: {root} ({mode})")
    for path in found["configs"]:
        data = load_json(path)
        if data is None:
            continue
        info(f"==> config: {os.path.relpath(path, root)}")
        for role in ROLES:
            model = data.get("models", {}).get(role, "-")
            tools = data.get("tools", {}).get(role, [])
            info(f"    {role:<12} model={model!r} tools={','.join(tools) or '-'}")
        for key in CONFIG_KEYS:
            if key in data:
                info(f"    {key} = {data[key]!r}")
    for role in ROLES:
        for path in found["roles"][role]:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
            match = _FM_RE.match(text)
            body = match.group(1) if match else ""
            model_m = re.search(r"^model:\s*(.+)$", body, re.MULTILINE)
            tools_m = re.search(r"^tools:\s*(.+)$", body, re.MULTILINE)
            info(f"==> role file: {os.path.relpath(path, root)}")
            info(f"    model={model_m.group(1).strip() if model_m else '-'}")
            info(f"    tools={tools_m.group(1).strip() if tools_m else '-'}")


def _norm_model(value: str) -> str:
    """Normalize a model value for comparison (strip surrounding quotes/space)."""
    return str(value).strip().strip("\"'").strip()


def _parse_tools(raw: str) -> list[str]:
    """Parse a frontmatter tools value like '[a, b, c]' into ['a', 'b', 'c']."""
    return [t.strip() for t in raw.strip().strip("[]").split(",") if t.strip()]


def check_state(root: str, found: dict) -> int:
    """Read-only drift audit: config models/tools vs role-file frontmatter.

    The detection counterpart of --list: it gives preflight a real pass/fail
    signal for the config<->role-file sync control. Returns 0 when every role
    file agrees with the config (or there is nothing to compare) and 1 when any
    drift is found. Writes nothing.
    """
    mode = "skill-repo templates" if is_skill_repo(root) else "installed harness"
    info(f"==> sync check: {root} ({mode})")
    expected: dict[str, dict] = {}
    for path in found["configs"]:
        data = load_json(path)
        if data is None:
            continue
        for role in ROLES:
            if role in expected:
                continue
            expected[role] = {
                "model": data.get("models", {}).get(role),
                "tools": data.get("tools", {}).get(role),
            }
    drift = 0
    compared = 0
    for role in ROLES:
        for path in found["roles"][role]:
            compared += 1
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
            match = _FM_RE.match(text)
            body = match.group(1) if match else ""
            model_m = re.search(r"^model:\s*(.+)$", body, re.MULTILINE)
            tools_m = re.search(r"^tools:\s*(.+)$", body, re.MULTILINE)
            file_model = model_m.group(1).strip() if model_m else None
            file_tools = _parse_tools(tools_m.group(1)) if tools_m else None
            exp = expected.get(role, {})
            rel = os.path.relpath(path, root)
            file_drift = 0
            if exp.get("model") is not None and file_model is not None \
                    and _norm_model(exp["model"]) != _norm_model(file_model):
                info(f"    DRIFT {rel}: model config={exp['model']!r} "
                     f"file={file_model!r}")
                file_drift += 1
            if exp.get("tools") is not None and file_tools is not None \
                    and list(exp["tools"]) != file_tools:
                info(f"    DRIFT {rel}: tools config={list(exp['tools'])} "
                     f"file={file_tools}")
                file_drift += 1
            if file_drift == 0:
                info(f"    OK {rel}")
            drift += file_drift
    if compared == 0:
        info("    no role files to compare (config-only harness)")
        return 0
    if drift:
        info(f"==> sync drift: {drift} mismatch(es) between config and role files")
        info("    reconcile deterministically with: "
             "update_harness.py --sync (config -> role files)")
        return 1
    info("==> sync OK: config and role files agree")
    return 0


def sync_state(root: str, found: dict, dry_run: bool) -> int:
    """Reconcile role files to the config deterministically: write the config's
    models/tools into every role-file frontmatter. The config is the canonical
    source of truth (see references/anatomy.md), so the deterministic direction
    is config -> role files. The write counterpart of --check; honors --dry-run.
    Returns 0 on success, 1 on error.
    """
    models: dict[str, str] = {}
    tools: dict[str, list[str]] = {}
    for path in found["configs"]:
        data = load_json(path)
        if data is None:
            continue
        for role in ROLES:
            if role not in models and role in data.get("models", {}):
                models[role] = data["models"][role]
            if role not in tools and role in data.get("tools", {}):
                tools[role] = list(data["tools"][role])
    if not any(found["roles"].values()):
        info("==> sync: no role files to reconcile (config-only harness)")
        return 0
    info("==> sync: reconciling role files to the config (config -> role files)")
    failures = 0
    touched = 0
    for role in ROLES:
        for path in found["roles"][role]:
            result = update_role_file(path, models.get(role),
                                      tools.get(role), dry_run)
            if result == ABSENT:
                failures += 1
            elif result == CHANGED:
                touched += 1
            info(f"    {result}: {os.path.relpath(path, root)}")
    if dry_run:
        info("==> dry-run: nothing written")
    elif touched == 0:
        info("==> sync: role files already match the config")
    else:
        info(f"==> sync: reconciled {touched} role file(s) to the config")
    return 1 if failures else 0


# --- CLI -----------------------------------------------------------------------

def parse_role_arg(raw: str, what: str) -> tuple[str, str]:
    if "=" not in raw:
        raise SystemExit(f"usage: --{what} ROLE=VALUE (got '{raw}')")
    role, value = raw.split("=", 1)
    role = role.strip()
    if role not in ROLES:
        raise SystemExit(f"error: unknown role '{role}' (expected one of {', '.join(ROLES)})")
    if not value.strip():
        raise SystemExit(f"error: empty value for --{what} {role}")
    return role, value.strip()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="update_harness.py",
        description="Update models/tools/config of an existing Handyman harness.",
    )
    parser.add_argument("--root", default=".", help="project root (default: cwd)")
    parser.add_argument("--dry-run", action="store_true",
                        help="print diffs, write nothing")
    parser.add_argument("--list", action="store_true",
                        help="show current models/tools per surface and exit")
    parser.add_argument("--check", action="store_true",
                        help="read-only drift audit: config vs role files, "
                             "exit 1 on drift (writes nothing)")
    parser.add_argument("--sync", action="store_true",
                        help="reconcile role files to the config "
                             "(config -> role files); honors --dry-run")
    parser.add_argument("--model", action="append", default=[],
                        metavar="ROLE=MODEL")
    parser.add_argument("--tools", action="append", default=[],
                        metavar="ROLE=t1,t2,...")
    parser.add_argument("--set", action="append", default=[], dest="sets",
                        metavar="KEY=VALUE")
    args = parser.parse_args(argv)

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        err(f"root '{args.root}' does not exist")
        return 1

    found = discover(root)
    if not found["configs"] and not any(found["roles"].values()):
        err(f"no harness surfaces found under {root} "
            "(expected harness.config.json, .github/agents/, .claude/agents/, "
            "or the skill repo assets/)")
        return 1

    if args.check:
        return check_state(root, found)
    if args.sync:
        return sync_state(root, found, args.dry_run)
    if args.list:
        list_state(root, found)
        return 0

    models: dict[str, str] = {}
    for raw in args.model:
        role, value = parse_role_arg(raw, "model")
        models[role] = value
    tools: dict[str, list[str]] = {}
    for raw in args.tools:
        role, value = parse_role_arg(raw, "tools")
        parsed = [tool.strip() for tool in value.split(",") if tool.strip()]
        if not parsed:
            err(f"empty tools list for role '{role}'")
            return 2
        tools[role] = parsed
    sets: dict[str, str] = {}
    for raw in args.sets:
        if "=" not in raw:
            err(f"usage: --set KEY=VALUE (got '{raw}')")
            return 2
        key, value = raw.split("=", 1)
        if key not in CONFIG_KEYS:
            err(f"unknown config key '{key}' (allowed: {', '.join(CONFIG_KEYS)})")
            return 2
        sets[key] = value
    if "harness_workspace" in sets or "install_mode" in sets:
        info("note: moving the workspace is a migration; see SKILL.md "
             "'Migrate local to global' before relying on this change.")

    if not (models or tools or sets):
        parser.print_usage(sys.stderr)
        err("nothing to do: pass --list, --check, --sync, --model, --tools, or --set")
        return 2

    failures = 0
    if found["configs"]:
        for path in found["configs"]:
            result = update_config(path, models, tools, sets, args.dry_run)
            if result == ABSENT:
                failures += 1
            info(f"    {result}: {os.path.relpath(path, root)}")
    elif sets:
        err("--set requires a harness config file, none found")
        failures += 1

    for role in ROLES:
        role_model = models.get(role)
        role_tools = tools.get(role)
        if role_model is None and role_tools is None:
            continue
        paths = found["roles"][role]
        if not paths:
            info(f"    ABSENT: no role file for '{role}' (config-only update)")
            continue
        for path in paths:
            result = update_role_file(path, role_model, role_tools, args.dry_run)
            if result == ABSENT:
                failures += 1
            info(f"    {result}: {os.path.relpath(path, root)}")

    if args.dry_run:
        info("==> dry-run: nothing written")
    if failures:
        return 1
    info("==> update complete; run the verifier (./init.sh) to confirm "
         "the harness is still coherent")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
