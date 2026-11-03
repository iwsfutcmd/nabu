import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "perf",
  testMatch: /.*\.perf\.ts$/u,
  reporter: process.env["CI"] ? [["list"]] : "list",
  use: { browserName: "chromium" },
  timeout: 120_000,
});
