#!/usr/bin/env bash
# Trigger-evaluation tests for the Handyman skill.
# Exercises scripts/evals.py:
#   validate  the deterministic eval-set contract (shipped set + failure modes)
#   measure   the graceful NOTE degradation and the runner-driven confusion matrix
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
EV="$SUITE_DIR/../handyman/scripts/evals.py"

echo "Evals suite (test_evals.sh)"

# --- T1: validate accepts the shipped eval set ------------------------------
start_case "validate exits 0 on the shipped trigger-eval set"
python3 "$EV" validate >/dev/null 2>&1
assert_exit 0 $? "shipped eval set should be well-formed"

# --- T2: validate accepts a well-formed fixture -----------------------------
start_case "validate exits 0 on a balanced, unique fixture"
T="$(mktemp -d)"
printf '[{"query":"a","should_trigger":true},{"query":"b","should_trigger":false}]\n' > "$T/ok.json"
python3 "$EV" validate --eval-set "$T/ok.json" >/dev/null 2>&1
assert_exit 0 $? "balanced fixture should pass"
rm -rf "$T"

# --- T3: validate rejects a one-class (unbalanced) set ----------------------
start_case "validate exits non-zero when a class is missing"
T="$(mktemp -d)"
printf '[{"query":"a","should_trigger":true},{"query":"b","should_trigger":true}]\n' > "$T/unbalanced.json"
OUT="$(python3 "$EV" validate --eval-set "$T/unbalanced.json" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -qi "negative"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T4: validate rejects duplicate queries ---------------------------------
start_case "validate exits non-zero and flags a duplicate query"
T="$(mktemp -d)"
printf '[{"query":"a","should_trigger":true},{"query":"a","should_trigger":false}]\n' > "$T/dup.json"
OUT="$(python3 "$EV" validate --eval-set "$T/dup.json" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -qi "duplicate"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T5: validate rejects a malformed item ----------------------------------
start_case "validate exits non-zero on a wrong-type / extra-key item"
T="$(mktemp -d)"
printf '[{"query":"a","should_trigger":"yes","note":"x"},{"query":"b","should_trigger":false}]\n' > "$T/mal.json"
OUT="$(python3 "$EV" validate --eval-set "$T/mal.json" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -qiE "should_trigger|unexpected"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T6: measure degrades with a NOTE when no runner ------------------------
start_case "measure degrades with a NOTE and exits 0 without a runner"
T="$(mktemp -d)"
printf '[{"query":"a","should_trigger":true},{"query":"b","should_trigger":false}]\n' > "$T/ok.json"
OUT="$(python3 "$EV" measure --eval-set "$T/ok.json" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "NOTE:"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T7: measure scores a confusion matrix with a runner --------------------
start_case "measure computes a confusion matrix from a runner"
T="$(mktemp -d)"
cat > "$T/runner.sh" <<'EOF'
#!/usr/bin/env bash
# Fixture model runner: triggers only when the query mentions a harness.
case "$*" in *harness*|*handyman*) echo TRIGGER ;; *) echo NO ;; esac
EOF
printf '[{"query":"bootstrap a handyman harness","should_trigger":true},{"query":"refactor a python module","should_trigger":false}]\n' > "$T/good.json"
OUT="$(python3 "$EV" measure --eval-set "$T/good.json" --runner "bash $T/runner.sh" --runs 3 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "confusion: TP=1 FP=0 TN=1 FN=0" \
  && printf '%s' "$OUT" | grep -q "accuracy=1.00"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- T8: --report-passk derives pass@1/pass@k from the measured rates -------
start_case "measure --report-passk prints pass@1/pass@k without extra calls"
T="$(mktemp -d)"
cat > "$T/runner.sh" <<'EOF'
#!/usr/bin/env bash
case "$*" in *harness*|*handyman*) echo TRIGGER ;; *) echo NO ;; esac
EOF
printf '[{"query":"bootstrap a handyman harness","should_trigger":true},{"query":"refactor a python module","should_trigger":false}]\n' > "$T/good.json"
OUT="$(python3 "$EV" measure --eval-set "$T/good.json" --runner "bash $T/runner.sh" --runs 3 --report-passk 2>&1)"; CODE=$?
# positives always fired -> pass@1=pass@3=1.00; negatives never fired -> fp@1=fp@3=0.00
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "pass@1=1.00 pass@3=1.00" \
  && printf '%s' "$OUT" | grep -q "fp@1=0.00 fp@3=0.00"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

summary
