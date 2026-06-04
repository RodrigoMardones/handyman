# Verification

The agent does not claim it works; it demonstrates it.

## Required Commands

```bash
./init.sh
```

## Test Levels

1. Unit tests for public behavior.
2. Integration tests for user-facing flows.
3. Optional smoke test for end-to-end confidence.

## Anti-patterns

- Marking `done` with red tests.
- Tests that only assert no exception.
- Mocking the core behavior that should be proven.
