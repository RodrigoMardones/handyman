# Harness Templates

Use these as starting points. Adjust them to the project language, test runner, architecture, and agent platform.

The full template bodies live as standalone files under [`../assets/`](../assets/) so they can be copied directly into a target repo. Each section below explains a template and links to its asset file.

Path placeholders used below:

- `PROJECT_ROOT`: the repo where product code and verifier commands run.
- `HANDYMAN_ROOT`: `$HOME/HANDYMAN` in global mode.
- `HARNESS_WORKSPACE`: the directory that owns mutable harness state. It is `PROJECT_ROOT/.handyman` in local mode and `$HANDYMAN_ROOT/<project_name>` in global mode.

## AGENTS.md

Agent navigation map and entrypoint for the repo. Place it in `PROJECT_ROOT`.

Template: [../assets/AGENTS.template.md](../assets/AGENTS.template.md)

## feature_list.json

Feature backlog and status, stored in `HARNESS_WORKSPACE`.

Template: [../assets/feature_list.template.json](../assets/feature_list.template.json)

## harness.config.json

Create this bridge file in the project root. In local mode it records the `.handyman` workspace; in global mode it points to the external HANDYMAN workspace. The optional `models` map assigns a model per role (see [models.md](./models.md)) and the optional `tools` map assigns a tool set per role (see [tools.md](./tools.md)).

Use `"editor-default"` (or omit a key) to follow the model configured in the host editor. Omit the `tools` map (or a role key) to fall back to the Handyman per-role tool defaults.

- Local install: [../assets/harness.config.local.template.json](../assets/harness.config.local.template.json)
- Global install: [../assets/harness.config.global.template.json](../assets/harness.config.global.template.json)

## progress/current.md

Active session state, reset when a session closes. Lives in `HARNESS_WORKSPACE/progress/`.

Template: [../assets/progress-current.template.md](../assets/progress-current.template.md)

## progress/history.md

Append-only session history. Lives in `HARNESS_WORKSPACE/progress/`.

Template: [../assets/progress-history.template.md](../assets/progress-history.template.md)

## backlog/impl_<feature>.md

Implementer report. Lives in `HARNESS_WORKSPACE/backlog/`.

Template: [../assets/backlog-impl.template.md](../assets/backlog-impl.template.md)

## backlog/review_<feature>.md

Reviewer verdict. Lives in `HARNESS_WORKSPACE/backlog/`. Use `status: approved` with `handyman/review/approved`, or `status: changes_requested` with `handyman/review/changes_requested`.

Template: [../assets/backlog-review.template.md](../assets/backlog-review.template.md)

## index.md (Obsidian MOC)

Optional but recommended at the root of the `HARNESS_WORKSPACE` to make the vault navigable from Obsidian. The starter MOC only links files that are generated inside `HARNESS_WORKSPACE`, so it works for both local and global installs. In both modes the repo-root bridge files `AGENTS.md` and `CHECKPOINTS.md` live outside the vault (`.handyman` in local mode, the external HANDYMAN workspace in global mode), so reference them as plain paths and do not add them as vault wikilinks unless you mirror them intentionally.

Template: [../assets/index.template.md](../assets/index.template.md)

## .gitignore (Obsidian)

Append to the project or workspace `.gitignore` so Obsidian's local cache stays out of version control. In local installs the vault lives in `.handyman/`, so ignore the cache there too.

Template: [../assets/obsidian.gitignore.template](../assets/obsidian.gitignore.template)

## docs/architecture.md

Defines what good work means in this repo. Reviewers evaluate code against it.

Template: [../assets/docs-architecture.template.md](../assets/docs-architecture.template.md)

## docs/conventions.md

Naming, style, structure, tests, error handling, and comment policy.

Template: [../assets/docs-conventions.template.md](../assets/docs-conventions.template.md)

## docs/verification.md

Required verification commands, test levels, and anti-patterns.

Template: [../assets/docs-verification.template.md](../assets/docs-verification.template.md)

## CHECKPOINTS.md

Final-state checklist. Place it in `PROJECT_ROOT`.

Template: [../assets/CHECKPOINTS.template.md](../assets/CHECKPOINTS.template.md)

## Role: leader

The leader uses a stronger reasoning model and the widest tool set. Set `model` to the editor default or the strongest available model. See [models.md](./models.md) and [tools.md](./tools.md).

Template: [../assets/role-leader.template.md](../assets/role-leader.template.md)

## Role: implementer

The implementer defaults to a cheaper, faster model. Prefer a cheap model already configured in the editor; otherwise use `Claude Sonnet 4.6`. See [models.md](./models.md) and [tools.md](./tools.md).

Template: [../assets/role-implementer.template.md](../assets/role-implementer.template.md)

## Role: reviewer

The reviewer defaults to a cheaper, faster model. Prefer a cheap model already configured in the editor; otherwise use `Claude Sonnet 4.6`. See [models.md](./models.md) and [tools.md](./tools.md).

Template: [../assets/role-reviewer.template.md](../assets/role-reviewer.template.md)

## Role: explorer

The explorer uses the cheapest fast model and a read-only tool set (no `edit`, no `agent`). See [models.md](./models.md) and [tools.md](./tools.md).

Template: [../assets/role-explorer.template.md](../assets/role-explorer.template.md)

## init.sh Shape

Executable verifier that resolves `HARNESS_WORKSPACE`, checks required files, validates feature state, and then runs the quality gates `lint -> build -> test` from `PROJECT_ROOT`. A small `run_phase` helper runs every gate and aggregates failures so the summary reports all problems before exiting non-zero. Replace the `run_lint`, `run_build`, and `run_test` placeholders with the project's real commands (e.g. `ruff`, `npm run build`, `pytest`); each placeholder fails by default so an unconfigured gate cannot silently pass.

Template: [../assets/init.template.sh](../assets/init.template.sh)
