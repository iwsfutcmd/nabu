/**
 * Visual matrix (gameplan §15, §16 Phase 0). Runs against the static Storybook
 * build. Screenshots are only comparable inside the pinned Playwright image
 * (same Chromium, same fontconfig), so pixel comparison is enabled only when
 * NABU_VISUAL_ENV=container; the DOM, font and ink checks run everywhere.
 *
 *   pnpm test:visual:docker   # build Storybook, run inside mcr.microsoft.com/playwright:v1.63.0-noble
 *   pnpm test:visual:update   # same, rewriting baselines
 */
import { defineConfig } from "@playwright/test";

const PORT = 6007;

export default defineConfig({
  testDir: "tests/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide", scale: "css" },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: "chromium",
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `node tests/visual/serve.mjs storybook-static ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.json`,
    reuseExistingServer: !process.env["CI"],
  },
});
