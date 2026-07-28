import { defineConfig } from 'vitest/config';

// Live-model evals: each case runs a full leader->implementer->reviewer loop
// (several minutes), so the timeout dwarfs a unit-test budget.
export default defineConfig({
  test: {
    include: ['src/evals/**/*.eval.ts'],
    reporters: ['default', 'vitest-evals/reporter'],
    testTimeout: 900_000,
    hookTimeout: 120_000,
  },
});
