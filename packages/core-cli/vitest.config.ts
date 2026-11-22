import { defineConfig } from "vitest/config";

// These tests assert results, never speed (grading's speed has its own budget: `pnpm test:perf`). On a CI
// runner where every package's tests start at once they run some fifteen times slower than alone, and a
// property test or one that starts the CLI passed the default five seconds (CI run 258).
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 60_000 } });
