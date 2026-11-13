import { defineConfig } from "vitest/config";

export default defineConfig({
  // Whole-course tests plan and build every lesson of every course: about a second each alone, but
  // CI runs them beside the simulation and every other package's tests, where they took 5-50 s.
  test: { include: ["test/**/*.test.ts"], testTimeout: 120_000 },
});
