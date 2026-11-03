/**
 * TypeScript conformance harness (gameplan §15): every vector in /conformance,
 * through the core-cli protocol in-process. pipeline/tests/test_conformance.py
 * runs the same files through the core-cli subprocess. Matching rules (both
 * harnesses): objects match on the keys the vector lists, arrays element by
 * element, everything else by equality; `error` expects a failure containing it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/protocol.ts";

interface Vector {
  readonly id: string;
  readonly op: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly expected?: unknown;
  readonly error?: string;
}

const DIR = resolve(import.meta.dirname, "../../../conformance");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const suites = files.map((f) => ({ file: f, vectors: (JSON.parse(readFileSync(join(DIR, f), "utf8")) as { vectors: Vector[] }).vectors }));

/** Projects `actual` onto the shape of `expected`, so a failing diff shows only what the vector pins. */
const project = (actual: unknown, expected: unknown): unknown => {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return actual;
    return Object.fromEntries(Object.keys(expected).map((k) => [k, project((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k])]));
  }
  if (Array.isArray(expected) && Array.isArray(actual) && actual.length === expected.length) return actual.map((a, i) => project(a, expected[i]));
  return actual;
};

describe("conformance vectors", () => {
  it("number at least 300 (Phase 1 acceptance)", () => {
    expect(suites.reduce((n, s) => n + s.vectors.length, 0)).toBeGreaterThanOrEqual(300);
  });
  it("have unique ids", () => {
    const ids = suites.flatMap((s) => s.vectors.map((v) => v.id));
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  for (const { file, vectors } of suites) {
    describe(file, () => {
      it.each(vectors.map((v) => [v.id, v] as const))("%s", (_id, v) => {
        const response = handleRequest({ id: v.id, op: v.op, ...v.args });
        if (v.error !== undefined) {
          expect(response.ok, JSON.stringify(response)).toBe(false);
          if (!response.ok) expect(response.error).toContain(v.error);
          return;
        }
        expect(response.ok ? undefined : response.error).toBeUndefined();
        if (response.ok) expect(project(response.result, v.expected)).toEqual(v.expected);
      });
    });
  }
});
