# Harness Templates

Use these as starting points. Adjust them to the project language, test runner, architecture, and agent platform.

The full template bodies live as standalone files under [`../assets/`](../assets/) so they can be copied directly into a target repo. Each section below explains a template and links to its asset file.

To create the skeleton and copy these templates deterministically, run the bundled scaffold from the skill directory: `scripts/scaffold.sh <local|global> <project_root>`. It creates `progress/`, `backlog/`, and `docs/`, copies the mutable-state and bridge templates into the right locations, and never overwrites existing files. Then fill the copied templates with project-specific content. See [examples.md](./examples.md) for a full walkthrough.

`scaffold.sh` is the canonical way to lay down the file set, and it writes `harness.config.json` in both `local` and `global` scopes. Do not hand-create these files from the snippets below: the snippets exist for filling in content and per-file customization, while re-creating the layout by hand is the main cause of cross-model drift (for example `harness.config.json` appearing in one bootstrap and not another). See the Bootstrap Protocol in [workflow.md](./workflow.md).

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

## feature-request.md

Optional intake form the user fills to frame one new feature before it becomes a `feature_list.json` entry. Scaffolded into the `HARNESS_WORKSPACE` root; the leader offers it during `run-feature` and turns the filled form into the feature. It is a convenience, not a verifier gate.

The form encodes two format contracts. First, only `name`, `title`, `description`, and `acceptance` become the `feature_list.json` entry (via `node dist/feature.js add`); the `Verification`, `Considerations`, `Tools`, and `Post-feature` sections are process guidance for the leader and the human, not stored keys. Second, the green gate (`./init.sh` or `bash tests/run_tests.sh`) is always the last Acceptance bullet, mirroring how every closed feature ends its acceptance.

The template is organized as a **CORE** block (filled every time: Feature, Context, Scope > Includes, Acceptance, Verification, Tools > skills) and an **OPTIONAL** block (filled only when it applies, otherwise deleted: Scope extensions, Functional check, Considerations, Post-feature, sub-agents, Questions). It carries two worked examples, one per request archetype: a **Research** request (investigate and leave a plan under `docs/`) and an **Implementation** request (change code plus tests). The heavy guidance lives here and in the template; `SKILL.md` keeps only a short pointer that offers the `feature-request.md` form.

The `Tools > skills` line ties a request to the harness's declared skill set: list skills the harness records under `discovery.skills` in `harness.config.json`, and confirm they are installed with `node dist/tools_discovery.js check` before relying on them. See [discovery.md](./discovery.md).

Template: [../assets/feature-request.template.md](../assets/feature-request.template.md)

## harness.config.json

Create this bridge file in the project root. In local mode it records the `.handyman` workspace; in global mode it points to the external HANDYMAN workspace. The optional `models` map assigns a model per role (see [models.md](./models.md)) and the optional `tools` map assigns a tool set per role (see [tools.md](./tools.md)).

Use `"editor-default"` (or omit a key) to follow the model configured in the host editor. Omit the `tools` map (or a role key) to fall back to the Handyman per-role tool defaults.

The optional `discovery` block declares the skills and MCP servers the harness relies on (see [discovery.md](./discovery.md)). The optional `post_run` list declares shell commands that run automatically after a feature closes via `node dist/feature.js done` (for example regenerating `index.md` or refreshing a context graph); each step runs with exit 0, so a failing custom step only WARNs and never reverts a verified close.

- Local install: [../assets/harness.config.local.template.json](../assets/harness.config.local.template.json)
- Global install: [../assets/harness.config.global.template.json](../assets/harness.config.global.template.json)

## progress/current.md

Active session state, reset when a session closes. Lives in `HARNESS_WORKSPACE/progress/`.

Template: [../assets/progress-current.template.md](../assets/progress-current.template.md)

## progress/history.md

Append-only session history. Lives in `HARNESS_WORKSPACE/progress/`.

Template: [../assets/progress-history.template.md](../assets/progress-history.template.md)

## backlog/impl_<feature>.md

Backlog reports are created with the bundled generator `src/backlog.ts` (run `node dist/backlog.js`; `impl` / `review` / `explore`), which stamps the per-type frontmatter and never overwrites an existing entry; fill the body afterward. The templates below document the shape it produces.

Implementer report. Lives in `HARNESS_WORKSPACE/backlog/`.

Template: [../assets/backlog-impl.template.md](../assets/backlog-impl.template.md)

## backlog/review_<feature>.md

Reviewer verdict. Lives in `HARNESS_WORKSPACE/backlog/`. Use `status: approved` with `handyman/review/approved`, or `status: changes_requested` with `handyman/review/changes_requested`.

Template: [../assets/backlog-review.template.md](../assets/backlog-review.template.md)

## backlog/explore_<topic>.md

Read-only exploration findings. Lives in `HARNESS_WORKSPACE/backlog/`. Carries `topic`, `role: explorer`, `updated`, `tags`.

Template: [../assets/backlog-explore.template.md](../assets/backlog-explore.template.md)

## index.md (Obsidian MOC)

Optional but recommended at the root of the `HARNESS_WORKSPACE` to make the vault navigable from Obsidian. The starter MOC only links files that are generated inside `HARNESS_WORKSPACE`, so it works for both local and global installs. In both modes the repo-root bridge files `AGENTS.md` and `CHECKPOINTS.md` live outside the vault (`.handyman` in local mode, the external HANDYMAN workspace in global mode), so reference them as plain paths and do not add them as vault wikilinks unless you mirror them intentionally.

Template: [../assets/index.template.md](../assets/index.template.md)

## .gitignore (Harness)

Append to the project `.gitignore` so the local harness stays abstract from the repo: ignore the operational state under `.handyman/` and keep only the conceptual docs layer (`business`, `architecture`, `conventions`, `verification`) versioned. The same snippet also drops Obsidian's local cache (`.obsidian/`, `.trash/`). Global installs hold mutable state outside the repo, so only the cache lines apply there.

Template: [../assets/harness.gitignore.template](../assets/harness.gitignore.template)

## docs/business.md

Business domain and the use cases the project serves, filled from the business context provided at setup. Implementers and reviewers read it for the *why* behind a feature.

Template: [../assets/docs-business.template.md](../assets/docs-business.template.md)

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
