#!/usr/bin/env bash
# Minimal assertion helpers for the Handyman skill test suite.
# POSIX/bash 3.2 compatible (macOS default bash).

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
CURRENT_CASE=""

_color() { # $1=code $2=text
  if [ -t 1 ]; then printf '\033[%sm%s\033[0m' "$1" "$2"; else printf '%s' "$2"; fi
}

start_case() {
  CURRENT_CASE="$1"
  TESTS_RUN=$((TESTS_RUN + 1))
}

pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  printf '  %s %s\n' "$(_color 32 'PASS')" "$CURRENT_CASE"
}

fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  printf '  %s %s\n' "$(_color 31 'FAIL')" "$CURRENT_CASE"
  if [ -n "${1:-}" ]; then printf '       %s\n' "$1"; fi
}

assert_eq() { # $1=expected $2=actual $3=msg
  if [ "$1" = "$2" ]; then pass; else fail "${3:-} (expected '$1', got '$2')"; fi
}

assert_exit() { # $1=expected_code $2=actual_code $3=msg
  if [ "$1" -eq "$2" ]; then pass; else fail "${3:-} (expected exit $1, got $2)"; fi
}

assert_true() { # $1=condition_result(0/1 via &&) used as: assert_true "msg"; preceded by `if cmd; then ok=1...`
  : # not used directly
}

summary() {
  printf '\n%s: %d run, %s, %s\n' \
    "Summary" "$TESTS_RUN" \
    "$(_color 32 "${TESTS_PASSED} passed")" \
    "$(_color 31 "${TESTS_FAILED} failed")"
  [ "$TESTS_FAILED" -eq 0 ]
}
