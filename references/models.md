# Role Models

Handyman roles are not interchangeable, so their models should not be either. A leader reasons and orchestrates, an implementer writes code and tests, and a reviewer validates against contracts. Assigning a model per role keeps cost under control without hurting the parts that need stronger reasoning.

This reference documents how Handyman picks a model for each role, the recommended defaults, and how to override them per platform. For the complementary per-role tool restrictions, see [tools.md](./tools.md).

## Why Per-Role Models

- The leader benefits from stronger reasoning to plan, sequence features, and synthesize exploration reports.
- The implementer and reviewer do bounded, well-specified work and run frequently, so a cheaper and faster model keeps the loop affordable.
- The explorer does read-only research with narrow questions, so the cheapest fast model is usually enough.

The goal is to spend reasoning budget where decisions are made and save cost on the high-frequency, well-scoped roles.

## Resolution Order

When a role needs a model, resolve it in this order and stop at the first match:

1. An explicit `model` value in the role file frontmatter.
2. A `models` map in `harness.config.json` keyed by role (`leader`, `implementer`, `reviewer`, `explorer`).
3. A model already configured in the host editor or agent platform (see [Discovering Editor Models](#discovering-editor-models)).
4. The Handyman default for that role (see the table below).

Always confirm the resolved identifier matches a model that is actually available in the host platform. If it does not, fall back to the platform default and document the substitution in `$HARNESS_WORKSPACE/progress/current.md`.

## Recommended Defaults

| Role | Default tier | Suggested default | Rationale |
|------|--------------|-------------------|-----------|
| `leader` | High-capability reasoning | Editor default reasoning model, or the strongest model available | Plans, sequences, and audits work. |
| `implementer` | Cost-efficient coding | Editor-configured cheap model, else `Claude Sonnet 4.6` | Bounded, well-specified, runs often. |
| `reviewer` | Cost-efficient validation | Editor-configured cheap model, else `Claude Sonnet 4.6` | Checks against fixed contracts, runs often. |
| `explorer` | Cheapest fast | Editor-configured fast model, else `Claude Sonnet 4.6` | Read-only, narrow questions. |

Default rule for cheap roles (`implementer`, `reviewer`, `explorer`): prefer a cheap model that is already configured in the editor; if none is found, default to `Claude Sonnet 4.6`.

> The identifier `Claude Sonnet 4.6` is a placeholder default. Replace it with the exact name or alias the host platform exposes (for example `sonnet` in Claude Code, or the display name shown in the VS Code model picker). Pick the closest available Sonnet-class model when that exact version is not listed.

## Declaring Models In Role Files

Add a `model` key to the role frontmatter. Keep the rest of the role contract unchanged.

VS Code / Copilot agent file (`*.agent.md`):

```markdown
---
name: implementer
description: Implements exactly one feature with tests and self-verification.
model: Claude Sonnet 4.6
---
```

Claude Code subagent file (`.claude/agents/*.md`):

```markdown
---
name: implementer
description: Implements exactly one feature with tests and self-verification.
model: sonnet
---
```

Claude Code accepts `sonnet`, `opus`, `haiku`, `inherit`, or a full model id. Use `inherit` only when you intentionally want the role to follow the session model instead of a fixed per-role model.

## Declaring Models In harness.config.json

A `models` map centralizes the assignment so all role files can stay generic. This is optional and complements per-file frontmatter.

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
  }
}
```

Use `"editor-default"` (or omit the key) to signal that the role should use whatever model the host editor has configured.

## Discovering Editor Models

Before falling back to a fixed default, try to use a model the user already configured:

- **VS Code / GitHub Copilot Chat:** the chat model picker lists the available models; agent files (`*.agent.md`) accept a `model` frontmatter value matching one of those display names. There is no Handyman API to read the picker, so when the editor model is unknown, ask the user or use the role default.
- **Claude Code:** subagent frontmatter accepts `model: sonnet | opus | haiku | inherit | <model-id>`; `inherit` follows the active session model.
- **Other platforms:** map the role to the closest available model tier (cheap for implementer/reviewer/explorer, strong for leader).

If the host platform cannot be queried programmatically, prefer the documented role default and record which model was actually used in the session log.

## What To Document Per Project

When bootstrapping or migrating a harness, document the model decisions so they are auditable:

- The resolved model for each role (`leader`, `implementer`, `reviewer`, `explorer`).
- Whether each model came from the editor, `harness.config.json`, role frontmatter, or the Handyman default.
- Any substitution made because the requested model was unavailable, recorded in `$HARNESS_WORKSPACE/progress/current.md`.
- Cost or rate-limit constraints that justify a non-default choice.

Keep this in the harness `docs/` (for example a short note in `docs/conventions.md`) so future sessions reuse the same per-role model policy.
