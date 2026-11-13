import { defineConfig } from "vitest/config";

// Unit tests of the shell's own logic (tests/unit); the browser flows are Playwright's (tests/e2e).
export default defineConfig({ test: { include: ["tests/unit/**/*.test.ts"] } });
