import { defineConfig } from "vitest/config";

// PGlite starts a WASM Postgres per test file: give it time when the whole repo's tests share the CPU.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], hookTimeout: 60_000, testTimeout: 30_000 } });
