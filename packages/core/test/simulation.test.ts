/**
 * Phase 4 acceptance (gameplan §16): in simulations of 30 days, the planner
 * holds observed success within ±5 percentage points of its target (0.85).
 * The simulated learners are in simulator.ts.
 */
import { describe, expect, it } from "vitest";
import type { LearnerEvent } from "@nabu/schema";
import { learnedWords, replay, wordCounts } from "../src/learner/index.ts";
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
    // Cuban Spanish (ADR 0076): thirty units; a month covers the first ten or so.
    ["es", undefined, 12, 1.0],
    ["es", undefined, 13, 2.0],
    // Biblical Hebrew (ADR 0082): Tiberian-pointed text, every word with a pinned reading.
    ["hbo", undefined, 14, 1.0],
    ["hbo", undefined, 15, 2.0],
    // Toki Pona (ADR 0086): in sitelen Lasina and in sitelen pona.
    ["tok", "tok-Latn/standard", 16, 1.3],
    ["tok", "tok-Qaap/sitelen-pona", 17, 1.6],
    // Attic Greek (ADR 0087): polytonic, every word with its vowel lengths pinned.
    ["grc", undefined, 18, 1.0],
    ["grc", undefined, 19, 2.0],
  ];
  for (const [course, orthography, seed, ability] of RUNS) {
    it(`${course} ${orthography ?? ""} (seed ${seed}, ability ${ability}) stays within ±5pp of 85%`, () => {
      // Which KCs each lesson session presented: every new KC an exercise can carry must appear.
      const presented = new Map<string, Set<string>>();
      const log: LearnerEvent[] = [];
      let node = "";
      const r = simulate(course, orthography, seed, ability, (e) => {
        log.push(e);
        if (e.type === "session_started") node = e.mode === "lesson" ? (e.node ?? "") : "";
        // A word is presented by a card credited to it: not as the context of another word's card.
        if (e.type === "answer_submitted" && node !== "")
          for (const { kc, status } of e.outcome.kcs) if (status !== "given") (presented.get(node) ?? presented.set(node, new Set()).get(node))?.add(kc);
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
      // Words get typed (ADR 0101): every learner is asked to produce, and some word shows it can be
      // written. The success rate alone hid a month with no typing at all (the review's L5, L12).
      const typed = (r.templates["translate-type.l1-l2"] ?? 0) + (r.templates["complete-translation"] ?? 0);
      expect(typed).toBeGreaterThanOrEqual(5);
      const written = learnedWords(view, replay(log), "2026-02-01T00:00:00.000Z").filter((w) => w.skills.some((k) => k.skill === "produce" && k.shown));
      expect(written.length).toBeGreaterThan(0);
    }, SIMULATION_TIMEOUT_MS);
  }
});

/**
 * Adaptive pacing (ADR 0105): learners who follow Continue, at their pace, against the same learners
 * taking the next lesson every time. A weak, slow learner is not crushed and knows more words by day
 * 30; a strong, fast one is neither held back nor drowned in easy review; the backlog stays lower.
 */
describe("pacing: 30 simulated days following Continue", () => {
  const END = "2026-01-31T08:00:00.000Z";
  const run = (course: string, ability: number, learning: number, follow: "path" | "continue") => {
    const log: LearnerEvent[] = [];
    const r = simulate(course, undefined, 31, ability, (e) => log.push(e), { follow, learning });
    const words = learnedWords(loadCourse(course), replay(log), END);
    return { rate: r.correct / r.firstTries, lessons: r.lessons, ...wordCounts(words) };
  };
  for (const course of ["es", "hbo"]) {
    it(`${course}: a weak, slow learner stays near the target and knows more words`, () => {
      const path = run(course, 0.5, 0.6, "path");
      const paced = run(course, 0.5, 0.6, "continue");
      expect(paced.rate).toBeGreaterThanOrEqual(0.8);
      expect(paced.known).toBeGreaterThanOrEqual(path.known);
      expect(paced.due).toBeLessThan(path.due);
    }, 2 * SIMULATION_TIMEOUT_MS);
    it(`${course}: a strong, fast learner moves on and is not drowned in easy review`, () => {
      const path = run(course, 2.5, 1.5, "path");
      const paced = run(course, 2.5, 1.5, "continue");
      expect(paced.lessons).toBeGreaterThanOrEqual(30);
      expect(paced.rate).toBeLessThanOrEqual(0.92);
      expect(paced.known).toBeGreaterThanOrEqual(path.known);
      expect(paced.due).toBeLessThan(path.due);
    }, 2 * SIMULATION_TIMEOUT_MS);
  }
});
