---
feature: bootstrap_protocol
status: approved
role: reviewer
updated: 2026-06-24
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/bootstrap_protocol]
---

# Review: bootstrap_protocol (mitigation A + skill_table_fix)

## Checklist

- [x] **AC1 — workflow.md Bootstrap Protocol section with scaffold.sh as mandatory first step**
  PASS. A new "## Bootstrap Protocol" section exists between Startup and Leader Protocol in references/workflow.md. Step 2 explicitly says "Run `scripts/scaffold.sh <local|global> <project_root>`". Step 1 frames it as the deterministic mandatory step and forbids hand-creation.

- [x] **AC2 — templates.md warns against manual creation and marks scaffold.sh canonical**
  PASS. The second paragraph of references/templates.md reads: "`scaffold.sh` is the canonical way to lay down the file set… Do not hand-create these files from the snippets below…". Cross-reference link to workflow.md Bootstrap Protocol is present and resolves.

- [x] **AC3 — SKILL.md Installation Scope table no longer implies harness.config.json is global-only**
  PASS. The `local` row now lists `harness.config.json` among the bridge files. The `global` row reads "Same files, absolute paths" — no longer suggesting config is global-exclusive.

- [x] **AC4 — Token budgets: SKILL ≤1000, AGENTS ≤250**
  PASS. Verifier reports SKILL.md at 997/1000 words and assets/AGENTS.template.md at 249/250 words.

- [x] **AC5 — bash tests/run_tests.sh passes**
  PASS. `./init.sh` exited 0: ALL SUITES PASSED / VERIFIER: all gates passed (83 PASS lines, 0 FAIL).

## scaffold.sh Factual Check

The claim that `harness.config.json` is written in **both** scopes is TRUE.

In scripts/scaffold.sh the `if [ "$SCOPE" = "local" ]; then … else … fi` block (lines ~50–57) only sets the variables `HARNESS_WORKSPACE` and `CONFIG_TEMPLATE`. The actual copy call:

```
copy_and_stamp "$CONFIG_TEMPLATE" "$PROJECT_ROOT/harness.config.json" "$HARNESS_VERSION"
```

appears unconditionally in the "Bridge files in the repo root" section (line ~157), outside the scope branch. Both `local` and `global` runs therefore write `harness.config.json` into `PROJECT_ROOT`; the scope only selects which template (`harness.config.local.template.json` vs `harness.config.global.template.json`) is used. The SKILL.md table is factually correct.

## Verifier Run

- Exit code: **0**
- SKILL.md word count: **997 / 1000** (margin 3)
- AGENTS.template.md word count: **249 / 250** (margin 1)
- All relative markdown links: **PASS** (no broken cross-references from new workflow.md ↔ templates.md links)

## Verdict

APPROVED
