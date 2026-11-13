import { defineConfig } from "vitest/config";

export default defineConfig({
  // Player and story tests load whole courses and sample their cards; a cold CI runner took 21 s for
  // one that runs in under a second here, so the limit allows for that (as lint's and the API's do).
  test: { include: ["test/**/*.test.{ts,tsx}"], testTimeout: 60_000 },
  css: { modules: { generateScopedName: "[local]" } },
});
