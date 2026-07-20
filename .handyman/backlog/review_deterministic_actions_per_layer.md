---
type: Review Log
feature: deterministic_actions_per_layer
status: approved
role: reviewer
updated: 2026-06-25
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/deterministic_actions_per_layer]
---

# Review: deterministic_actions_per_layer (Research-Only Feature)

## Acceptance Criteria Verification

### 1. Research/Plan Document in docs/ ✅ PASS

**Claim:** A work plan document exists in `docs/` that maps, layer/artifact by layer, which harness modification actions have a deterministic script and which are done by hand.

**Evidence:**
- Deliverable: `docs/analisis-acciones-deterministas-por-capa.md` (confirmed present)
- **Section 2:** Maps 8 actions that ARE deterministic today (baseline)
- **Section 3:** Maps 4 manual cases (A-D):
  - Backlog entries (`impl_`/`review_`/`explore_`) — no generator
  - `progress/current.md` — only skeleton, content hand-edited
  - `progress/history.md` — minimal 3-line append, rich format hand-enriched
  - Other cases: `migrate-global`, `index.md`, frontmatter/tags
- **Section 4:** Documents root causes (asymmetric determinism, orphaned templates, rich format as convention only, no validation, no tools)
- **Sections 5-7:** Encuadre with skill-creator, work plan A-E (scripts, templates, docs), and out-of-scope features

**Result:** ✅ PASS — comprehensive, evidence-based mapping with layer-by-layer analysis.

---

### 2. Concrete Deterministic Actions with Scope References ✅ PASS

**Claim:** The plan proposes concrete deterministic actions/scripts and references their documentation in SKILL.md and `references/` (the scope), distinguishing deterministic from interactive.

**Evidence:**
- **Plan A (Backlog generator):**
  - Deterministic: script to instantiate templates with correct frontmatter per type (`feature`/`topic`, `status`, `role`, `updated`, `tags` with namespace)
  - Interactive: report content (files, decisions, verdict) written by role
  - Docs scope: `references/workflow.md` (protocols), `references/templates.md` (canonical gen via), `references/anatomy.md` (optional support files)

- **Plan B (Progress helpers):**
  - Deterministic: extend `feature.py` with `log`/`next` commands + rich history entry on close
  - Interactive: what to say in log/summary (role decides)
  - Docs scope: `references/workflow.md` (Implementer step 3, Closure), `SKILL.md` pointer

- **Plan C (Migrate-global):**
  - Deterministic: script to move state with dry-run/backup
  - Interactive: explicit approval to migrate
  - Docs scope: `references/workflow.md`, `SKILL.md`

- **Plan D (Index.md regenerator):**
  - Deterministic: rebuild MOC from live state
  - Interactive: conceptual notes added by operator
  - Docs scope: `references/obsidian.md`

- **Plan E (Frontmatter advisory):**
  - Deterministic: non-blocking check in `validate_harness.py`
  - Interactive: none (closes 4.4 gap without hard gate)
  - Docs scope: `references/checklists.md`, `references/anatomy.md`

**Result:** ✅ PASS — each item explicitly separates deterministic (script/template) from interactive (human decision), with scope references.

---

### 3. Skill-Creator Consultation ✅ PASS

**Claim:** The skill-creator skill is consulted to frame the proposal (scripts/ = executable code for deterministic/repetitive tasks).

**Evidence:**
- **Section 5 (Encuadre):** Explicitly consults `skill-creator` anatomy of Bundled Resources
- Maps proposal to `skill-creator` taxonomy:
  - `scripts/` — "Executable code for deterministic/repetitive tasks" (backlog gen, progress helpers, migrate, index regen)
  - `assets/` — "Files used in output (templates...)" (backlog templates, references to progressive disclosure)
  - `references/` — "Docs loaded into context as needed" (when/why; script provides how)
  - Format advice: "Formatos de salida: la skill recomienda fijar el formato con una plantilla exacta en vez de describirlo en prosa"

**Result:** ✅ PASS — direct consultation and alignment with skill-creator model.

---

### 4. Test Suite Pass (./init.sh + test_docs.py) ✅ PASS

**Claim:** `bash tests/run_tests.sh` passes (./init.sh green, without breaking test_docs.py markdown-link verification).

**Evidence:**
- **test_docs.py:** 53 run, 53 passed, 0 failed ✅
  - Including: "all relative markdown links resolve" ✅
- **test_init.sh (verifier):** 12 run, 12 passed, 0 failed ✅
  - Including: "validate_harness: exits 0 on a well-formed local harness" ✅
- **test_feature.sh:** 9 run, 9 passed, 0 failed ✅
- **test_update.sh:** 7 run, 7 passed, 0 failed ✅
- **test_upgrade.sh:** 10 run, 10 passed, 0 failed ✅
- **Total:** ALL SUITES PASSED

**Inline-code verification (No markdown links):**
- Searched deliverable for pattern `[.*]\(.*\)`: No matches ✅
- All paths use backtick inline-code formatting
- test_docs.py markdown link validator stays green ✅

**Result:** ✅ PASS — all test suites pass; no markdown links in deliverable.

---

## Fact-Checks Against Repository

### Claim a: Backlog Templates ✅ VERIFIED

- `scripts/scaffold.sh` L136: creates `backlog` directory ✅
- `scripts/scaffold.sh` L141-144: copies only `feature_list.json`, `progress/current.md`, `progress/history.md`, `docs/business.md` (and docs/architecture, docs/conventions, docs/verification, index, feature-request) — **NO backlog templates** ✅
- `assets/backlog-impl.template.md` exists ✅
- `assets/backlog-review.template.md` exists ✅
- `assets/backlog-explore.template.md` does **NOT** exist ✅

### Claim b: feature.py Skeleton Behavior ✅ VERIFIED

- `feature.py cmd_start` (L132-151): calls `_write_current` with SESSION_TEMPLATE containing frontmatter + sections `Plan`, `Log`, `Next Step` with placeholder content ✅
- `feature.py cmd_done` (L171-209): appends exactly 3 lines to history.md: `## {date} - Feature {id}: {name}`, `- **Verification:** verifier exit 0`, `- **Closure:** done` ✅

### Claim c: Frontmatter Contract Location ✅ VERIFIED

- `references/anatomy.md` L22-24: Table listing backlog frontmatter per type (`feature`, `status`, `role`, `updated`, `tags`) ✅
- `references/obsidian.md`: Frontmatter Conventions section with full contract ✅
- `scripts/validate_harness.py`: Only validates `feature_list.json` schema; does **NOT** validate backlog/progress frontmatter ✅

### Claim d: Inline-Code, No Markdown Links ✅ VERIFIED

- Document uses `` `path/file.md` `` for all paths (inline-code) ✅
- Zero markdown links (`[text](url)` pattern): grep search returns no matches ✅
- test_docs.py "all relative markdown links resolve" test passes ✅

---

## Summary

**Feature Status:** ✅ **APPROVED**

This research-only feature delivers a comprehensive, evidence-based analysis and work plan that:

1. Maps all manual harness state mutations with concrete evidence from the codebase
2. Proposes concrete deterministic scripts (A-E) scoped to `SKILL.md` and `references/`
3. Clearly separates deterministic actions (script/template) from interactive decisions (human)
4. Grounds the proposal in `skill-creator` taxonomy (scripts = deterministic/repetitive, assets = templates, references = docs)
5. Respects all gate constraints (tests green, no markdown links, one feature at a time)

All acceptance criteria pass. The deliverable provides a solid foundation for the follow-up implementation features listed in section 7.
