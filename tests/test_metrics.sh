#!/usr/bin/env bash
# Metrics aggregator tests for the Handyman skill.
# Exercises scripts/metrics.py: read-only aggregation of feature_list.json,
# progress/history.md dated headings and backlog/*.md frontmatter into
# status counts, throughput, review verdicts and report coverage. ALWAYS exit 0.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
MX="$SUITE_DIR/../handyman/scripts/metrics.py"

echo "Metrics suite (test_metrics.sh)"

# --- fixture builder ---------------------------------------------------------
# A workspace with 2 done + 1 pending features, 2 dated closures on the same
# date, an approved + a changes_requested review, and one done feature with a
# full impl+review pair. Writes into $1.
write_fixture() {
  root="$1"
  ws="$root/.handyman"
  mkdir -p "$ws/progress" "$ws/backlog"
  printf '{
  "install_mode": "local", "project_name": "fixture", "project_root": ".",
  "harness_workspace": ".handyman"
}\n' > "$root/harness.config.json"
  printf '{
  "project": "fixture",
  "features": [
    {"id": 1, "name": "alpha", "title": "alpha", "status": "done"},
    {"id": 2, "name": "beta", "title": "beta", "status": "done"},
    {"id": 3, "name": "gamma", "title": "gamma", "status": "pending"}
  ]
}\n' > "$ws/feature_list.json"
  cat > "$ws/progress/history.md" <<'EOF'
---
tags: [handyman/session/history]
---
# History

## YYYY-MM-DD - Feature N: feature_name
- template line, must not count

## 2026-06-17 - Feature 1: alpha
- **Closure:** done

## 2026-06-17 - Feature 2: beta
- **Closure:** done
EOF
  printf -- '---\nfeature: alpha\nstatus: implemented\nrole: implementer\nupdated: 2026-06-17\ntags: [handyman/role/implementer]\n---\n# Impl\n' > "$ws/backlog/impl_alpha.md"
  printf -- '---\nfeature: alpha\nstatus: approved\nrole: reviewer\nupdated: 2026-06-17\ntags: [handyman/role/reviewer]\n---\n# Review\n' > "$ws/backlog/review_alpha.md"
  printf -- '---\nfeature: beta\nstatus: changes_requested\nrole: reviewer\nupdated: 2026-06-17\ntags: [handyman/role/reviewer]\n---\n# Review\n' > "$ws/backlog/review_beta.md"
}

# --- M1: reports the four blocks and exits 0 --------------------------------
start_case "metrics prints status/throughput/review/coverage blocks and exits 0"
T="$(mktemp -d)"; write_fixture "$T"
OUT="$(python3 "$MX" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "status: pending=1 in_progress=0 done=2 blocked=0 (total 3)" \
  && printf '%s' "$OUT" | grep -q "throughput" \
  && printf '%s' "$OUT" | grep -q "review verdicts" \
  && printf '%s' "$OUT" | grep -q "coverage:"; then
  pass
else
  fail "exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- M2: throughput counts dated headings, ignores the template line --------
start_case "throughput derives from dated history headings only"
T="$(mktemp -d)"; write_fixture "$T"
OUT="$(python3 "$MX" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "2026-06-17  2" \
  && ! printf '%s' "$OUT" | grep -q "YYYY-MM-DD"; then
  pass
else
  fail "expected '2026-06-17  2' and no template date; exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- M3: review verdicts and approval rate ----------------------------------
start_case "review verdicts: 1 approved + 1 changes_requested -> 50%"
T="$(mktemp -d)"; write_fixture "$T"
OUT="$(python3 "$MX" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "approved=1 changes_requested=1 (approval rate 50%)"; then
  pass
else
  fail "expected 50% approval rate; exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- M4: coverage flags the done feature missing its report pair ------------
start_case "coverage: beta (done, no impl_ report) is flagged missing"
T="$(mktemp -d)"; write_fixture "$T"
OUT="$(python3 "$MX" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "2 done, 1 with impl+review reports" \
  && printf '%s' "$OUT" | grep -q "missing reports: beta"; then
  pass
else
  fail "expected beta flagged; exit=$CODE out=$OUT"
fi
rm -rf "$T"

# --- M5: --json emits machine-readable output with the four keys ------------
start_case "--json emits parseable JSON with the four metric keys"
T="$(mktemp -d)"; write_fixture "$T"
OUT="$(python3 "$MX" --root "$T" --json 2>&1)"; CODE=$?
JSON_OK="$(printf '%s' "$OUT" | python3 -c '
import json, sys
d = json.load(sys.stdin)
keys = {"status_counts", "throughput", "review_verdicts", "coverage"}
ok = keys.issubset(d) and d["throughput"].get("2026-06-17") == 2 \
  and d["review_verdicts"]["approval_rate"] == 0.5 \
  and d["coverage"]["missing"] == ["beta"]
print("yes" if ok else "no")
' 2>/dev/null)"
if [ "$CODE" -eq 0 ] && [ "$JSON_OK" = "yes" ]; then
  pass
else
  fail "expected valid JSON; exit=$CODE json_ok=$JSON_OK out=$OUT"
fi
rm -rf "$T"

# --- M6: read-only and degrades gracefully on an empty harness --------------
start_case "empty harness (no history/backlog/feature_list) still exits 0"
T="$(mktemp -d)"
OUT="$(python3 "$MX" --root "$T" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && printf '%s' "$OUT" | grep -q "(total 0)" \
  && printf '%s' "$OUT" | grep -q "no dated closures"; then
  pass
else
  fail "expected graceful empty report; exit=$CODE out=$OUT"
fi
rm -rf "$T"

summary
