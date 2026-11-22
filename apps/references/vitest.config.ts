import { defineConfig } from "vitest/config";

// These tests assert results, never speed. On a CI runner where every package's tests start at once
// they run many times slower than alone (CI runs 252, 258, 262: a test passed the default five seconds).
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 60_000 } });
