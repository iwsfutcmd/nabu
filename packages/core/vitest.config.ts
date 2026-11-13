import { defineConfig } from "vitest/config";

export default defineConfig({
  // Whole-course tests plan every lesson of a course (test/planned.ts walks them): a few seconds each
  // alone, but CI runs them beside the simulation and every other package's tests, where they took 5-50 s.
  test: { include: ["test/**/*.test.ts"], testTimeout: 120_000 },
});
