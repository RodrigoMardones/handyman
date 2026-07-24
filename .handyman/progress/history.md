---
type: Session Log
tags: [handyman/history]
---

# Session History

Append-only. Do not edit earlier entries during normal work.

---

## 2026-07-18 - Feature 48: toolbox_next_intake_ask_ui
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 47: toolbox_next_timeline_search
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-17 - Feature 25: toolbox_draft_relay
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-06-17 - Feature 3: feature_cli
- **Agent:** leader -> implementer -> reviewer
- **Plan:** add `scripts/feature.py` for atomic feature_list.json transitions (add/start/block/done), reusing validate_harness resolution; verifier-gated `done`.
- **Changes:** new `scripts/feature.py`; `assets/schemas/feature_list.schema.json` (+`blocked_reason`); new `tests/test_feature.sh` (F1–F9) wired into `run_tests.sh`; `references/anatomy.md` (Optional Support Files row).
- **Verification:** closed by dogfooding `feature.py done feature_cli` (verifier exit 0); `bash tests/run_tests.sh` green (37 + 9 + 7 + 9); shellcheck clean.
- **Review:** APPROVED -> backlog/review_feature_cli.md
- **Closure:** done

---

## 2026-06-17 - Feature 2: json_schema
- **Agent:** leader -> implementer -> reviewer
- **Plan:** add draft-07 JSON Schemas for feature_list.json + harness.config.json, validate the templates in test_docs.py, wire jsonschema into CI.
- **Changes:** new `assets/schemas/feature_list.schema.json` + `assets/schemas/harness.config.schema.json`; `tests/test_docs.py` (`test_json_schemas`, graceful degrade); `.github/workflows/ci.yml` (pip install jsonschema); `references/anatomy.md` (Optional Support Files row).
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (37 + 9 + 7). Degraded no-jsonschema path verified green (32 passed + NOTE).
- **Review:** APPROVED -> backlog/review_json_schema.md
- **Closure:** done

---

## 2026-06-17 - Feature 1: validate_harness
- **Agent:** leader -> implementer -> reviewer
- **Plan:** create `scripts/validate_harness.py` (deterministic Analysis Checklist), wire it into `init.sh` as a blocking gate, add tests.
- **Changes:** new `scripts/validate_harness.py`; `init.sh` (`check_structure` + `run_phase "validate"`); `tests/test_init.sh` (T8–T11).
- **Verification:** `./init.sh` exits 0 (`validate: OK`); `bash tests/run_tests.sh` all suites green (26 + 9 + 7).
- **Review:** APPROVED -> backlog/review_validate_harness.md
- **Closure:** done

---

## YYYY-MM-DD - Feature N: feature_name
- **Agent:** leader -> implementer -> reviewer
- **Plan:** short plan
- **Changes:** files changed
- **Verification:** command and result
- **Review:** APPROVED or CHANGES_REQUESTED with report path
- **Closure:** final feature status

## 2026-06-18 - Feature 5: harness_versioning
- **Agent:** leader -> implementer -> reviewer
- **Plan:** Phase 0 of the harness-upgrade roadmap (`docs/analisis-actualizacion-harness.md`): stamp the skill version into the installed harness, widen the schema contract to accept it, and have `scaffold.sh` inject it on create. Source of truth = `SKILL.md` `metadata.version`.
- **Changes:** `assets/schemas/harness.config.schema.json` + `feature_list.schema.json` (optional `harness_version`, semver, kept out of `required`); `harness.config.local/global.template.json` + `feature_list.template.json` (`harness_version` sentinel `0.0.0`); `scripts/scaffold.sh` (`get_skill_version`/`stamp_version`/`copy_and_stamp`, stamps only newly created files); dogfood `harness.config.json` + `.handyman/feature_list.json` (= 1.8.4); `tests/test_docs.py` (`_skill_version` + `test_harness_version`) and `tests/test_init.sh` (T12 scaffold-stamp).
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (44 doc + 10 init + 7 update + 9 feature); shellcheck clean.
- **Review:** APPROVED -> backlog/review_harness_versioning.md
- **Closure:** done

## 2026-06-18 - Feature 6: upgrade_harness_check
- **Agent:** leader -> implementer -> reviewer
- **Plan:** Phase 1 of the harness-upgrade roadmap (`docs/analisis-actualizacion-harness.md`): read-only version-drift detection plus a non-blocking verifier advisory, building on Phase 0's `harness_version` seal.
- **Changes:** new `scripts/upgrade_harness.py` (`--check`: resolve workspace, read installed stamp vs `SKILL.md` current, print pending `MILESTONES`, exit 0/1/2; reuses `resolve_workspace`); `assets/init.template.sh` + repo `init.sh` (non-blocking `check_harness_version` advisory next to graphify); new `tests/test_upgrade.sh` (U1–U5) wired into `run_tests.sh`; `tests/test_docs.py` (`test_upgrade_advisory` static contract); `references/anatomy.md` (Optional Support Files row).
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (47 doc + 10 init + 7 update + 9 feature + 5 upgrade); shellcheck clean; functional NOTE confirmed on an unsealed scaffold.
- **Review:** APPROVED -> backlog/review_upgrade_harness_check.md
- **Closure:** done

## 2026-06-18 - Feature 7: harness_migrations
- **Agent:** leader -> implementer -> reviewer
- **Plan:** Phase 2 of the harness-upgrade roadmap (`docs/analisis-actualizacion-harness.md`): make `upgrade_harness.py` apply idempotent version-ordered migrations with backup + `--dry-run` and re-seal `harness_version`, never overwriting project-owned state.
- **Changes:** `scripts/upgrade_harness.py` (ordered `MIGRATIONS` registry replacing `MILESTONES`; `apply`/`ensure_managed_file`/`make_backup`/`reseal_version`/`_with_version`; `--dry-run`; no-`--check` now applies; `--check`+`--dry-run` rejected); `tests/test_upgrade.sh` (U5 repurposed + U6–U10: migrate, dry-run, backup, idempotent, project-owned preserved); `references/anatomy.md` (row updated).
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (47 doc + 10 init + 7 update + 9 feature + 10 upgrade); shellcheck clean; manual dry-run/apply demo on a 1.5.0 harness re-sealed to 1.8.4.
- **Review:** APPROVED -> backlog/review_harness_migrations.md
- **Closure:** done

## 2026-06-18 - Feature 8: upgrade_mode
- **Agent:** leader -> implementer -> reviewer
- **Plan:** Phase 3 (final) of the harness-upgrade roadmap (`docs/analisis-actualizacion-harness.md`): expose `upgrade` as a first-class mode in SKILL.md (sibling of `migrate-global`) within the token budget.
- **Changes:** `SKILL.md` — added `upgrade` to argument-hint, Quick Start, the Operating Modes table, and a Workflow **Upgrade.** entry; compensated the always-loaded word budget by condensing the supersedes line, the MIT paraphrase, the intro role-files clause, and the scope/bootstrap bullets (999 -> 996 words). `tests/test_upgrade.sh` already wired (Phases 1–2).
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (47 doc + 10 init + 7 update + 9 feature + 10 upgrade); token budgets PASS (SKILL 996/1000, AGENTS 249/250, description 472/500).
- **Review:** APPROVED -> backlog/review_upgrade_mode.md
- **Closure:** done — closes the harness-upgrade roadmap (Phases 0–3)

## 2026-06-24 - Feature 9: error_inconsistency_docs
- **Agent:** leader -> (implementer protocol) -> reviewer
- **Plan:** investigate why `/handyman bootstrap` generates the basic template inconsistently across models (local config appearing/not, feature_list format unvalidated, invented start/close date fields) and write an evidence-based research doc with an action plan scoped to `references/` and `assets/`; consult the `skill-creator` skill.
- **Changes:** new `docs/analisis-inconsistencia-bootstrap.md` (6 sections: symptoms, deterministic path, 6 root causes with repo evidence, action plan A–E, skill-creator best practices, summary). Docs-only; no product code touched. Inline-code for all paths (no markdown links) to keep `test_docs.py` T2 green.
- **Root causes documented:** scaffold.sh writes `harness.config.json` in both scopes vs. SKILL.md table listing it global-only; duplicated `config` block in feature_list.json; JSON schema (`additionalProperties:false`) only applied to templates in tests, never to the live feature_list.json by validate_harness.py; dates ubiquitous in `progress/` but absent from the feature contract; bootstrap prose enabling hand-creation.
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (47 doc + 10 init + 7 update + 9 feature + 10 upgrade); `all relative markdown links resolve` PASS.
- **Review:** APPROVED -> backlog/review_error_inconsistency_docs.md (reviewer ran the verifier and fact-checked two claims against scaffold.sh and validate_harness.py).
- **Closure:** done

## 2026-06-24 - Feature 10: live_schema_validation
- **Agent:** leader -> (implementer protocol) -> reviewer
- **Plan:** mitigation C of `docs/analisis-inconsistencia-bootstrap.md` — wire JSON-schema validation of the live `feature_list.json` into the verifier so out-of-contract keys (invented `start_date`/`close_date`) are rejected, with graceful degradation.
- **Changes:** `scripts/validate_harness.py` (`check_schema()` + `_feature_list_schema_path()`, wired into `validate()`; degrades to a NOTE when `jsonschema` or the schema is unavailable); `tests/test_init.sh` (T13 extra-field rejected, T14 contract-complete passes, both guarded by jsonschema); `references/anatomy.md` (Verification Contract check #5); `references/checklists.md` (Analysis Checklist item + Common Risks "Out-of-contract fields" row).
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (test_docs + test_init 12 + test_update 7 + test_feature 9 + test_upgrade 10); `all relative markdown links resolve` PASS.
- **Review:** APPROVED -> backlog/review_live_schema_validation.md
- **Closure:** done

## 2026-06-24 - Feature 11: feature_contract_no_dates
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** mitigation D — make the contract explicit that a feature carries no dates; chronology lives in `progress/`. Complements mitigation C (which enforces it).
- **Changes:** `references/anatomy.md` (Feature List Contract: enumerated valid feature keys + "no dates" statement tied to schema `additionalProperties:false`; new rule that a feature is a state machine, not a timeline, with chronology in `progress/current.md` `Start` and `progress/history.md` dates; pointer to `feature.py add`).
- **Verification:** `./init.sh` exits 0; suite green; SKILL 996/1000, AGENTS 249/250, links resolve.
- **Review:** APPROVED -> backlog/review_feature_contract_no_dates.md
- **Closure:** done

## 2026-06-24 - Feature 12: bootstrap_protocol
- **Agent:** leader -> (implementer protocol) -> reviewer
- **Plan:** mitigation A + skill_table_fix — make `scaffold.sh` the single deterministic `bootstrap` path and fix the `SKILL.md` Installation Scope table that contradicted it (config listed as global-only).
- **Changes:** `references/workflow.md` (new **Bootstrap Protocol** section: scaffold first/always, no hand-creation, config written in both scopes, features via `feature.py add`); `references/templates.md` (scaffold marked canonical + warning against manual layout); `SKILL.md` (Installation Scope table: `local` row now lists `harness.config.json`, `global` row = "Same files, absolute paths"; net +1 word -> 997/1000).
- **Verification:** `./init.sh` exits 0; suite green; SKILL 997/1000, AGENTS 249/250, links resolve.
- **Review:** APPROVED -> backlog/review_bootstrap_protocol.md (reviewer fact-checked the table claim against scaffold.sh).
- **Closure:** done

## 2026-06-24 - Feature 13: atomic_feature_intake
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** mitigation E — require `scripts/feature.py add` for feature intake so only contract keys are written, never hand-edited JSON.
- **Changes:** `references/workflow.md` (Leader Protocol step 4: turn the feature-request form into an entry via `feature.py add`; forbid hand-editing `feature_list.json`, the path through which out-of-contract keys creep in).
- **Verification:** `./init.sh` exits 0; suite green; links resolve.
- **Review:** APPROVED -> backlog/review_atomic_feature_intake.md
- **Closure:** done

## 2026-06-24 - Feature 14: config_source_of_truth
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** mitigation B (closes the action plan) — name `harness.config.json` the canonical config and the `feature_list.json` `config` block its optional mirror, with documented precedence; keep the mirror so `scaffold.sh` stamping/T12 keep working.
- **Changes:** `references/anatomy.md` (Required Core Files row: "Canonical bridge file … mirrors it"; Feature List Contract bullet: optional mirror + resolution precedence `harness.config.json` -> `config` -> `.handyman/` -> legacy root).
- **Verification:** `./init.sh` exits 0; suite green; links resolve.
- **Review:** APPROVED -> backlog/review_config_source_of_truth.md
- **Closure:** done — completes the C->D->A->E->B action plan from docs/analisis-inconsistencia-bootstrap.md

## 2026-06-25 - Feature 15: bussiness_context
- **Agent:** leader -> (implementer protocol) -> reviewer (Haiku)
- **Plan:** research-only feature (mirror of Feature 9): investigate and leave a work plan in `docs/` for making `bootstrap` ALWAYS interview the user, from chat, about the business layer so `docs/business.md` is filled with real context, not placeholders. Scope references `references/anatomy.md`; consult `skill-creator`.
- **Changes:** new `docs/analisis-business-context-bootstrap.md` (root causes with evidence: passive template "fill from context provided", no interview step in the Bootstrap Protocol, example models no-interview bootstrap, verifier can't tell a filled `business.md` from the raw template; action plan A–E focused on `references/`+`assets/` — turn the template into an interview script, add a mandatory interview step, declare the contract in `anatomy.md`, add an advisory `check_business_context()` placeholder gate, model the interview in the example; SKILL.md + live verifier wiring documented as separate features). Feature seeded via `feature.py add` + `start`; `progress/current.md` session log.
- **Verification:** `./init.sh` exits 0; all suites green; "all relative markdown links resolve" PASS (doc uses inline-code, no markdown links → T2 safe).
- **Review:** APPROVED -> backlog/review_bussiness_context.md (reviewer spot-checked 3 evidence claims against the real files)
- **Closure:** done

## 2026-06-25 - Feature 16: business_interview_contract
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** mitigation C from `docs/analisis-business-context-bootstrap.md` — declare in `references/anatomy.md` that `docs/business.md` is populated by a mandatory bootstrap interview, not inferred from code.
- **Changes:** `references/anatomy.md` (Required Core Files `docs/business.md` row: "populated through a mandatory user interview during bootstrap, not inferred from code"; Verification Contract new item 8: advisory `NOTE:` when `business.md` still matches the starter template).
- **Verification:** `./init.sh` exits 0; suite green; links + budgets unchanged (997/249/472).
- **Review:** APPROVED -> backlog/review_business_interview_contract.md
- **Closure:** done

## 2026-06-25 - Feature 17: business_intake_prompts
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** mitigation A — turn `assets/docs-business.template.md` from a passive "fill from context provided" template into an active interview script.
- **Changes:** `assets/docs-business.template.md` (top callout "interview the user — do not guess"; `**Interview prompts (ask the user):**` block under all 5 sections; original placeholder lines preserved as detection sentinels for D); `tests/test_docs.py` (`test_business_intake_prompts`, +2 checks).
- **Verification:** `./init.sh` exits 0; doc suite green; obsidian contract intact.
- **Review:** APPROVED -> backlog/review_business_intake_prompts.md
- **Closure:** done

## 2026-06-25 - Feature 18: bootstrap_interview_step
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** mitigation B — add a mandatory business-interview step to the Bootstrap Protocol, before filling the templates.
- **Changes:** `references/workflow.md` (Bootstrap Protocol new step 4: interview the user about the business layer before filling `docs/business.md`; do not infer the domain; bootstrap incomplete until real context is gathered; old steps 4-8 renumbered to 5-9).
- **Verification:** `./init.sh` exits 0; suite green; links resolve.
- **Review:** APPROVED -> backlog/review_bootstrap_interview_step.md
- **Closure:** done

## 2026-06-25 - Feature 19: business_context_advisory
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** mitigation D (closes the A-D plan) — add a non-blocking `check_business_context()` advisory to `assets/init.template.sh` that detects an unfilled `docs/business.md`.
- **Changes:** `assets/init.template.sh` (new advisory greps `$HARNESS_WORKSPACE/docs/business.md` for template sentinels and emits `NOTE:`, never touches `EXIT_CODE`; called with the other advisories); `tests/test_docs.py` (`test_business_context_advisory`, +4 checks). Live wiring into the repo's own `init.sh` + fixture + runtime test left as a separate feature.
- **Verification:** `./init.sh` exits 0; doc suite 53/53; functional sentinel check green (matches unfilled, silent on filled).
- **Review:** APPROVED -> backlog/review_business_context_advisory.md
- **Closure:** done — completes mitigations A-D of docs/analisis-business-context-bootstrap.md

## 2026-06-25 - Feature 20: deterministic_actions_per_layer
- **Agent:** leader -> (implementer protocol) -> reviewer (Haiku)
- **Plan:** research-only feature (mirror of Features 9 and 15): map, layer by layer, which harness artifact mutations have a deterministic script and which are done by hand, and leave a work plan in `docs/`. User-named cases: backlog entry, `progress/current.md`, `progress/history.md`; plus investigate other cases. Scope focuses proposals on `SKILL.md` and `references/`; consult `skill-creator`.
- **Changes:** new `docs/analisis-acciones-deterministas-por-capa.md`. Baseline (what is deterministic today): `scaffold.sh`, `feature.py` (add/start/block/done), `validate_harness.py`, `update_harness.py`, `upgrade_harness.py`. Gaps with evidence: (A) `backlog/` entries have no generator — `assets/backlog-impl.template.md`/`backlog-review.template.md` exist but `scaffold.sh` only `make_dir backlog` (L136) and never copies them (L141-144 copy only feature_list/current/history/business); no `backlog-explore.template.md` exists; per-type frontmatter contract (`anatomy.md` L22-24, `obsidian.md`) is hand-stamped and unvalidated. (B) `current.md` only gets a skeleton from `feature.py start`; Plan/Log/Next Step + `updated:` are hand-edited. (C) `history.md` gets a minimal 3-line append from `feature.py done`; the rich format is hand-enriched. Other cases: `migrate-global` (only op without a tool), `index.md` MOC regen, Obsidian frontmatter/tags consistency. Action plan A-E scoped to `SKILL.md`+`references/`, each splitting deterministic (script/template) from interactive, plus a budget-aware `SKILL.md` pointer (997/1000, margin 3); implementation scripts listed as follow-up features (section 7). `skill-creator` consulted: `scripts/` = deterministic/repetitive tasks, `assets/` = templates the scripts consume, output formats fixed by template/script over prose.
- **Verification:** `feature.py done` ran `./init.sh` to exit 0; `python3 tests/test_docs.py` 53/53; "all relative markdown links resolve" PASS (doc uses inline-code, no markdown links → T2 safe).
- **Review:** APPROVED -> backlog/review_deterministic_actions_per_layer.md (reviewer fact-checked the scaffold.sh/feature.py/anatomy claims against the real files and ran the verifier)
- **Closure:** done

## 2026-06-25 - Feature 21: backlog_generator
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan A of `docs/analisis-acciones-deterministas-por-capa.md` — give `backlog/` entries the deterministic generator they lacked.
- **Changes:** new `scripts/backlog.py` (`impl`/`review`/`explore`; reuses `resolve_workspace`; fills `<feature_name>`/`<topic>` + `YYYY-MM-DD` from `assets/backlog-<kind>.template.md`; never overwrites; `review --status changes_requested` flips status+tag+verdict; `_safe_slug` blocks path traversal); new `assets/backlog-explore.template.md` (the missing explorer template); new `tests/test_backlog.sh` (7 cases) wired into `tests/run_tests.sh`; `references/anatomy.md` (Optional Support Files row), `references/templates.md` (generator note + `backlog/explore_<topic>.md` section), `references/workflow.md` (Implementer/Reviewer/Explorer steps point to the generator). Dogfooded: this feature's own impl + review reports were scaffolded by the new tool.
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (53 doc + 12 init + 7 update + 9 feature + 7 backlog + 10 upgrade); shellcheck clean on the new suite.
- **Review:** APPROVED -> backlog/review_backlog_generator.md
- **Closure:** done

## 2026-06-25 - Feature 22: progress_helpers
- **Agent:** leader -> implementer -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan B of `docs/analisis-acciones-deterministas-por-capa.md` — give the progress docs deterministic helpers and a rich, script-emitted history form.
- **Changes:** `scripts/feature.py` new `log`/`next` subcommands (+ helpers `_current_text`/`_bump_updated`/`_section_bounds`/`_append_log`/`_set_next_step`): `log` appends a `## Log` bullet and bumps `updated:`, `next` replaces the `## Next Step` body; `cmd_done` now appends the rich headed entry (this very entry) instead of the 3-line minimal one. `tests/test_feature.sh` +F10/F11/F12 (9 -> 12). `references/workflow.md` Implementer step 3 + Closure step 3. SKILL.md pointer left as separate item (budget). Dogfooded: this session's current.md Log/Next Step written via the new subcommands.
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_progress_helpers.md
- **Closure:** done

## 2026-06-25 - Feature 23: index_regen
- **Agent:** leader -> implementer -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan D of `docs/analisis-acciones-deterministas-por-capa.md` — give the Obsidian `index.md` MOC a deterministic regenerator.
- **Changes:** new `scripts/index_md.py` (rebuilds `$WS/index.md` from live state: MOC frontmatter, `project_name` title, `## Features` by status, backlog reports as wikilinks, existing docs/progress; markdown links existence-gated to `feature_list.json`/`feature-request.md`; preserves a `## Notes` block); new `tests/test_index.sh` (5 cases) wired into `tests/run_tests.sh`; `references/obsidian.md` (Map Of Content) + `references/anatomy.md` (Optional Support Files row). Dogfooded by regenerating the repo's own `index.md`; verifier T2 link check stayed green over it.
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_index_regen.md
- **Closure:** done

## 2026-06-25 - Feature 24: frontmatter_advisory
- **Agent:** leader -> implementer -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan E of `docs/analisis-acciones-deterministas-por-capa.md` (closes the A,B,D,E set) — surface frontmatter/tag drift without blocking.
- **Changes:** `scripts/validate_harness.py` new non-blocking `check_frontmatter_advisory()` (+ `_frontmatter_keys()` + `FRONTMATTER_REQUIRED`): scans `progress/current.md` and `backlog/impl_*/review_*/explore_*` for required keys + the `#handyman/` tag namespace, prints `NOTE:`, wired in `main()` after `validate()`, never touches the gap list (exit code unchanged), skips empty files. `tests/test_init.sh` +T15 (incomplete -> NOTE, exit 0) +T16 (well-formed -> silent), 12 -> 14. `references/anatomy.md` Verification Contract item 8 + `references/checklists.md` (Analysis item + Common Risks row). Verified 0 NOTEs on the repo's own harness; pairs with Feature A (backlog.py prevents what this detects).
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_frontmatter_advisory.md
- **Closure:** done — completes plan items A, B, D, E of docs/analisis-acciones-deterministas-por-capa.md (C migrate-global intentionally skipped)

## 2026-06-25 - Feature 25: feature_request_md
- **Agent:** leader -> (implementer protocol) -> reviewer
- **Plan:** research-only feature (mirror of ids 9/15/20): investigate why `feature-request.md` is today a verbatim copy of a generic template and not an experience-based recommendation, and write an evidence-based research doc + action plan in `docs/` that proposes the concrete recommended (editable) format. Scope of the plan: `SKILL.md`, `references/`, `assets/`. Consult the `skill-creator` skill.
- **Changes:** new `docs/analisis-feature-request-md.md` (8 sections: objective, current "copy" path with repo evidence, evidence of real request shapes, 7 root causes with evidence, the concrete recommended format with Núcleo/Opcional + two per-archetype examples grounded in the repo, action plan A–E, skill-creator best practices, summary). Docs-only; no product code touched. Inline-code + fenced blocks for all paths/examples (no markdown links) to keep `test_docs.py` T2 green; `SKILL.md`/`AGENTS.template.md` untouched so token budgets stay intact.
- **Key findings:** real requests split into two archetypes (research = ids 9/15/20/25; implementation = the rest); a core set of fields is always filled vs. an optional set rarely used (Model/schema changes, Functional check, Post-feature, sub-agents, Questions); empirical invariant — the green gate is the last Acceptance bullet in all 24 closed features. Root causes: single generic shape, foreign worked example (`backfill_event_attendees`), flat field list, gate-as-last-acceptance and form→`feature.py add` mapping left implicit, verbatim copy at bootstrap, and the canonical example not modeling the form.
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (53 doc + 14 init + 7 update + 12 feature + 7 backlog + 5 index + 10 upgrade = 108, 0 failed); `all relative markdown links resolve` PASS.
- **Review:** APPROVED -> backlog/review_feature_request_md.md (reviewer ran the verifier and fact-checked 5 claims: scaffold.sh L149 verbatim copy, single `backfill_event_attendees` worked example, examples.md Example 2 not modeling the form, the archetype split vs feature_list.json, and that no follow-up features were auto-added — all TRUE).
- **Closure:** done. Follow-up implementation features (A–E + the SKILL.md pointer and a test_docs assertion) documented in the doc's "Fuera de scope" but NOT added, mirroring ids 9/15/20.

## 2026-06-25 - Feature 26: feature_request_core_optional
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan A of `docs/analisis-feature-request-md.md` — restructure the `feature-request` intake form into CORE + OPTIONAL with a recommendation header.
- **Changes:** `assets/feature-request.template.md` — rewrote `## Template (copy and fill)` into a `CORE (fill always)` section (Feature, Context, Scope>Includes, Acceptance with the green-gate bullet last, Verification, Tools>skills) and an `OPTIONAL (fill only if it applies)` section (Excludes, Model/schema changes, Functional check, Considerations, Post-feature, sub-agents, Questions), preceded by a `How to write a good request` header (4 behavioural bullets). English, matching `assets/`; worked example + table left for Plan B / unchanged; the two format-contract lines deferred to Plan C.
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (53 doc + 14 init + 7 update + 12 feature + 7 backlog + 5 index + 10 upgrade); `all relative markdown links resolve` PASS.
- **Review:** APPROVED -> backlog/review_feature_request_core_optional.md
- **Closure:** done

## 2026-06-25 - Feature 27: feature_request_archetype_examples
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan B of `docs/analisis-feature-request-md.md` — replace the generic worked example with two repo-grounded archetype examples.
- **Changes:** `assets/feature-request.template.md` — replaced the single `## Worked example` (`backfill_event_attendees`, a DB-app backfill foreign to this skill repo) with a `## Worked examples` section holding a Research request (mirror of feature `deterministic_actions_per_layer`) and an Implementation request (mirror of feature `backlog_generator`), both in CORE/OPTIONAL shape and ending Acceptance with the green gate.
- **Note:** an external editor revert had dropped Plan A's CORE/OPTIONAL restructure from the file; it was re-applied and confirmed by reading the file back, so the template now carries both A's structure and B's examples. Added a memory gotcha: re-read tracked files after editing to confirm persistence before closing.
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (53+14+7+12+7+5+10); `all relative markdown links resolve` PASS; `backfill` grep count 0.
- **Review:** APPROVED -> backlog/review_feature_request_archetype_examples.md
- **Closure:** done

## 2026-06-25 - Feature 28: feature_request_format_contracts
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan C of `docs/analisis-feature-request-md.md` — make the two format contracts explicit.
- **Changes:** `assets/feature-request.template.md` — added two header contract lines: the green gate is ALWAYS the last Acceptance bullet, and only `name`/`title`/`description`/`acceptance` become the `feature_list.json` entry (via `feature.py add`), the rest being process guidance. `references/templates.md` — mirrored both contracts in the `## feature-request.md` section.
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (53+14+7+12+7+5+10); `all relative markdown links resolve` PASS.
- **Review:** APPROVED -> backlog/review_feature_request_format_contracts.md
- **Closure:** done

## 2026-06-25 - Feature 29: feature_request_templates_doc
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan E of `docs/analisis-feature-request-md.md` — describe the Core/Optional split and the two archetypes in `references/templates.md` (heavy guidance in references/, SKILL.md keeps only its pointer).
- **Changes:** `references/templates.md` — extended the `## feature-request.md` section with a paragraph describing the CORE (filled every time) vs OPTIONAL (only if it applies) split and the two request archetypes (Research leaves a plan in `docs/`; Implementation changes code + tests), each mapped to a worked example. `SKILL.md` untouched (git diff empty; budget 997/1000).
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (53+14+7+12+7+5+10); `all relative markdown links resolve` + `SKILL.md stays within 1000 words (997)` PASS.
- **Review:** APPROVED -> backlog/review_feature_request_templates_doc.md
- **Closure:** done

## 2026-06-25 - Feature 30: feature_request_intake_example
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan D of `docs/analisis-feature-request-md.md` — model the form-first intake in the canonical example.
- **Changes:** `references/examples.md` — added a `Form-first intake (optional)` turn to `Example 2: Run One Feature` showing the user filling `feature-request.md` and the leader converting it with `scripts/feature.py add` (contract keys only), seeding the `cli_recent` feature the example then runs. Closes cause 4.7 (the canonical example never modeled the form).
- **Verification:** `./init.sh` exits 0; `bash tests/run_tests.sh` green (53+14+7+12+7+5+10); `all relative markdown links resolve` PASS.
- **Review:** APPROVED -> backlog/review_feature_request_intake_example.md
- **Closure:** done — completes Plan A–E of `docs/analisis-feature-request-md.md`.

## 2026-06-25 - Feature 31: security_snyk_w011
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Fix Snyk agent-scan **W011** (third-party content exposure / indirect prompt injection) on the published skill body, using the `snyk-agent-scan-compliance` skill. Root cause: the P1-P4 behavioral mitigation *described* ingestion with the agent as grammatical subject ("agents continuously ingest text they did not author: backlog/, progress/, docs/"), which is exactly the construction the scanner's W011 heuristic fires on. Fix = passive (resource-as-subject) restructuring with zero information loss.
- **Changes:** `handyman/references/security.md` (intro, scope sentence, highest-risk chain, Threat Model table) and `handyman/references/anatomy.md` (Untrusted Content) rewritten agent-as-subject -> resource-as-subject, preserving golden rule, per-role operating rules, checklist, threat model and the `never as instructions` / `never instructions to the agent` anchors. New `tests/test_docs.py::test_w011_passive_framing` (T6) scans `SKILL.md`+`references/*.md`+`assets/*.md` for the agent-as-ingestor regex (zero matches) and asserts the mitigation anchors survive. Investigation in `docs/analisis-snyk-w011.md`. `SKILL.md` untouched (already passive + budget 997/1000).
- **Verification:** `./init.sh` exit 0; `bash tests/run_tests.sh` green (docs 90 [+T6], init 14, update 7, feature 12, backlog 7, index 5, upgrade 10). Gap: `SNYK_TOKEN` empty -> live scanner not runnable (`uvx snyk-agent-scan@latest` available); fix guided by the W011 pattern catalog and locked by the deterministic T6 guard.
- **Review:** APPROVED -> backlog/review_security_snyk_w011.md
- **Closure:** done — re-verify with `SNYK_TOKEN=<token> uvx snyk-agent-scan@latest --skills handyman/` when a token is available.

## 2026-06-26 - Feature 32: tool_discovery
- **Agent:** leader -> (implementer protocol) -> reviewer (Haiku subagent, fact-checked)
- **Plan:** Research-only feature (mirror of ids 9/15/20/25/31): investigate how skills and MCP servers are discovered today and how to deepen their use in handyman — to (1) declare them in `harness.config.json`, (2) query them deterministically, and (3) document it for a new delivery. Consult `skill-creator` and `mcp-builder` as literature; leave a research doc in `docs/`.
- **Changes:** new `docs/analisis-tool-discovery.md` (9 sections). Core finding: discovery is **semantic** today — skills trigger by their `description` (progressive disclosure, `skill-creator`), MCP tools surface via a deferred list + semantic `tool_search` (`mcp-builder` naming/discoverability) — and handyman never added a deterministic layer: `harness.config.json` `tools` = capability groups (not skills/MCPs), `feature-request` `Tools>skills` is prose that `feature.py add` does not persist, no `.mcp.json` exists, no script queries skills/MCPs, `references/tools.md` is silent on them. Proposed design for the 3 goals: optional `discovery` block in `harness.config.json` (+ schema, mirroring `harness_version` since `additionalProperties:false`); `scripts/tools_discovery.py` `list`/`find`/`check` for reproducible discovery + existence verification; `references/discovery.md` documenting the platform mechanism and the deterministic-vs-semantic boundary. Plan A-E + suggested follow-up features (NOT added). Baseline fix: regenerated stale `.handyman/index.md` (dead existence-gated link to a missing `feature-request.md`) with `index_md.py` to restore the green gate. Doc uses inline-code + fences, no markdown links (T2 safe). `feature.py add/start/log/next` + `backlog.py impl/review` drove the state.
- **Verification:** `./init.sh` exit 0; `bash tests/run_tests.sh` green (docs 90, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10). Reviewer fact-checked all 5 claims TRUE (tools=capability groups, feature-request prose-only, no MCP config, schema `additionalProperties:false`, no script discovery).
- **Review:** APPROVED -> backlog/review_tool_discovery.md
- **Closure:** done — research-only; follow-up implementation features (discovery_config_schema, tools_discovery_script, tools_discovery_advisory, discovery_reference_doc, feature_request_tools_link) documented in the doc, not added to feature_list.json.

## 2026-06-26 - Feature 33: discovery_config_schema
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan A of `docs/analisis-tool-discovery.md` — add an optional global `discovery` block (`{skills:[], mcp:[]}`) to the config contract, mirror of feature 5 `harness_versioning`.
- **Changes:** `handyman/assets/schemas/harness.config.schema.json` (+`discovery` property + definition: skills/mcp arrays of unique non-empty strings, `additionalProperties:false`, OUT of `required`), `handyman/assets/schemas/feature_list.schema.json` (`discovery` in `config` props + top-level definition), `handyman/assets/harness.config.local/global.template.json` + `handyman/assets/feature_list.template.json` (sentinel `{skills:[],mcp:[]}`). `tests/test_docs.py` new `test_discovery_config()`. Scaffold untouched (copies templates verbatim). Schema-first because both config objects are `additionalProperties:false`.
- **Verification:** `./init.sh` exit 0; `bash tests/run_tests.sh` green (docs 99 [+9], init 14, update 7, feature 12, backlog 7, index 5, upgrade 10). `test_discovery_config` proves an unknown key inside `discovery` is rejected.
- **Review:** APPROVED -> backlog/review_discovery_config_schema.md
- **Closure:** done — Plan A of 5 (tool_discovery roadmap).

## 2026-06-26 - Feature 34: tools_discovery_script
- **Agent:** leader -> (implementer protocol) -> reviewer (Haiku subagent, functional checks)
- **Plan:** Plan B of `docs/analisis-tool-discovery.md` — `scripts/tools_discovery.py` as the deterministic counterpart of the platform's semantic discovery.
- **Changes:** `handyman/scripts/tools_discovery.py` (new): `list` (glob `<root>/*/SKILL.md`, parse name+description, `--json`), `find KEYWORD` (deterministic case-insensitive substring match), `check` (read `discovery` block via harness.config.json -> feature_list config precedence; verify declared skills exist on disk, NOTE undeclared-installed, validate MCP by shape only — no manifest). Reuses `resolve_workspace`; skill roots from `--skills-dir`/`$HANDYMAN_SKILL_ROOTS`/defaults with graceful degradation; YAML block-scalar safe. `tests/test_tools_discovery.sh` (6 cases) wired in `tests/run_tests.sh`.
- **Verification:** `./init.sh` exit 0; Tools-discovery suite 6/6; `bash tests/run_tests.sh` green (docs 99, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10, tools-discovery 6); `shellcheck -S warning` clean. Reviewer ran live functional checks (find mcp -> only mcp-builder; check missing -> exit 1 names gamma; check all-present/no-block -> exit 0).
- **Review:** APPROVED -> backlog/review_tools_discovery_script.md
- **Closure:** done — Plan B of 5 (tool_discovery roadmap).

## 2026-06-26 - Feature 35: tools_discovery_advisory
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan C of `docs/analisis-tool-discovery.md` — a non-blocking advisory nudging the operator to declare the harness's skills/MCPs.
- **Changes:** `handyman/assets/init.template.sh` new `check_tools_discovery()` (jq-guarded; NOTE when `discovery.skills` and `discovery.mcp` are both empty/absent; never touches `EXIT_CODE`), called alongside the other advisories. `tests/test_docs.py` new `test_tools_discovery_advisory()` (4 regex-anchored checks). Self-contained shell because support scripts are not scaffolded to target repos; mirrors check_business_context. Repo's own init.sh is custom/gitignored, so verified statically + functionally (temp config).
- **Verification:** `./init.sh` exit 0; `bash -n` syntax ok; functional (empty discovery -> NOTE, declared -> silent); `bash tests/run_tests.sh` green (docs 103, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10, tools-discovery 6).
- **Review:** APPROVED -> backlog/review_tools_discovery_advisory.md
- **Closure:** done — Plan C of 5 (tool_discovery roadmap).

## 2026-06-26 - Feature 36: discovery_reference_doc
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan D of `docs/analisis-tool-discovery.md` — delivery documentation for skill/MCP discovery.
- **Changes:** `handyman/references/discovery.md` (new): platform mechanism (skills via description/progressive disclosure, MCP via deferred list + `tool_search`), the `discovery` config block, `tools_discovery.py` list/find/check, the `check_tools_discovery()` advisory, and the deterministic-vs-semantic boundary + limitations. `handyman/references/README.md` catalog entry after tools.md. `tests/test_docs.py` new `test_discovery_reference()`. Links only to existing siblings (`./tools.md`/`./workflow.md`/`./security.md`); inline-code/fences for paths. SKILL.md untouched (budget 997/1000).
- **Verification:** `./init.sh` exit 0; `bash tests/run_tests.sh` green (docs 110, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10, tools-discovery 6); T2 links resolve + T6 passive framing on the new doc.
- **Review:** APPROVED -> backlog/review_discovery_reference_doc.md
- **Closure:** done — Plan D of 5 (tool_discovery roadmap).

## 2026-06-26 - Feature 37: feature_request_tools_link
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Plan E of `docs/analisis-tool-discovery.md` — tie the feature-request `Tools > skills` field to the declared `discovery` set (closes the A-E roadmap).
- **Changes:** `handyman/references/templates.md` (`## feature-request.md`: Tools>skills lists from `discovery.skills`, verifiable with `tools_discovery.py check`, links `./discovery.md`), `handyman/references/examples.md` (form-first intake notes the same), `handyman/assets/feature-request.template.md` (one header line tying Tools>skills to `discovery.skills` + `tools_discovery.py check`). `tests/test_docs.py` new `test_feature_request_tools_link()`. SKILL.md untouched (git diff empty, budget 997/1000). Fixed a self-inflicted T2 break: an md link in the impl report (`.handyman/backlog/` IS scanned) -> switched to inline-code.
- **Verification:** `./init.sh` exit 0; `bash tests/run_tests.sh` green (docs 114, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10, tools-discovery 6); T2 links resolve, T6 passive framing holds.
- **Review:** APPROVED -> backlog/review_feature_request_tools_link.md
- **Closure:** done — completes Plan A-E of `docs/analisis-tool-discovery.md`.

## 2026-06-26 - Feature 38: new_test_evals_revision
- **Agent:** leader -> (implementer protocol) -> reviewer (Haiku subagent, fact-checks a-e)
- **Plan:** Research-only feature (mirror of ids 9/15/20/25/31/32) — investigate, via the `skill-creator` and `mcp-builder` literature, the best way to improve the tests associated with model evaluations. Deliverable is a `docs/analisis-*.md`; no product code; `SKILL.md` untouched.
- **Changes:** `docs/analisis-tests-evaluaciones-modelo.md` (new, 352 lines, 0 markdown links). Core finding (evidence): `handyman/evals/trigger-eval.json` holds 20 well-formed queries (10 true / 10 false, EN+ES, near-miss negatives) but a repo-wide grep for `trigger-eval`/`should_trigger`/`eval` returns ZERO hits in `tests/`, `run_tests.sh` and `.github/` — the eval is declared a gate (memory + `docs/analisis-iteraciones.md` C4) but never cabled as one; the only `description` guard is `test_token_budgets` (size <=500 chars, today 472), not a triggering/accuracy gate. Literature: `skill-creator` separates trigger/description evals (`[{query,should_trigger}]`, `run_eval.py`/`run_loop.py`: each query 3x for variance, 60/40 train/held-out split selected by test score vs overfit) from output/task evals (`evals.json` + `aggregate_benchmark.py`); `mcp-builder/reference/evaluation.md` adds stable, string-comparison-verifiable, solve-yourself QA pairs. Thesis = the determinism boundary: split "evaluate the model" into a deterministic eval CONTRACT (parse, keys/types, class coverage, no duplicates, runner shape — CI-safe) and a stochastic trigger MEASUREMENT (model+CLI+auth, varies per run) that degrades with a NOTE and never gates, the same graceful degradation `validate_harness.py` uses for `jsonschema`. Plan A-E (foco `tests/`+`handyman/scripts/`+`references/`+`assets/schemas/`+`.github/`): A schema + structural test (9th suite), B `scripts/evals.py validate/measure`, C `check_evals()` advisory, D `references/evals.md`, E description-gate workflow step. Suggested features documented, NOT added.
- **Verification:** `./init.sh` exit 0; suite green (docs 114, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10, tools-discovery 6); T2 `grep -c '](' = 0` on the doc and the impl/review reports. Dogfooded: `feature.py add(38)` -> `start` -> doc + `current.md` Plan/log/next -> `backlog.py impl` -> reviewer subagent (`agentName=reviewer`, model Haiku) APPROVED with all 5 fact-checks TRUE -> `feature.py done` (verifier exit 0) -> history enriched.
- **Review:** APPROVED -> backlog/review_new_test_evals_revision.md
- **Closure:** done — research-only; the eval data already exists and is good, what is missing is the harness (deterministic contract + stochastic measurement). Pre-existing pending: id 4 `secrets_advisory`.

## 2026-06-27 - Feature 39: new_test_evals_aplication
- **Agent:** leader -> (implementer protocol) -> reviewer (Haiku subagent, fact-checks a-d)
- **Plan:** Apply plan A-E from `docs/analisis-tests-evaluaciones-modelo.md` (the id-38 research): turn the model-evaluation "test" from loose data into a deterministic CONTRACT plus an opt-in stochastic RUNNER, keeping the determinism boundary so neither half blocks the other. Mirrors feats 33/34/35/36/37 and 10.
- **Changes:** A — `handyman/assets/schemas/trigger_eval.schema.json` (new, draft-07, array of `{query,should_trigger}`, `additionalProperties:false`, `uniqueItems`) + `test_eval_set()` in `tests/test_docs.py` (schema valid + shipped `handyman/evals/trigger-eval.json` parses, both classes >=5, no dup queries, schema-conforms; NOTE-degrades without jsonschema). B — `handyman/scripts/evals.py` (new): `validate` (offline contract, reuses the schema, degrades with NOTE) and `measure` (online; `--runner` `--runs N` `--threshold`; per-query trigger rate -> confusion matrix + `mean ± stddev`; NOTE + exit 0 when no runner/model; shell-free `shlex.split`, no `shell=True`); `tests/test_evals.sh` (new, 7 cases) wired as the 9th suite in `tests/run_tests.sh`. C — `check_evals()` advisory in `handyman/assets/init.template.sh` (silent without a set; NOTE on empty set or `SKILL.md` newer than `evals/.last-measured`; never touches `EXIT_CODE`) + `test_evals_advisory()`. D — `handyman/references/evals.md` (new: two eval classes, deterministic-vs-stochastic boundary, variance, held-out split, graceful degradation, advisory, complements `test_token_budgets`) + `references/README.md` catalog bullet + `test_evals_reference()`. E — `## Description Trigger Gate` in `handyman/references/workflow.md`, `evals.py validate`/`measure` modeled in `references/examples.md`, and a Verification (extension) bullet in `handyman/assets/feature-request.template.md` + `test_description_gate()`. Literature: `skill-creator` (variance via repeated runs, held-out split anti-overfit) and `mcp-builder` (stable, string-verifiable evals). `SKILL.md` (997/1000) and `AGENTS.template.md` (249/250) untouched; `.github` excluded per scope.
- **Verification:** `./init.sh` exit 0; suite green — docs 142, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10, tools-discovery 6, **evals 7 (NEW 9th suite)**; T2 links resolve + T6 passive framing clean on `evals.md`; `test_evals.sh` shellcheck-clean; `evals.py measure` confusion matrix verified with a fixture runner (TP/FP/TN/FN). Dogfooded: `feature.py add(39)` -> `start` -> implement A-E + tests -> verifier green -> `backlog.py impl` -> reviewer subagent (`agentName=reviewer`, model Haiku) APPROVED with fact-checks (validate pass/fail, measure NOTE, advisory has no `EXIT_CODE=`, shellcheck) -> `feature.py done` (verifier exit 0) -> history enriched.
- **Review:** APPROVED -> backlog/review_new_test_evals_aplication.md
- **Closure:** done — completes plan A-E of `docs/analisis-tests-evaluaciones-modelo.md`; the eval data now has the harness it lacked (deterministic contract gated, stochastic measurement advisory). Pre-existing pending: id 4 `secrets_advisory`.

## 2026-06-27 - Feature 40: mcp_validation_vscode
- **Agent:** leader -> implementer -> reviewer (reviewer subagent, Haiku)
- **Plan:** Apply the `request.template.md` request: `tools_discovery.py` had no validation of installed/configured MCP servers (the VS Code manifest is `.vscode/mcp.json`) and scanned only global skill roots. Add MCP validation against an extensible host-manifest registry (declare vscode, open for new hosts) and make skill-root resolution check project-local roots before global ("always local, then global"). One request = one feature.
- **Changes:** `handyman/scripts/tools_discovery.py` — new `MCP_CONFIG_SOURCES = (("vscode", ".vscode/mcp.json", "servers"),)` registry (add a row to support a new host, no logic change) + `discover_mcp_servers(root)` (scans sources, tolerates dict/list `servers`, returns `name -> host`) + `mcp_sources_present(root)`; `cmd_check` now reports each declared MCP as `ok (configured in <host>)` / non-gating `NOTE not configured in <files> (host-provided?)` / `ok (declared, not verifiable on disk)` when no manifest, plus a `NOTE: configured but not declared` for workspace servers — MCP never gates (only a missing skill returns exit 1), matching the host-defined limitation. Skill roots: `DEFAULT_LOCAL_SKILL_DIRS` (`.agents/skills`, `.claude/skills`, `.github/skills` under the project root) scanned BEFORE `DEFAULT_GLOBAL_SKILL_ROOTS`/`$HANDYMAN_SKILL_ROOTS`, so first-occurrence-wins in `discover_skills` makes a local skill shadow a same-named global one; `--skills-dir` stays a verbatim hermetic override. `cmd_list`/`cmd_find`/`cmd_check` all pass the root into `skill_roots`. `tests/test_tools_discovery.sh` +T7 (local shadows global), +T8 (declared MCP configured in `.vscode/mcp.json` -> ok), +T9 (declared MCP absent -> non-gating NOTE + configured-but-undeclared NOTE); header comment updated. `handyman/references/discovery.md` documents the local-first order and the extensible vscode MCP source. `SKILL.md` untouched (budget 997/1000); `.github/` not touched (out of scope).
- **Gotcha caught by tests:** the first cut updated `cmd_list`/`cmd_find` but missed the `skill_roots(args.skills_dir)` call inside `cmd_check`, so a fixture's declared local skill resolved against the repo cwd instead of the fixture root (`local_only: MISSING`); fixed by passing `root`. The macOS `/var`->`/private/var` symlink with `Path.resolve()` was a red herring (both resolve fine).
- **Verification:** `./init.sh` exit 0; suite green — docs 142 (all markdown links resolve; W011 passive framing clean), init 14, update 7, feature 12, backlog 7, index 5, upgrade 10, **tools-discovery 9 (+3)**, evals 7; shellcheck clean. Dogfood `tools_discovery.py --root . check`: the 5 declared skills `ok`, the declared MCPs (`nx`/`gitkraken`/`github-pull-request`) NOTE'd as not in `.vscode/mcp.json` (extension-provided, non-gating), and the workspace's `mcparmory-github` NOTE'd as configured-but-undeclared, exit 0. Flow: `feature.py add(40)` -> `start` -> implement -> verifier -> `backlog.py impl` -> reviewer subagent (`agentName=reviewer`, Haiku) APPROVED (fact-checked all 5 acceptance criteria + ran the verifier) -> `feature.py done` (verifier exit 0) -> history enriched.
- **Review:** APPROVED -> backlog/review_mcp_validation_vscode.md
- **Closure:** done — applies `request.template.md`. Pre-existing pending: id 4 `secrets_advisory`.

## 2026-07-01 - Feature 41: pre_and_post_process_research
- **Agent:** leader -> (implementer protocol) -> reviewer (CHECKPOINTS pass)
- **Plan:** Research-only feature (mirror of ids 9/15/20/25/31/32/38) — investigate how to consolidate the five pre-run checks the user lists (harness format, feature_list format, update harness→agents, update skills, update mcps) into a documented workflow step that ensures stability between harness versions, and how to add custom post-run feature processes. Deliverable is a `docs/analisis-*.md`; `SKILL.md` untouched. Literature: `handyman`, `skill-creator`, `ponytail`.
- **Changes:** `docs/analisis-pre-post-process.md` (new, 9 sections, 0 markdown links — inline-code for all file/script refs to keep T2 green). Core finding (the "central paradox", evidence-grounded): all five requested checks ALREADY exist as deterministic scripts (`validate_harness.py` format+feature_list, `upgrade_harness.py --check` version drift, `update_harness.py --list` config↔agents sync, `tools_discovery.py check` skills+MCPs, `evals.py`), but they are FRAGMENTED across three severity tiers (some blocking phases in `init.sh`, some non-blocking advisories, some CLI-only) and NONE is consolidated into a pre-run stability gate nor documented as a workflow step. Live-drift evidence: `upgrade_harness.py --check` shows three versions coexisting in this harness (`1.8.4` in feature_list config, `1.11.11` in root config, `1.13.13` in the skill) — proving the inter-version instability is real, not theoretical. Also documented that the live `init.sh` does NOT invoke `check_tools_discovery`/`check_evals`/`check_business_context` that already exist in the template (cause 3.1). Thesis (literature): `ponytail` — the lazy/correct fix is to ORCHESTRATE existing scripts, not invent checks; `skill-creator` — orchestration is a script (deterministic), heavy guidance lives in references/, SKILL.md stays a pointer; `handyman` — respect the blocking/advisory split and managed-vs-project-owned. Proposed design: separate a *stability gate* (pre-run, read-only, orchestrated by a thin `preflight.py` reusing 100% of existing scripts) from the *quality gate* (`init.sh`, semantics untouched), plus an opt-in *post-run hook* (a `post_run` list in `harness.config.json` executed by `feature.py done`, always exit 0 — a custom step that fails warns, never reverts a verified close). Plan A–F (preflight orchestrator; advisory; post-run hooks; workflow/checklists docs; SKILL.md pointer; verifier advisory consistency) with 6 suggested features documented but NOT added (roadmap mirror).
- **Verification:** `./init.sh` exit 0; suite green (docs 142 — all markdown links resolve; the new doc uses inline-code so T2 stays green; lint/build/test + shellcheck clean). Dogfood: `feature.py add(41)` -> `start` -> doc -> verifier green -> `backlog.py impl`/`review` -> reviewer CHECKPOINTS pass -> `feature.py done` (verifier exit 0) -> history enriched.
- **Review:** APPROVED -> backlog/review_pre_and_post_process_research.md
- **Closure:** done — research-only; the five checks exist, what is missing is consolidation/orchestration + a post-run extensibility hook. Pre-existing pending: id 4 `secrets_advisory`.

## 2026-07-01 - Feature 42: preflight_orchestrator
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_preflight_orchestrator.md
- **Closure:** done

## 2026-07-01 - Feature 43: preflight_advisory
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_preflight_advisory.md
- **Closure:** done

## 2026-07-01 - Feature 44: post_run_hooks
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_post_run_hooks.md
- **Closure:** done

## 2026-07-01 - Feature 45: workflow_stability_steps
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workflow_stability_steps.md
- **Closure:** done

## 2026-07-01 - Feature 46: skill_preflight_pointer
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_skill_preflight_pointer.md
- **Closure:** done

## 2026-07-01 - Feature 47: verifier_advisory_consistency
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_verifier_advisory_consistency.md
- **Closure:** done

## 2026-07-01 - Feature 48: tool_discovery_reference_investigation
- **Agent:** leader -> implementer -> reviewer
- **Plan:** Research-only (mirror of 9/15/20/25/31/32/38). Consult skills handyman/skill-creator/mcp-builder/ponytail; read the discovery machinery; answer two topics (extend discovery to consultation agents; add path/reference for skills/MCP/agents); write a docs/ investigation + a work proposal (plan A-E).
- **Changes:** New `docs/analisis-tool-discovery-referencias.md` (369 lines, 0 raw md-links), sibling of `analisis-tool-discovery.md`. Findings: `discovery` block = skills+mcp only (schema `additionalProperties:false`); `discover_skills` already captures `path` (emitted by `list --json`, hidden from `check`); agents live in `PLATFORM_ROLE_DIRS` (.github/agents/.claude/agents) known to validate_harness but not to discovery; `.agents/` absent at root; `explorer` declared without role file. Conclusion: Tema 1 reuses `_parse_frontmatter`+`PLATFORM_ROLE_DIRS`; Tema 2 = declare names (portable) / resolve+deliver path at query time (machine-specific), do NOT persist abs paths. Plan A-E + 5 suggested features. SKILL.md/AGENTS untouched.
- **Verification:** verifier exit 0 (9 suites: docs 17, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10, tools-discovery 9, evals 7)
- **Review:** APPROVED -> backlog/review_tool_discovery_reference_investigation.md (5/5 fact-checks TRUE)
- **Closure:** done

## 2026-07-01 - Feature 49: discovery_agents_schema
- **Agent:** leader -> implementer -> reviewer (CHECKPOINTS + final batch subagent)
- **Plan:** Plan A of `docs/analisis-tool-discovery-referencias.md`. Schema-first (mirror of `harness_version` feat 5): the `discovery` block is `additionalProperties:false`, so `agents` must be declared in the schema before any harness can write it.
- **Changes:** `handyman/assets/schemas/harness.config.schema.json` + `feature_list.schema.json` — `discovery` definition now declares `agents` (array of unique strings) beside `skills`/`mcp`, still `additionalProperties:false`, still out of `required` (legacy harnesses validate). Sentinel `"agents": []` added to `harness.config.local/global.template.json` and `feature_list.template.json`. `tests/test_docs.py` `test_discovery_config` asserts `agents` in both schema definitions and all three templates. `scaffold.sh` untouched (copies templates verbatim).
- **Verification:** verifier exit 0; ALL SUITES PASSED (10 suites).
- **Review:** APPROVED -> backlog/review_discovery_agents_schema.md
- **Closure:** done — Plan A of 5.

## 2026-07-01 - Feature 50: tools_discovery_agents
- **Agent:** leader -> implementer -> reviewer (CHECKPOINTS + final batch subagent)
- **Plan:** Plan B — extend the deterministic discovery to consultation agents and deliver the resolved path as a direct reference (ponytail: reuse existing machinery, do not rebuild).
- **Changes:** `handyman/scripts/tools_discovery.py` — imports `PLATFORM_ROLE_DIRS` from `validate_harness` (single source of truth); new `discover_agents(root)` reuses `_parse_frontmatter` to scan `*.agent.md` under the platform role dirs; `cmd_check` verifies each declared agent `ok -> <path>` / `MISSING` (gates like a skill, since a role file is on disk), notes undeclared role files, and now prints the resolved path of every present skill and agent; docstring updated. `tests/test_tools_discovery.sh` +T10 (agent present -> ok+path), +T11 (declared-missing -> MISSING+exit!=0), +T12 (undeclared -> NOTE); 9->12. Dogfood `harness.config.json` (gitignored) declares `agents:[leader,implementer,reviewer]`.
- **Verification:** verifier exit 0; `test_tools_discovery.sh` 12/12; live `check` shows the three agents `ok -> <path>` and exits 0; shellcheck clean. No gate risk: `check` runs only inside `preflight.py` (always exit 0, `|| true`).
- **Review:** APPROVED -> backlog/review_tools_discovery_agents.md
- **Closure:** done — Plan B of 5.

## 2026-07-01 - Feature 51: tools_discovery_agents_advisory
- **Agent:** leader -> implementer -> reviewer (CHECKPOINTS + final batch subagent)
- **Plan:** Plan C — extend the non-blocking discovery advisory so a harness that declares no skills, MCP servers, *or* agents gets nudged.
- **Changes:** `handyman/assets/init.template.sh` and the live `init.sh` — `check_tools_discovery()` now reads `discovery.agents` (same `jq '(.discovery.X // []) | length'` pattern) and only NOTEs when skills, mcp AND agents are all empty; message names agents. Both kept in sync (the repo's advisory-consistency rule). Never touches `EXIT_CODE`. `tests/test_docs.py` `test_tools_discovery_advisory` asserts it inspects `discovery.agents`.
- **Verification:** verifier exit 0; ALL SUITES PASSED (10 suites). Dogfood declares agents, so the live advisory stays silent (correct).
- **Review:** APPROVED -> backlog/review_tools_discovery_agents_advisory.md
- **Closure:** done — Plan C of 5.

## 2026-07-01 - Feature 52: discovery_agents_reference
- **Agent:** leader -> implementer -> reviewer (CHECKPOINTS + final batch subagent)
- **Plan:** Plan D — document the agent discovery and the second boundary the investigation surfaced (contract=names vs query=paths).
- **Changes:** `handyman/references/discovery.md` retitled "Skill, MCP, and Agent Discovery"; intro + `discovery` JSON include agents; new `## Consultation agents` section (what they are, `.github/agents`/`.claude/agents` via `PLATFORM_ROLE_DIRS`, `check` ok/MISSING gating, undeclared NOTE); new `## Contract vs resolution: names travel, paths do not` section (portable names vs machine paths — deliver the path, do not store it); advisory + Limitations updated. `handyman/references/tools.md` blockquote crosses `discovery.agents` as the declarable counterpart of the `agent` capability. `tests/test_docs.py` `test_discovery_reference` asserts the agents section, the boundary, and the tools.md cross-link.
- **Verification:** verifier exit 0; T2 links resolve (only existing siblings) + T6 W011 passive framing clean on the new prose.
- **Review:** APPROVED -> backlog/review_discovery_agents_reference.md
- **Closure:** done — Plan D of 5.

## 2026-07-01 - Feature 53: feature_request_agents_link
- **Agent:** leader -> implementer -> reviewer (CHECKPOINTS + final batch subagent)
- **Plan:** Plan E — close the loop intent -> contract -> verification for agents, mirroring what feat 37 did for skills.
- **Changes:** `handyman/assets/feature-request.template.md` — header guidance now covers skills (from `discovery.skills`) and agents (from `discovery.agents`), both verified by `scripts/tools_discovery.py check`; CORE `## Tools` gains an `agents (optional)` line; the `## Tools (extension)` sub-agents line points at `*.agent.md` declared under `discovery.agents`. `handyman/references/workflow.md` Leader Protocol: delegate only to agents declared under `discovery.agents` and confirmed present by `check` (links `discovery.md`). `tests/test_docs.py` `test_feature_request_tools_link` asserts the form and workflow both tie to `discovery.agents`.
- **Verification:** verifier exit 0; ALL SUITES PASSED (10 suites); T2 workflow link resolves (form is under `assets/`, excluded from the scan).
- **Review:** APPROVED -> backlog/review_feature_request_agents_link.md + consolidated backlog/review_discovery_agents_batch.md
- **Closure:** done — completes Plan A-E of `docs/analisis-tool-discovery-referencias.md`. SKILL.md 998/1000 + AGENTS 249/250 untouched. Pre-existing pending: id 4 `secrets_advisory`.

## 2026-07-01 - Feature 54: research_workflow_project_handyman
- **Agent:** leader (research) -> reviewer subagent (Haiku)
- **Plan:** Research-only (mirror of ids 9/15/20/25/31/32/38/48): analyze the complete handyman flow and recommend improvements on three axes — (1) ordered and measurable workflow with explicit stages, (2) new deterministic tools, (3) selection and automation of tool discovery. Literature: handyman, skill-creator, ponytail.
- **Changes:** `docs/analisis-workflow-etapas.md` (NEW, 344 lines, series format, 0 md-links). Thesis: the 7-stage pipeline already exists de facto in `references/workflow.md` protocols and the raw material for measurement is already on disk (dated `history.md` headings from `feature.py done`, parseable backlog frontmatter from `backlog.py`, `feature_list.json` counts) — nothing names the pipeline or aggregates the artifacts. New boundary proposed: **declared states vs derived stages** (contract stays 4-state, metrics derive from artifacts; extends feature 11's state-machine-not-timeline). Plan A-E: A stages table in `workflow.md`, B `scripts/metrics.py` read-only aggregator, C `preflight.py --strict` opt-in CI gate, D `tools_discovery.py declare` (cures the 18 installed-but-undeclared NOTEs, mirror of `feature.py add` vs feature 13), E validate `## Tools` at intake + `Tools:` provenance in the rich history entry. Suggested features NOT added: `workflow_stages_reference`, `metrics_script`, `preflight_strict_mode`, `tools_discovery_declare`, `feature_tools_provenance`.
- **Verification:** verifier exit 0 (10 suites green); `grep -c '](' docs/analisis-workflow-etapas.md` = 0 (T2 safe); passive framing (T6/W011 safe); SKILL.md and AGENTS.template.md untouched.
- **Review:** APPROVED -> backlog/review_research_workflow_project_handyman.md (reviewer subagent fact-checked 5 claims: status enum, history heading format, 10-script inventory, preflight exit-0 docstring, no `declare` subcommand today — all TRUE)
- **Closure:** done — research delivered; plan A-E awaits future feature intake. Pre-existing pending: id 4 `secrets_advisory`.

## 2026-07-01 - Feature 55: workflow_stages_reference
- **Agent:** leader (impl) -> CHECKPOINTS self-review + batch reviewer subagent
- **Plan:** Plan A of `docs/analisis-workflow-etapas.md` — name the pipeline that already exists: 7 stages, each with guardian, artifact, and derivable measure.
- **Changes:** `handyman/references/workflow.md` — new `## Stages at a Glance` right after the intro (normative table stage/guardian/artifact/measure + rule "a stage without its artifact did not happen" + measures-are-derived note). `handyman/references/checklists.md` — Run-Feature closure item: every stage left its artifact (links the table).
- **Verification:** verifier exit 0; doc-only, new link is a resolving sibling; SKILL.md/AGENTS untouched.
- **Review:** APPROVED -> backlog/review_workflow_stages_reference.md
- **Closure:** done — Plan A of 5 (order A->B->D->C->E).

## 2026-07-01 - Feature 56: metrics_script
- **Agent:** leader (impl) -> CHECKPOINTS self-review + batch reviewer subagent
- **Plan:** Plan B — the deterministic reader that makes the stages measurable: aggregate the three artifact layers the workflow already writes, without touching any contract.
- **Changes:** `handyman/scripts/metrics.py` (NEW) — status counts (`feature_list.json`), throughput per date (history dated headings; the `YYYY-MM-DD` template line cannot match the regex), review verdicts + approval rate and done-without-reports coverage (backlog frontmatter via `_parse_frontmatter` imported from `tools_discovery.py`; `resolve_workspace` from `validate_harness.py`); `--json`; always exit 0 (mirror of preflight). `tests/test_metrics.sh` (NEW, M1-M6) wired as 11th suite in `run_tests.sh`.
- **Verification:** verifier exit 0; suite 6/6; shellcheck clean; dogfood on the live harness: 54 done, 7 closure dates, 100% approval, full report coverage.
- **Review:** APPROVED -> backlog/review_metrics_script.md
- **Closure:** done — Plan B of 5.

## 2026-07-01 - Feature 57: tools_discovery_declare
- **Agent:** leader (impl) -> CHECKPOINTS self-review + batch reviewer subagent
- **Plan:** Plan D — close the detect-but-hand-edit gap of the discovery block (mirror of `feature.py add` vs hand-editing `feature_list.json`, feature 13).
- **Changes:** `handyman/scripts/tools_discovery.py` — new `declare <skill|mcp|agent> NAME [--dry-run]`: json round-trip on `harness.config.json`, creates the sentinel discovery block when absent, rejects duplicates without writing, validates the result against `harness.config.schema.json` BEFORE writing (graceful NOTE without jsonschema), difflib preview on `--dry-run`; docstring updated. `tests/test_tools_discovery.sh` +T13-T16; 12->16.
- **Verification:** verifier exit 0; suite 16/16; dogfood: `declare skill ponytail` applied to the live config (genuinely consulted literature = true provenance), `check` resolves it ok, one NOTE cured; remaining NOTEs stay informational by design.
- **Review:** APPROVED -> backlog/review_tools_discovery_declare.md
- **Closure:** done — Plan D of 5.

## 2026-07-01 - Feature 58: preflight_strict_mode
- **Agent:** leader (impl) -> CHECKPOINTS self-review + batch reviewer subagent
- **Plan:** Plan C — opt-in CI gating for the stability report; default advisory behavior untouched.
- **Changes:** `handyman/scripts/preflight.py` — `preflight(root, strict=False)` collects problems (drift BEHIND / sync DRIFT / discovery MISSING); `--strict` exits 1 naming them; format stays out (already blocks in the verifier's validate phase); docstring updated (+fixed stale `--list` line). `tests/test_preflight.sh` +T6-T8; 5->8.
- **Verification:** verifier exit 0; suite 8/8; dogfood: live `--strict` correctly gated on the real drift 1.13.13->1.14.15, cured via `upgrade_harness.py` re-seal (backup kept) + feature_list config mirror synced; live strict now exit 0.
- **Review:** APPROVED -> backlog/review_preflight_strict_mode.md
- **Closure:** done — Plan C of 5.

## 2026-07-01 - Feature 59: feature_tools_provenance
- **Agent:** leader (impl) -> CHECKPOINTS self-review + batch reviewer subagent
- **Plan:** Plan E — close the loop intent -> contract -> verification -> provenance for per-feature tool selection.
- **Changes:** `handyman/scripts/feature.py` — `done --tools` writes a `- **Tools:**` line in the rich history entry (omitted -> `...`). `handyman/references/workflow.md` — Leader Protocol #4 validates the form's `## Tools` against `discovery` (check + declare) before `feature.py add`; Closure Protocol #3 lists Tools in the headed form and prescribes `--tools`. `tests/test_feature.sh` +F18 (both paths, one fixture); 17->18.
- **Tools:** skills: handyman, ponytail, skill-creator; agents: reviewer (batch); scripts: tools_discovery.py, feature.py
- **Verification:** verifier exit 0; suite 18/18; F12 rich-fields regression intact; this very entry dogfoods the flag.
- **Review:** APPROVED -> backlog/review_feature_tools_provenance.md
- **Closure:** done — Plan E of 5; completes Plan A-E of `docs/analisis-workflow-etapas.md`. SKILL.md/AGENTS untouched. Pre-existing pending: id 4 `secrets_advisory`.

## 2026-07-01 - Feature 60: fleet_monitoring_research
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_monitoring_research.md
- **Closure:** done

## 2026-07-01 - Feature 61: fleet_registry
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_registry.md
- **Closure:** done

## 2026-07-01 - Feature 62: fleet_status
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_status.md
- **Closure:** done

## 2026-07-01 - Feature 63: fleet_health
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_health.md
- **Closure:** done

## 2026-07-01 - Feature 64: fleet_moc
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_moc.md
- **Closure:** done

## 2026-07-01 - Feature 65: fleet_reference_doc
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_reference_doc.md
- **Closure:** done

## 2026-07-01 - Feature 66: fleet_timeline
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_timeline.md
- **Closure:** done

## 2026-07-01 - Feature 67: fleet_heartbeat
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_heartbeat.md
- **Closure:** done

## 2026-07-01 - Feature 68: discovery_note_summary
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_discovery_note_summary.md
- **Closure:** done

## 2026-07-01 - Feature 69: fleet_run_verifier
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_run_verifier.md
- **Closure:** done

## 2026-07-01 - Feature 70: fleet_moc_html
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_fleet_moc_html.md
- **Closure:** done

## 2026-07-01 - Feature 71: feature_unblock
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_feature_unblock.md
- **Closure:** done

## 2026-07-01 - Feature 72: workstation_serve
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_serve.md
- **Closure:** done

## 2026-07-01 - Feature 73: workstation_intake
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_intake.md
- **Closure:** done

## 2026-07-01 - Feature 74: workstation_verify
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_verify.md
- **Closure:** done

## 2026-07-01 - Feature 75: workstation_reference_doc
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_reference_doc.md
- **Closure:** done

## 2026-07-01 - Feature 76: new_proposal_ux_ui_handyman_workstation
- **Agent:** leader -> implementer -> reviewer
- **Plan:** research-only: diagnose the workstation panel UX/UI (no brand tokens, no interaction contract, no view separation / action nomenclature) with repo evidence, then leave an A–E action plan in docs/ following the analisis-* series
- **Changes:** docs/analisis-ux-ui-workstation.md (new); no product code touched
- **Tools:** skills: handyman (workflow/security/workstation refs), skill-creator, ponytail, mcp-builder
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_new_proposal_ux_ui_handyman_workstation.md
- **Closure:** done

## 2026-07-01 - Feature 77: workstation_design_tokens
- **Agent:** leader -> implementer -> reviewer
- **Plan:** plan A of analisis-ux-ui-workstation.md — single :root token sheet (--hw-*), dark mode as variable reassignment, PNG data-URI favicon, wordmark+skill version, textual badges
- **Changes:** fleet.py (_HTML_STYLE tokens, _FAVICON, fleet page header/drift badge), workstation.py (_PANEL_STYLE consumes tokens, panel header, badge()/verifierBadge()), test_fleet.sh FL23 refined, test_workstation.sh W15 new
- **Tools:** skills: handyman (workflow/workstation refs), ponytail (native CSS variables over framework)
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_design_tokens.md
- **Closure:** done

## 2026-07-02 - Feature 78: workstation_action_nomenclature
- **Agent:** leader -> implementer -> reviewer
- **Plan:** plan D of analisis-ux-ui-workstation.md — action labels speak the workflow-stage vocabulary, titles name stage+artifact, glossary in the reference
- **Changes:** workstation.py (LABELS/TITLES, Run verifier button), references/workstation.md (Action Nomenclature glossary), test_workstation.sh W16
- **Tools:** skills: handyman (workflow stages), mcp-builder (action-oriented naming)
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_action_nomenclature.md
- **Closure:** done

## 2026-07-02 - Feature 79: workstation_interaction_contract
- **Agent:** leader -> implementer -> reviewer
- **Plan:** plan B of analisis-ux-ui-workstation.md — single fmt layer, relative dates with absolute in title, unified empty states, busy submit, ok:/error: prefixes, native slug/reason validation, per-field help, draft-vs-add explained
- **Changes:** workstation.py (fmt, dateEl, emptyNode, slugInput, HELP, busy submit handler, CSS), test_workstation.sh W17
- **Tools:** skills: handyman (workstation ref), ponytail (native validation over custom JS), mcp-builder (actionable errors)
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_interaction_contract.md
- **Closure:** done

## 2026-07-02 - Feature 80: workstation_views_routing
- **Agent:** leader -> implementer -> reviewer
- **Plan:** plan C of analisis-ux-ui-workstation.md — native hash routing (#/fleet, #/harness/<name>, #/timeline), slim overview, consolidated per-harness detail with state-first stage actions, additive draft field
- **Changes:** workstation.py (nav+sections, route/render, renderHarness, stageActions, draft_state server-side), test_workstation.sh W18
- **Tools:** skills: handyman (workflow states, workstation ref), ponytail (hash routing over router lib)
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_views_routing.md
- **Closure:** done

## 2026-07-02 - Feature 81: workstation_design_guidelines_doc
- **Agent:** leader -> implementer -> reviewer
- **Plan:** plan E of analisis-ux-ui-workstation.md — Panel Design Guidelines in the reference (tokens table, interaction contract, views map), endpoints row gains draft, static anchor test
- **Changes:** references/workstation.md (guidelines section + draft in endpoints), tests/test_docs.py (test_workstation_reference)
- **Tools:** skills: handyman (workflow/W011), skill-creator (progressive disclosure: guidance in references/)
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_design_guidelines_doc.md
- **Closure:** done

## 2026-07-02 - Feature 82: workstation_detail_declutter
- **Agent:** leader -> implementer -> reviewer
- **Plan:** P1+P2+P5 of the visual review — fold done/blocked queue groups, actions-first detail order, page title + identity meta, unified status strip, plural(), bulletless lists
- **Changes:** workstation.py (renderHarness order, queueSection details fold, fmt.queueItem, omitProject timeline, plural, CSS), test_workstation.sh W19; verified with headless-Chrome screenshots (first done attempt hit a load flake while the review server + Chrome ran; clean retry closed green)
- **Tools:** skills: handyman (workstation ref), ponytail (native details over JS accordion); visual QA via headless Chrome
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_detail_declutter.md
- **Closure:** done

## 2026-07-02 - Feature 83: workstation_app_shell
- **Agent:** leader -> implementer -> reviewer
- **Plan:** P3+P4+P6 of the visual review — appbar band with live pulse, tabs with active state, registry debug to footer, aligned numeric headers + muted zeros, timeline grouped by date
- **Changes:** workstation.py (appbar/footer HTML, render aria-current + updated/registry split, muted zero cells, fillTimeline tl-date groups, shell CSS), test_workstation.sh W20; verified with headless-Chrome screenshots
- **Tools:** skills: handyman (workstation ref), ponytail (CSS tabs over JS tab lib); visual QA via headless Chrome
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_app_shell.md
- **Closure:** done

## 2026-07-02 - Feature 84: workstation_stale_panel_warning
- **Agent:** leader -> implementer -> reviewer
- **Plan:** P7 of the visual review — bake the panel's version and warn when the live skill differs (a server left running across an upgrade silently serves the old UI)
- **Changes:** workstation.py (BAKED_VERSION, #stale slot, render comparison + warn badge), test_workstation.sh W21
- **Tools:** skills: handyman (workstation ref, serve lifecycle)
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_stale_panel_warning.md
- **Closure:** done

## 2026-07-02 - Feature 85: new_proposal_ux_ui_handyman_workstation_2
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_new_proposal_ux_ui_handyman_workstation_2.md
- **Closure:** done

## 2026-07-02 - Feature 86: workstation_tokens_v2_palette
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_tokens_v2_palette.md
- **Closure:** done

## 2026-07-02 - Feature 87: workstation_theme_toggle
- **Agent:** leader -> implementer -> reviewer
- **Plan:** ...
- **Changes:** ...
- **Tools:** ...
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_workstation_theme_toggle.md
- **Closure:** done

## 2026-07-15 - Feature 92: documentation_update_sprint_clousure
- **Agent:** leader -> implementer -> reviewer
- **Plan:** Research-only (archetype of 9/15/20/25/31/32/38/48/54): investigate sprint open/close lifecycle, docs split (current/ vs sprints/), and multi-branch parallel work; write the analisis-series doc; reviewer pass; close.
- **Changes:** NEW docs/analisis-sprints-cierre-periodo.md (8 sections, 5 root causes with repo evidence, plan A-E, 5 suggested features: sprint_schema, sprint_script, branch_provenance, docs_sprint_split, sprint_workflow_reference). Key thesis: sprint = declared partition label (schema-first, mirror of features 5/33/49), sprint doc = derived at close from metrics.py raw material; branch = session provenance, not contract key; real parallelism = git worktree (workspace untracked). Live evidence: stale in_progress feature 88 from another branch blocked this session's intake -> feature.py block (the exact pattern the request registers). Growth without closure measured: history 744 lines / backlog 177 reports / feature_list 92 entries.
- **Tools:** skills: handyman (workflow/anatomy references), ponytail (minimal-change ladder), skill-creator (format contracts); scripts: feature.py, backlog.py, metrics.py, preflight.py; agent: reviewer (Haiku)
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_documentation_update_sprint_clousure.md
- **Closure:** done

## 2026-07-15 - Feature 93: sprint_schema
- **Agent:** leader -> implementer -> reviewer
- **Plan:** Plan A of analisis-sprints-cierre-periodo: seal the sprint partition label schema-first (additionalProperties:false), legacy keeps validating.
- **Changes:** feature_list.schema.json feature def +sprint (pattern ^\d{4}-SP\d+$) and config def +current_sprint (nullable); harness.config.schema.json +current_sprint; sentinel null in the 3 templates; test_docs test_sprint_config() (12 checks, accepts 2026-SP1 / rejects sprint-one). Suite 168/168.
- **Tools:** skills: handyman, ponytail; scripts: feature.py, backlog.py; schema-first mirror of features 5/33/49
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_sprint_schema.md
- **Closure:** done

## 2026-07-15 - Feature 94: sprint_script
- **Agent:** leader -> implementer -> reviewer
- **Plan:** Plan B: deterministic sprint lifecycle script; sprint doc derived, never hand-maintained; template ships with the script (backlog.py precedent).
- **Changes:** NEW handyman/scripts/sprint.py (open stamps unlabeled pending/in_progress + records current_sprint with config precedence; close derives docs/sprints/sprint.<id>.md from feature_list+history+backlog reusing metrics.py helpers, archives done to archive/feature_archive.json, strips carry-over labels, clears current_sprint, --dry-run; status read-only; rejects in_progress labeled features and doc overwrite). NEW assets/sprint.template.md (derived + 2 manual sections). NEW tests/test_sprint.sh S1-S8 wired as 12th suite. 8/8 first run.
- **Tools:** skills: handyman, ponytail (reuse ladder: metrics.py helpers, resolve_workspace, backlog.py template pattern); scripts: feature.py, backlog.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_sprint_script.md
- **Closure:** done

## 2026-07-15 - Feature 95: branch_provenance
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** Plan C: branch = session provenance (current.md/history), never a feature contract key; foreign-session collision becomes explicit diagnosis.
- **Changes:** feature.py SESSION_TEMPLATE +Branch line, _git_branch (git symbolic-ref, works on unborn HEAD - rev-parse does NOT, caught by first test run), _session_branch; start records branch (placeholder outside git), done carries it into the rich history entry (this very entry is the dogfood). validate_harness check_branch_advisory: NOTE when session branch differs from checkout, points to resume/block/worktree, never gates. Tests F19/F20 (+F18 -A4->-A5 shift fix), T17. 20/20 + 15/15.
- **Tools:** skills: handyman, ponytail (native git symbolic-ref over custom state); scripts: feature.py, backlog.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_branch_provenance.md
- **Closure:** done

## 2026-07-15 - Feature 96: docs_sprint_split
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** Plan D: two period spaces in the workspace docs, knowledge docs stay flat; MOC lists them.
- **Changes:** scaffold.sh make_dir docs/current + docs/sprints; index_md.py Docs section lists docs/sprints/*.md and docs/current/*.md as wikilinks (T2-safe); live .handyman/docs/{current,sprints}/ created; T18 (scaffold) + I6 (MOC). 16/16 + 6/6.
- **Tools:** skills: handyman, ponytail; scripts: scaffold.sh, index_md.py, backlog.py, feature.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_docs_sprint_split.md
- **Closure:** done

## 2026-07-15 - Feature 97: sprint_workflow_reference
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** Plan E: name the period stage and its protocol in the references; keep SKILL.md untouched (998/1000, pointer skipped by design).
- **Changes:** workflow.md stage-7 row + intro reword + multi-branch/worktree Startup paragraph + ## Sprint Protocol (open -> work -> close -> manual pass, derived-never-hand-maintained); anatomy.md +3 Optional Support rows + sprint label in the Feature List Contract (no-dates rule preserved: partition, not chronology) + current_sprint in the config mirror bullet; checklists.md ## Sprint-Close Checklist (6 items). Docs suite 169/169, budgets 998/249. Batch reviewer subagent APPROVED all A-E -> backlog/review_sprint_lifecycle_batch.md.
- **Tools:** skills: handyman (references), ponytail; scripts: backlog.py, feature.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_sprint_workflow_reference.md
- **Closure:** done

## 2026-07-15 - Feature 98: harness_ecosystem_research
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** Research-only (serie 9/15/20/25/31/32/38/48/54/92): investigar harnesses del ecosistema por internet, mapear el set de features comunes vs handyman y proponer plan de adopcion; skills tipo harness descubiertas con find-skills.
- **Changes:** Nuevo docs/analisis-harnesses-ecosistema.md (9 secciones, 0 md-links). Fuentes: Anthropic effective-harnesses + quickstart autonomous-coding (linaje directo de handyman), beads 25.3k stars (dep graph, bd ready, ids hash, compaction, prime/remember), obra/superpowers 255k (two-stage review, worktrees), patron ralph loop (skills 3.5K installs; fuente original 403), github/spec-kit 122k (converge), 5 skills harness via npx skills find (agent-harness-construction y eval-harness = literatura util; ralph-loop audit FAIL = leer, no instalar). Matriz de 16 features comunes: 6 completas / 8 parciales / 2 ausentes (depends_on+ready y contrato de loop desatendido). Plan A-E: A depends_on + feature.py ready (schema-first), B exit codes de loop + workflow (NO runner propio), C two-stage review (template+protocolo), D compaction de history en sprint close, E observation shape en scripts + pass@k opt-in en evals.py. 8 descartes razonados y 6 features sugeridas NO anadidas.
- **Tools:** fetch_webpage (anthropic.com/engineering, github: beads/superpowers/spec-kit/claude-quickstarts, skills.sh), npx skills find (find-skills), feature.py, backlog.py, reviewer subagent, init.sh
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_harness_ecosystem_research.md
- **Closure:** done

## 2026-07-15 - Feature 99: feature_depends_on
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** Plan A del analisis-harnesses-ecosistema: depends_on declarado en el contrato (schema-first), readiness derivada con feature.py ready, guards advisory.
- **Changes:** feature_list.schema.json +depends_on (array int uniqueItems, opcional); feature.py +_archived_ids/_unmet_deps, add --depends-on, cmd_ready (--json, exit 3 drenado = stop signal del loop), start WARN deps abiertas (no gate, espejo branch advisory); validate_harness +check_depends_on (self-dep + dangling id = gap, archived ids validos, helper duplicado a proposito para evitar ciclo de imports); anatomy.md contrato + bullet declared-vs-derived. Tests F22-F24 + T19 + test_depends_on_contract. Suites 24+17+178, shellcheck clean.
- **Tools:** skills: handyman, ponytail; scripts: feature.py, backlog.py, validate_harness.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_feature_depends_on.md
- **Closure:** done

## 2026-07-15 - Feature 100: unattended_loop_contract
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** Plan B: el loop desatendido como contrato (exit codes + doc + advisory), nunca como runner propio.
- **Changes:** workflow.md +## Unattended Loop (work detection ready 0/3, one-feature-per-iteration, verifier gate, stop conditions, fence while-ready, no-runner by design) y Stability check -> six controls con bullet Worklist; preflight.py +bloque worklist (reusa feature.py ready via subprocess, NOTE + loop stop condition en drenado, fuera de strict); tests T9/T10 (con --strict activo prueban que worklist no gatea) + test_unattended_loop_reference. Suites 10+186, verifier 0.
- **Tools:** skills: handyman, ponytail; scripts: preflight.py, feature.py ready, backlog.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_unattended_loop_contract.md
- **Closure:** done

## 2026-07-15 - Feature 101: two_stage_review
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** Plan C: revision en dos etapas ordenadas (spec compliance -> code quality) via template + protocolo, cero codigo.
- **Changes:** backlog-review.template.md Checklist -> Stage 1: Spec Compliance (regla de corte + 3 checks) y Stage 2: Code Quality (los 4 originales); workflow.md Reviewer Protocol paso 6 prescribe el orden y el corte (Stage 1 falla = CHANGES_REQUESTED sin Stage 2); test_two_stage_review (7 checks). backlog.py intacto (test_backlog 7/7). El review de esta misma feature dogfoodea el formato. Suites 193+7, verifier 0.
- **Tools:** skills: handyman (superpowers como literatura), ponytail; scripts: backlog.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_two_stage_review.md
- **Closure:** done

## 2026-07-15 - Feature 102: history_compaction
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** Plan D: memory decay al cierre de periodo — sprint.py close comprime los cuerpos de history de las features archivadas a un stub de una linea.
- **Changes:** sprint.py +_compact_history (heading fechado byte-identico porque metrics.history_closures lo regex-ea anclado — el stub va en el CUERPO, refinamiento sobre el research doc; orden derive-then-compact garantiza que el stub apunta a un doc existente; idempotente por deteccion del stub); wired en close real y dry-run (would compact N); workflow.md paso 3 + anatomy.md fila sprint.py; tests S9 (comprime/respeta), S10 (dry-run), S11 (idempotencia cross-sprint SP1/SP2). Suite sprint 11/11, verifier 0.
- **Tools:** skills: handyman, ponytail (beads memory-decay como literatura); scripts: sprint.py, metrics.py, backlog.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_history_compaction.md
- **Closure:** done

## 2026-07-15 - Feature 103: script_observation_shape
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** ...
- **Changes:** ...
- **Tools:** skills: handyman (agent-harness-construction como literatura de observation design), ponytail; scripts: preflight.py, feature.py, backlog.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_script_observation_shape.md
- **Closure:** done

## 2026-07-15 - Feature 104: evals_passk_report
- **Agent:** leader -> implementer -> reviewer
- **Branch:** feat/documentation-update-and-sprint-clousure
- **Plan:** ...
- **Changes:** ...
- **Tools:** skills: handyman (eval-harness como literatura de pass@k), ponytail; scripts: evals.py, backlog.py
- **Verification:** verifier exit 0
- **Review:** APPROVED -> backlog/review_evals_passk_report.md
- **Closure:** done

---

## 2026-07-15 - Session: harness upgrade + workstation deprecation
- **Agent:** leader (operator-driven, no subagents)
- **Branch:** feat/cleaning-workspace
- **Plan:** upgrade mode — re-seal harness to current skill version; assess history compaction; refresh stale project docs; deprecate the workstation initiative on operator request.
- **Changes:** upgrade_harness.py apply re-sealed `harness_version` 1.15.15 -> 1.20.20 in `harness.config.json` (backup in `.handyman/.upgrade-backups/20260715-200109`); synced the mirrored `config.harness_version` 1.14.15 -> 1.20.20 in `feature_list.json` (3-way drift fixed); refreshed `docs/architecture.md` (Scripts table + Schemas/CI/Evals rows + Key Systems: version seal, sprint lifecycle, preflight, discovery sync), `docs/verification.md` (all test suites + additional checks), `docs/business.md` (UC6 upgrade mode, UC7 sprint lifecycle); archived deprecated workstation features 88, 89, 90, 91 from `feature_list.json` into `archive/feature_archive.json` under `deprecated-workstation` (backup in `.handyman/.upgrade-backups/delete-workstation-20260715-203226`).
- **Compaction assessment:** not necessary — SP1 already closed (2026-07-15) and its features are stubbed; remaining verbose entries are pre-SP1 append-only record.
- **Verification:** `upgrade --check` up to date (exit 0); `validate_harness` OK; `./init.sh` exit 0 (green) after every step; `index.md` regenerated.
- **Closure:** session closed (idle, no feature in_progress)

## 2026-07-16 - Feature 7: feature_state_machine
- archived to sprint 2026-SP2; narrative in docs/sprints/sprint.2026-SP2.md

## 2026-07-16 - Feature 8: sprint_lifecycle
- archived to sprint 2026-SP3; narrative in docs/sprints/sprint.2026-SP3.md

## 2026-07-16 - Feature 14: evals_trigger_eval
- archived to sprint 2026-SP4; narrative in docs/sprints/sprint.2026-SP4.md

## 2026-07-16 - Feature 9: validate_harness_cli
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-16 - Feature 11: update_harness_diff
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-16 - Feature 12: upgrade_harness_diff
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-16 - Feature 10: preflight_fanout
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 13: tools_discovery_discovery
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 15: toolbox_port
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 16: toolbox_observer
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 17: toolbox_graph_view
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 18: toolbox_search
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 19: toolbox_ui_project_info
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 20: toolbox_theme_toggle
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 21: toolbox_markdown_render
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 22: toolbox_a11y_live
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 23: toolbox_command_palette
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 24: toolbox_llm_providers
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 26: toolbox_intake_ui
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 27: toolbox_intake_enhancements
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 28: start_and_close_timestamps
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-17 - Feature 29: sync_docs_handyman_v2
- archived to sprint 2026-SP5; narrative in docs/sprints/sprint.2026-SP5.md

## 2026-07-18 - Feature 30: toolbox_fleet_summary
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 31: toolbox_ask_fleet
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 36: toolbox_parity_oracle
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 37: toolbox_provider_registry
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 38: toolbox_next_scaffold
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 40: toolbox_next_landing
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 39: toolbox_next_fleet_view
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 41: toolbox_next_harness_view
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 42: toolbox_core_package
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 43: toolbox_next_runtime_events
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 44: toolbox_next_read_api
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 45: toolbox_next_llm_relays
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 46: toolbox_next_intake_action
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 49: toolbox_panel_retirement
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-18 - Feature 50: toolbox_serve_decommission
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 32: toolbox_backlog_triage
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 34: toolbox_review_notes
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 33: toolbox_acceptance_from_diff
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 35: toolbox_retro_lessons
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 51: harness_unblock_verbs
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 52: harness_evidence_debt_advisory
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 53: toolbox_cli_review_notes
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 54: harness_roles_toolbox_pointer
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 55: harness_report_actor
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 56: harness_done_reads_review
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 57: harness_verb_write_contract
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 58: backlog_review_reissue
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 59: init_runs_validate_harness
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 60: panel_idea_to_feature
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 61: validator_legacy_frontmatter_alias
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 62: license_mit_coherente
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 63: repo_publico_sin_contenido_ajeno
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 66: panel_visible_en_readme
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 67: okf_memoria_alignment
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 64: toolchain_npm_handyman_harness
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 65: skill_invoca_npx
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-19 - Feature 68: version_handshake_npm
- archived to sprint 2026-SP6; narrative in docs/sprints/sprint.2026-SP6.md

## 2026-07-21 - Feature 69: period_close_branch_unit
- archived to sprint feat-rework-tools; narrative in memory/sprints/sprint.feat-rework-tools.md

## 2026-07-21 - Feature 70: graphify_freshness_gate
- archived to sprint feat-rework-tools; narrative in memory/sprints/sprint.feat-rework-tools.md

## 2026-07-21 - Feature 71: discovery_declared_paths
- archived to sprint feat-rework-tools; narrative in memory/sprints/sprint.feat-rework-tools.md

## 2026-07-21 - Feature 72: handyman_mcp_server
- archived to sprint feat-rework-tools; narrative in memory/sprints/sprint.feat-rework-tools.md

## 2026-07-21 - Feature 73: workspace_memory_layout
- archived to sprint feat-rework-tools; narrative in memory/sprints/sprint.feat-rework-tools.md

## 2026-07-21 - Feature 74: mcp_register_cli_helper
- archived to sprint feat-rework-tools; narrative in memory/sprints/sprint.feat-rework-tools.md

## 2026-07-21 - Feature 75: mcp_feature_workflow_tools
- archived to sprint feat-rework-tools; narrative in memory/sprints/sprint.feat-rework-tools.md

## 2026-07-21 - Feature 76: mcp_decouple_toolbox_core
- archived to sprint feat-rework-tools; narrative in memory/sprints/sprint.feat-rework-tools.md

## 2026-07-21 - Feature 77: mcp_readonly_status_tools
- archived to sprint feat-rework-tools; narrative in memory/sprints/sprint.feat-rework-tools.md

## 2026-07-24 - Feature 78: memory_drift_templates_references
- **Branch:** feat/residual-memory-revision
- **Tools:** ...
- **Evidence:** backlog/impl_memory_drift_templates_references.md · review: APPROVED -> backlog/review_memory_drift_templates_references.md
- **Verification:** verifier exit 0 · closure done
