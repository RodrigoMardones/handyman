# Role Tools

Handyman roles have different jobs, so they should not share the same tool access. A leader orchestrates and may delegate, research, and drive a browser; an implementer and a reviewer do bounded, well-specified work on files; an explorer only reads. Restricting each role to the tools it actually needs follows least privilege, keeps sessions predictable, and prevents a role from stepping outside its contract (for example, an explorer accidentally editing code).

This reference documents the capability groups Handyman uses, the recommended per-role tool sets, and how to override them per platform. It complements [models.md](./models.md): models decide how much a role can reason, tools decide what a role is allowed to do.

## Why Per-Role Tools

- The leader plans, sequences, and audits work, so it needs delegation (`agent`), research (`web`, `browser`), and the full editing surface for harness state.
- The implementer and reviewer act on a single feature with concrete files and tests, so they need to read, edit, search, and run the verifier, but not delegate or browse the web.
- The explorer answers narrow, read-only questions, so it gets read and search access but no `edit` and no `agent`.

The goal is to grant each role the smallest tool set that still lets it finish its job.

## Capability Groups

Tool names below are logical capability groups, not a single vendor tool. Map each group to the equivalent tools the host platform exposes.

| Group | Capability | Typical platform tools |
|-------|------------|------------------------|
| `vscode` | Editor/IDE integration: run commands, tasks, and editor APIs | VS Code command and task tools |
| `execute` | Run shell commands, the verifier, and tests | terminal / run-command tools |
| `read` | Read files and list directories | file read and directory listing |
| `edit` | Create and modify files | file create/edit/patch tools |
| `search` | Search code and files by text, pattern, or meaning | grep, file search, semantic search |
| `agent` | Delegate work to subagents | subagent / task-runner tools |
| `web` | Fetch and search the web | web fetch / web search |
| `browser` | Drive a browser to validate UI or flows | browser automation tools |
| `todo` | Manage task or todo lists | todo / task-tracking tools |

## Recommended Per-Role Tools

| Role | Default tools | Rationale |
|------|---------------|-----------|
| `leader` | `vscode`, `execute`, `read`, `agent`, `edit`, `search`, `web`, `browser`, `todo` | Orchestrates, delegates, researches, and audits; needs the widest surface. |
| `implementer` | `vscode`, `execute`, `read`, `edit`, `search`, `todo` | Edits one feature, writes tests, runs the verifier; no delegation or web. |
| `reviewer` | `vscode`, `execute`, `read`, `edit`, `search`, `todo` | Inspects changes, runs the verifier, writes a verdict file; no delegation or web. |
| `explorer` | `vscode`, `execute`, `read`, `search`, `todo` | Read-only research; no `edit` and no `agent`. |

These are minimums. A project may grant additional groups, but should justify any expansion (for example, giving the explorer `web` for documentation research) in the harness `docs/`.

> The `edit` group for the `reviewer` exists so it can write `backlog/review_<feature>.md` and update harness state. It does not relax the role rule: the reviewer still never edits product code. The boundary between "edit harness reports" and "edit product code" is a protocol rule, not a tool restriction. See [workflow.md](./workflow.md).

## Resolution Order

When a role needs its tool set, resolve it in this order and stop at the first match:

1. An explicit `tools` list in the role file frontmatter.
2. A `tools` map in `harness.config.json` keyed by role (`leader`, `implementer`, `reviewer`, `explorer`).
3. The Handyman default for that role (see the table above).

Always confirm each resolved group maps to a tool the host platform actually exposes. If a group has no equivalent on the platform, drop it and document the omission in `$HARNESS_WORKSPACE/progress/current.md`.

## Declaring Tools In Role Files

Add a `tools` key to the role frontmatter alongside `model`. Keep the rest of the role contract unchanged.

VS Code / Copilot agent file (`*.agent.md`):

```markdown
---
name: implementer
description: Implements exactly one feature with tests and self-verification.
model: Claude Sonnet 4.6
tools: [vscode, execute, read, edit, search, todo]
---
```

Map each logical group to the concrete tool identifiers the platform lists when the host requires explicit tool names.

Claude Code subagent file (`.claude/agents/*.md`):

```markdown
---
name: implementer
description: Implements exactly one feature with tests and self-verification.
model: sonnet
tools: Read, Edit, Bash, Grep, Glob
---
```

Claude Code expects concrete tool names (for example `Read`, `Edit`, `Bash`, `Grep`, `Glob`, `Task`, `WebFetch`). Translate the logical groups: `read -> Read`, `edit -> Edit/Write`, `execute -> Bash`, `search -> Grep/Glob`, `agent -> Task`, `web -> WebFetch/WebSearch`. Omit a tool to deny it; an absent `tools` key inherits all tools, so list tools explicitly when you want to restrict a role.

## Declaring Tools In harness.config.json

A `tools` map centralizes the assignment so role files can stay generic. This is optional and complements per-file frontmatter, mirroring the `models` map.

```json
{
  "install_mode": "local",
  "project_name": "project-name",
  "project_root": ".",
  "handyman_root": null,
  "harness_workspace": ".handyman",
  "models": {
    "leader": "editor-default",
    "implementer": "Claude Sonnet 4.6",
    "reviewer": "Claude Sonnet 4.6",
    "explorer": "Claude Sonnet 4.6"
  },
  "tools": {
    "leader": ["vscode", "execute", "read", "agent", "edit", "search", "web", "browser", "todo"],
    "implementer": ["vscode", "execute", "read", "edit", "search", "todo"],
    "reviewer": ["vscode", "execute", "read", "edit", "search", "todo"],
    "explorer": ["vscode", "execute", "read", "search", "todo"]
  }
}
```

## What To Document Per Project

When bootstrapping or migrating a harness, document the tool decisions so they are auditable:

- The resolved tool set for each role (`leader`, `implementer`, `reviewer`, `explorer`).
- Whether each set came from role frontmatter, `harness.config.json`, or the Handyman default.
- Any group dropped because the host platform had no equivalent, recorded in `$HARNESS_WORKSPACE/progress/current.md`.
- Any group added beyond the recommended minimum and why.

Keep this next to the model policy in the harness `docs/` (for example a short note in `docs/conventions.md`) so future sessions reuse the same per-role tool policy.
