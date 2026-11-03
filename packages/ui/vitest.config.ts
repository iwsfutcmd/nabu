import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.{ts,tsx}"] },
  css: { modules: { generateScopedName: "[local]" } },
});
