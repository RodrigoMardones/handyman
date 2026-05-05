# Obsidian Integration

Handyman's `HARNESS_WORKSPACE` is designed to double as an [Obsidian](https://obsidian.md) vault without duplicating files. The same markdown that agents read and write powers the visual workspace.

This document covers how to open the workspace as a vault, the conventions Handyman expects, and recommended plugins.

## Open The Workspace As A Vault

1. Pick the right folder:
   - Local mode: `PROJECT_ROOT`.
   - Global mode: `$HOME/HANDYMAN/<project_name>` (the resolved `HARNESS_WORKSPACE`).
2. In Obsidian choose **Open folder as vault** and point it to that folder.
3. Trust the vault when prompted.
4. Confirm the file tree shows `docs/`, `progress/`, `feature_list.json` and (optionally) `index.md`. In local mode it also shows repo-root bridge files such as `AGENTS.md` and `CHECKPOINTS.md`; in global mode those bridge files remain in `PROJECT_ROOT` outside the vault.

The harness keeps editing markdown the same way as before. Obsidian only adds visualization, search, backlinks, and tag navigation.

## Frontmatter Conventions

Handyman files carry minimal YAML frontmatter so Obsidian can index them by feature, status, role and tag.

| File | Required keys | Notes |
|------|---------------|-------|
| `progress/current.md` | `feature`, `status`, `role`, `updated`, `tags` | `status` is `idle` when the workspace has no active feature. |
| `progress/history.md` | `tags: [handyman/history]` | Append-only. |
| `progress/impl_<feature>.md` | `feature`, `status: implemented`, `role: implementer`, `updated`, `tags` | Written by the implementer. |
| `progress/review_<feature>.md` | `feature`, `status: approved` or `status: changes_requested`, `role: reviewer`, `updated`, `tags` | Written by the reviewer. |
| `progress/explore_<topic>.md` | `topic`, `role: explorer`, `updated`, `tags` | Written by read-only exploration subagents. |
| `index.md` | `tags: [handyman/moc]` | Optional MOC at the workspace root. |
| `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md` | `tags: [handyman/docs]` (optional) | Plain markdown otherwise. |

See [templates.md](./templates.md) for ready-to-copy frontmatter blocks.

## Tag Namespace

All Handyman tags live under `#handyman/...`:

- `#handyman/feature/pending`
- `#handyman/feature/in_progress`
- `#handyman/feature/done`
- `#handyman/feature/blocked`
- `#handyman/role/leader`
- `#handyman/role/implementer`
- `#handyman/role/reviewer`
- `#handyman/role/explorer`
- `#handyman/review/approved`
- `#handyman/review/changes_requested`
- `#handyman/blocked` (any blocker note)
- `#handyman/history`
- `#handyman/moc`
- `#handyman/docs`

Tags are additive: a review report typically carries `#handyman/role/reviewer` plus `#handyman/review/approved` plus `#handyman/feature/<name>`.

## Map Of Content (MOC)

The optional `index.md` at the root of the workspace acts as a hub. It lists files that exist inside `HARNESS_WORKSPACE`: `feature_list.json`, docs, progress files and useful tag queries. Local installs may add `AGENTS.md` and `CHECKPOINTS.md` wikilinks because the vault is `PROJECT_ROOT`; global installs should mention those bridge files as plain paths unless they are intentionally mirrored into the vault. See [templates.md](./templates.md#indexmd-obsidian-moc).

## Wikilinks vs Markdown Links

Handyman accepts both styles:

- Markdown: `[architecture](docs/architecture.md)`. Always works in any tool.
- Wikilinks: `[[docs/architecture]]`. Resolves natively in Obsidian.

Use wikilinks for cross-references inside the vault and markdown links for anything that is also read by non-Obsidian readers (CLI, GitHub, agent file viewers).
For non-markdown files inside the vault, include the extension or use a markdown link, such as `[feature_list.json](feature_list.json)`. Do not add wikilinks to files outside the opened vault.

## Recommended Plugins

Core (ship with Obsidian):

- **Outline** to navigate long progress and review reports.
- **Backlinks** to see who references the current feature or report.
- **Tags pane** to filter by `#handyman/feature/in_progress` etc.
- **File explorer** with the workspace as root.

Community (optional):

- **Dataview** to query frontmatter (e.g. list all features whose `status: in_progress`).
- **Templater** to insert the frontmatter blocks from [templates.md](./templates.md) automatically.

Example Dataview query for current work:

````markdown
```dataview
TABLE feature, role, updated FROM "progress" WHERE status = "in_progress"
```
````

## Version Control

Keep Obsidian's local cache out of git. Add to `.gitignore`:

```text
.obsidian/
.trash/
```

Frontmatter, tags, MOC and wikilinks are part of the harness contract. Commit them when `HARNESS_WORKSPACE` is versioned with the project; in global installs, keep them in the external workspace and back them up according to the team's policy.

## Migration From Plain Markdown

If you adopt Obsidian on an existing Handyman workspace:

1. Add frontmatter blocks to `progress/current.md` and historical reports as you touch them. No need to rewrite history.
2. Drop in an `index.md` at the workspace root.
3. Append `.obsidian/` and `.trash/` to `.gitignore`.
4. Run `./init.sh` to confirm the verifier still passes; presence of `.obsidian/` or `index.md` must not break it.
