/**
 * Phase 4 acceptance (gameplan §16): in simulations of 30 days, the planner
 * holds observed success within ±5 percentage points of its target (0.85).
 * The simulated learners are in simulator.ts.
 */
import { describe, expect, it } from "vitest";
import { simulate } from "./simulator.ts";

/**
 * Learners from weak (θ* = 1.0) to strong (θ* = 2.0), on every course and
 * orthography. One unit of content is small, so after the lessons most of the
 * month is review: the planner keeps success near the target by reviewing due
 * facets with harder or easier templates, and by mixing in easier fillers.
 */
describe("planner: 30 simulated days", () => {
  const RUNS: readonly (readonly [string, string | undefined, number, number])[] = [
    ["fa", undefined, 1, 1.0],
    ["fa", undefined, 2, 1.6],
    ["yue", undefined, 3, 1.3],
    ["uz", "uz-Latn/standard", 4, 1.0],
    ["uz", "uz-Cyrl/standard", 5, 1.6],
    ["apc", "apc-Arab/standard", 6, 1.3],
    ["apc", "apc-Latn/arabizi", 7, 1.0],
    ["fa", undefined, 8, 2.0],
    ["yue", undefined, 9, 2.0],
  ];
  for (const [course, orthography, seed, ability] of RUNS) {
    it(`${course} ${orthography ?? ""} (seed ${seed}, ability ${ability}) stays within ±5pp of 85%`, () => {
      const r = simulate(course, orthography, seed, ability);
      const rate = r.correct / r.firstTries;
      console.log(
        `${course} ${orthography ?? ""} θ*=${ability}: ${r.sessions} sessions (${r.lessons} lessons), ${r.firstTries} first tries, success ${(rate * 100).toFixed(1)}%, predicted ${((r.predicted / r.firstTries) * 100).toFixed(1)}%`,
        Object.entries(r.byMode).map(([k, v]) => `${k}: n=${v.n} ok=${((v.ok / v.n) * 100).toFixed(1)}% p̂=${((v.p / v.n) * 100).toFixed(1)}%`).join("; "),
      );
      expect(r.firstTries).toBeGreaterThan(150);
      expect(Math.abs(rate - 0.85)).toBeLessThanOrEqual(0.05);
    });
  }
});
