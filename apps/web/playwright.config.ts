/**
 * Phase 3 acceptance (gameplan §16): one lesson per fixture course, by keyboard
 * and by touch; the IME composition test; axe on every screen. Runs against the
 * production build served by `vite preview`.
 */
import { defineConfig } from "@playwright/test";

const PORT = 4174;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  timeout: 120_000,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: "chromium",
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
  },
  projects: [
    { name: "keyboard", use: { viewport: { width: 1280, height: 900 } } },
    { name: "touch", use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/bundles/index.json`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
