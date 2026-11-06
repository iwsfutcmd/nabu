/**
 * Phase 4 acceptance (gameplan §16): in simulations of 30 days, the planner
 * holds observed success within ±5 percentage points of its target (0.85).
 * The simulated learners are in simulator.ts.
 */
import { describe, expect, it } from "vitest";
import { allKcs, allSentences, lessonNodes } from "../src/lesson/index.ts";
import { loadCourse } from "./learner-fixtures.ts";
import { simulate } from "./simulator.ts";

/** A month of sessions takes a few seconds; more on a busy CI runner. */
const SIMULATION_TIMEOUT_MS = 60_000;

/**
 * Learners from weak (θ* = 1.0) to strong (θ* = 2.0), on every course and
 * orthography. With ten units a month is mostly new lessons, two a day: the
 * planner presents every new KC first, then keeps success near the target with
 * easier or harder templates and review fillers (CALIBRATION_WEIGHT).
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
    // Classical Chinese (ADR 0071): recognize and produce only, no audio.
    ["lzh", undefined, 10, 1.3],
    ["lzh", undefined, 11, 2.0],
    // Cuban Spanish (ADR 0075): thirty units; a month covers the first ten or so.
    ["es", undefined, 12, 1.0],
    ["es", undefined, 13, 2.0],
  ];
  for (const [course, orthography, seed, ability] of RUNS) {
    it(`${course} ${orthography ?? ""} (seed ${seed}, ability ${ability}) stays within ±5pp of 85%`, () => {
      // Which KCs each lesson session presented: every new KC an exercise can carry must appear.
      const presented = new Map<string, Set<string>>();
      let node = "";
      const r = simulate(course, orthography, seed, ability, (e) => {
        if (e.type === "session_started") node = e.mode === "lesson" ? (e.node ?? "") : "";
        if (e.type === "answer_submitted" && node !== "") for (const kc of e.exercise.kcs) (presented.get(node) ?? presented.set(node, new Set()).get(node))?.add(kc);
      });
      const view = loadCourse(course, orthography);
      const carried = new Set([...allSentences(view).flatMap((s) => s.kcs), ...allKcs(view).filter((k) => (k.forms?.[view.orthography]?.length ?? 0) > 0).map((k) => k.id)]);
      const skipped = lessonNodes(view).flatMap(({ node: n }) => (presented.has(n.id) ? n.introduces.filter((kc) => carried.has(kc) && !presented.get(n.id)?.has(kc)).map((kc) => `${n.id} ${kc}`) : []));
      expect(skipped.filter((s) => !s.startsWith("drill."))).toEqual([]);
      const rate = r.correct / r.firstTries;
      console.log(
        `${course} ${orthography ?? ""} θ*=${ability}: ${r.sessions} sessions (${r.lessons} lessons), ${r.firstTries} first tries, success ${(rate * 100).toFixed(1)}%, predicted ${((r.predicted / r.firstTries) * 100).toFixed(1)}%`,
        Object.entries(r.byMode).map(([k, v]) => `${k}: n=${v.n} ok=${((v.ok / v.n) * 100).toFixed(1)}% p̂=${((v.p / v.n) * 100).toFixed(1)}%`).join("; "),
      );
      expect(r.firstTries).toBeGreaterThan(150);
      expect(Math.abs(rate - 0.85)).toBeLessThanOrEqual(0.05);
    }, SIMULATION_TIMEOUT_MS);
  }
});
