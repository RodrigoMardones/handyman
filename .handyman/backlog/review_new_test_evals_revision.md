---
feature: new_test_evals_revision
status: approved
role: reviewer
updated: 2026-06-26
tags: [handyman/role/reviewer, handyman/feature/new_test_evals_revision]
---

# Review Report: new_test_evals_revision

## Verdict

**APPROVED**

The research document is thorough, evidence-based, well-reasoned, and ready for handoff to implementation. All acceptance criteria met; all fact-checks pass; T2 compliance verified; verifier green.

---

## Acceptance Criteria

### Criterion 1: Research document cites evidence and literature

**STATUS: PASS**

The document `docs/analisis-tests-evaluaciones-modelo.md` (352 lines):
- Cites evidence directly from the repo (`trigger-eval.json`, `run_tests.sh`, `test_docs.py`)
- Cites literature from `skill-creator` (runs_per_query, 60/40 train/test split, held-out selection, overfitting guard)
- Cites literature from `mcp-builder/reference/evaluation.md` (stability, string-comparison verifiability, solve-yourself validation)
- Structures the argument in five sections: objective, current state (evidence), literature, diagnosis, and design recommendation
- Separates deterministic vs. stochastic boundaries clearly (§4.2–4.3)
- Proposes a concrete plan A–E with mirrors to prior work (features 10, 33–37)

### Criterion 2: init.sh exits 0

**STATUS: PASS**

Verifier output: `VERIFIER: all gates passed` | `EXIT=0`

All 8 suites green; no failures.

---

## Fact-Checks

### a. `handyman/evals/trigger-eval.json` structure

**STATUS: TRUE**

- File exists and contains exactly 20 queries
- 10 queries with `should_trigger: true` ✓
- 10 queries with `should_trigger: false` ✓
- Mix of English + Spanish; diverse lengths; near-miss negatives present
- Quality per literature: balanced classes, realistic context, valuable negatives

**Evidence:** Read file directly; confirmed all 20 items present and well-formed.

---

### b. No test/runner consumes the eval set

**STATUS: TRUE**

- `grep -rn "should_trigger\|trigger-eval" tests .github` returned **zero hits** ✓
- No reference to `trigger-eval`, `should_trigger`, or `eval` anywhere in `tests/` or `.github/`

**Evidence:** Grep search command executed and returned empty result.

---

### c. `tests/run_tests.sh` wires exactly 8 suites; none is evals

**STATUS: TRUE**

Suites wired in order:
1. `python3 tests/test_docs.py`
2. `bash tests/test_init.sh`
3. `bash tests/test_update.sh`
4. `bash tests/test_feature.sh`
5. `bash tests/test_backlog.sh`
6. `bash tests/test_index.sh`
7. `bash tests/test_upgrade.sh`
8. `bash tests/test_tools_discovery.sh`

None of these is an evals suite. ✓

**Evidence:** Read `run_tests.sh` lines 1–35; counted `run_suite` invocations.

---

### d. Description guard is size-budget only, not triggering/accuracy gate

**STATUS: TRUE**

`tests/test_docs.py` function `test_token_budgets()` (lines 153–160):
```python
def test_token_budgets() -> None:
    ...
    match = re.search(r"^description:\s*'(.*)'\s*$", skill, re.MULTILINE)
    check("SKILL.md frontmatter has a single-line description", match is not None)
    if match:
        length = len(match.group(1))
        check(f"description stays within 500 chars ({length})", length <= 500, ...)
```

This checks **size only** (≤500 chars; current: 472). No test verifies the description actually triggers for `should_trigger: true` queries or stays silent for false queries. ✓

**Evidence:** Inspected `test_docs.py` line range 145–165; confirmed `test_token_budgets` is the only description guard.

---

### e. Literature claims are accurate

**STATUS: TRUE**

#### `skill-creator` claims:

**Claim:** "Each query run 3x (`runs_per_query`); split 60/40 train/held-out test; selected by test score to avoid overfitting."

**Evidence:** `skill-creator/SKILL.md` § "Step 3: Run the optimization loop" (lines ~380–420):
```
It splits the eval set into 60% train and 40% held-out test, evaluates 
the current description (running each query 3 times to get a reliable 
trigger rate), then calls Claude to propose improvements...
When it's done, it opens an HTML report in the browser showing the 
results per iteration and returns JSON with `best_description` — selected 
by test score rather than train score to avoid overfitting.
```

✓ **All three sub-claims verified.**

#### `mcp-builder` claims:

**Claim 1:** "Stable, string-comparison-verifiable, solve-yourself QA pairs."

**Evidence:** `mcp-builder/reference/evaluation.md`:
- **Stability** (§12): "Do not ask questions that rely on 'current state' which is dynamic... do not count... Number of reactions to a post... Number of members in a channel."
- **String-comparison verifiability** (§1 "Answer Guidelines"): "Answers must be VERIFIABLE via direct string comparison."
- **Solve-yourself validation** (Step 1): Implicit in evaluation methodology; Step 4 context shows evaluations must be self-solved before use.

✓ **All three sub-claims verified.**

---

## T2 Compliance

**STATUS: PASS**

T2 guard (test_docs.py): *"Every relative markdown link across the repo resolves to a file."*

Test for `docs/analisis-tests-evaluaciones-modelo.md`:
```bash
$ grep -c '](' docs/analisis-tests-evaluaciones-modelo.md
0
```

Document uses inline-code (backticks) and fenced code blocks; zero markdown links. ✓

---

## Verifier Output

**STATUS: PASS**

```
ALL SUITES PASSED
    test: OK
VERIFIER: all gates passed
EXIT=0
```

Breakdown:
- test_docs.py: 114 checks passed
- test_init.sh: 14 passed
- test_update.sh: 7 passed
- test_feature.sh: 12 passed
- test_backlog.sh: 7 passed
- test_index.sh: 5 passed
- test_upgrade.sh: 10 passed
- test_tools_discovery.sh: 6 passed

**Total: 175 checks, 0 failures.**

---

## Notes

### Research Quality

The document demonstrates high epistemic discipline:
- Clearly separates observed facts (§2) from literature (§3) from analysis (§4)
- Distinguishes deterministic vs. stochastic concerns explicitly (a key design insight)
- Proposes a testable boundary (contrat deterministe, mesure stochastique) that mirrors existing Handyman patterns (`validate_harness.py` with graceful degradation)
- Identifies a root cause (loose data with no contract) and a proportionate solution (schema → validator → advisory → reference)
- All five candidate features (A–E) have coherent mirrors in prior work (features 10, 33–37)

### Deliverable Status

- **File:** `docs/analisis-tests-evaluaciones-modelo.md` ✓ (new, 352 lines, on disk)
- **Impl report:** `.handyman/backlog/impl_new_test_evals_revision.md` ✓ (complete, frontmatter + body)
- **Product code:** Untouched (research-only feature) ✓
- **SKILL.md:** Untouched (no scope creep) ✓

### Handoff

Implementation should begin with **feature A** (schema + structural test), since it delivers the deterministic half—the piece that *always* runs and gives guarantees today. Features B–E build on A and improve the stochastic side (measurement + advisory + documentation).

The literature spine is solid; the boundary between determinism and stochasticism is crisp; the plan scales gracefully. Ready for handoff.

