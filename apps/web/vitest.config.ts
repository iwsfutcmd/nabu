import { defineConfig } from "vitest/config";

// Unit tests of the shell's own logic (tests/unit); the browser flows are Playwright's (tests/e2e).
// These tests assert results, never speed. On a CI runner where every package's tests start at once
// they run many times slower than alone (CI runs 252, 258, 262: a test passed the default five seconds).
export default defineConfig({ test: { include: ["tests/unit/**/*.test.ts"], testTimeout: 60_000 } });
