/**
 * Adaptive tests (ADR 0077): the search behind placement, on synthetic blocks. A learner who
 * knows the first k blocks places after exactly those, for every k and every course length,
 * in a number of questions that grows with the logarithm of the course.
 */
import { describe, expect, it } from "vitest";
import { placedBy, runTest, type AdaptiveTest, type Exercise, type TestBlock } from "../src/lesson/index.ts";

const ex = (id: string): Exercise => ({ id }) as unknown as Exercise;

const blocks = (n: number, size = 4, steps = 3): AdaptiveTest => ({
  pass: 0.75,
  blocks: Array.from(
    { length: n },
    (_, b): TestBlock => ({
      id: `u${b}`,
      exercises: Array.from({ length: size }, (_, i) => ex(`u${b}.e${i}`)),
      places: Array.from({ length: steps }, (_, i) => `u${b}.n${i}`),
      steps: Array.from({ length: steps }, (_, i) => ({ id: `u${b}.n${i}`, exercise: ex(`u${b}.s${i}`) })),
    }),
  ),
});

const blockOf = (id: string): number => Number(/^u(\d+)/u.exec(id)?.[1]);

/** Asks one question at a time, as the player does. */
const take = (test: AdaptiveTest, knows: (id: string) => boolean): { readonly placed: readonly string[]; readonly asked: readonly string[] } => {
  const answers = new Map<string, boolean>();
  const asked: string[] = [];
  for (let next = runTest(test, answers).next; next.length > 0; next = runTest(test, answers).next) {
    const id = (next[0] as Exercise).id;
    expect(answers.has(id)).toBe(false);
    asked.push(id);
    answers.set(id, knows(id));
  }
  return { placed: placedBy(test, answers), asked };
};

describe("adaptive tests (ADR 0077)", () => {
  it("places a learner who knows the first k blocks after exactly those, for every k and length", () => {
    for (let n = 1; n <= 40; n++) {
      const test = blocks(n);
      for (let k = 0; k <= n; k++) {
        const { placed, asked } = take(test, (id) => blockOf(id) < k);
        expect(placed).toEqual(test.blocks.slice(0, k).flatMap((b) => b.places));
        // At most the gallop and a bisection of what it leaves, three or four questions a block, and one step.
        const probed = new Set(asked.filter((id) => id.includes(".e")).map(blockOf)).size;
        expect(probed).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(n + 1)) + 1);
        expect(asked.length).toBeLessThanOrEqual(4 * probed + 1);
      }
    }
  });

  it("probes 1, 2, 4, 8 … then bisects", () => {
    const { asked } = take(blocks(30), (id) => blockOf(id) < 11);
    expect([...new Set(asked.filter((id) => id.includes(".e")).map(blockOf))]).toEqual([0, 1, 3, 7, 15, 11, 9, 10]);
  });

  it("decides a block as soon as its outcome is certain", () => {
    const test = blocks(1);
    expect(take(test, () => true).asked).toEqual(["u0.e0", "u0.e1", "u0.e2"]);
    // Two misses of four fail the block; its first step is then missed too.
    expect(take(test, () => false).asked).toEqual(["u0.e0", "u0.e1", "u0.s0"]);
    // Three of four is a pass.
    expect(take(test, (id) => id !== "u0.e1").placed).toEqual(["u0.n0", "u0.n1", "u0.n2"]);
  });

  it("steps through the first block not passed until a step is missed, reusing a block's answer", () => {
    const test = blocks(3);
    const { placed } = take(test, (id) => blockOf(id) === 0 || id === "u1.s0" || id === "u1.s1");
    expect(placed).toEqual(["u0.n0", "u0.n1", "u0.n2", "u1.n0", "u1.n1"]);
    const shared: AdaptiveTest = { ...test, blocks: test.blocks.map((b) => ({ ...b, steps: b.steps.map((s, i) => (i === 0 ? { ...s, exercise: b.exercises[0] as Exercise } : s)) })) };
    const run = take(shared, (id) => blockOf(id) === 0 || id === "u1.s1");
    // u1.e0 was missed in the block, so the first step is missed without being asked again.
    expect(run.asked.filter((id) => id.startsWith("u1.s"))).toEqual([]);
    expect(run.placed).toEqual(["u0.n0", "u0.n1", "u0.n2"]);
  });

  it("counts at most what is left, and nothing once it is over", () => {
    const test = blocks(30);
    const first = runTest(test, new Map());
    expect(first.next.map((e) => e.id)).toEqual(["u0.e0", "u0.e1", "u0.e2", "u0.e3"]);
    expect(first.later).toBeGreaterThan(0);
    const answers = new Map<string, boolean>();
    let before = Number.POSITIVE_INFINITY;
    for (let run = runTest(test, answers); !run.done; run = runTest(test, answers)) {
      const remaining = run.next.length + run.later;
      expect(remaining).toBeLessThanOrEqual(before + 4);
      before = remaining;
      answers.set((run.next[0] as Exercise).id, blockOf((run.next[0] as Exercise).id) < 20);
    }
    expect(runTest(test, answers)).toMatchObject({ next: [], later: 0, done: true, passed: 19 });
  });
});
