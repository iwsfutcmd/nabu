/**
 * Adaptive tests (ADR 0076): blocks of questions asked in an order the answers decide. The
 * placement test is one: a block per unit of the path, searched for the first unit the learner
 * does not pass, then stepped through node by node inside that unit.
 *
 * The test is data and `runTest` is a pure function of it and the first-try answers so far, so
 * the player, the shell that records where the learner placed, and the tests all replay it the
 * same way.
 *
 * The search assumes blocks get harder in path order. It gallops (blocks 0, 1, 3, 7, 15, … and
 * the last) until a block is not passed, then bisects between the last block passed and the first
 * not passed. Every block before the last one passed counts as passed. A block is decided as soon
 * as its outcome is certain, so a learner answers only as many of its questions as it takes.
 */
import type { Exercise } from "./exercise.ts";

export interface TestStep {
  /** What passing the step places (a lesson node). */
  readonly id: string;
  readonly exercise: Exercise;
}

export interface TestBlock {
  /** The block (a unit). */
  readonly id: string;
  readonly exercises: readonly Exercise[];
  /** What passing the block places (its lesson nodes), with every earlier block's. */
  readonly places: readonly string[];
  /**
   * Asked one at a time, in order, once the search ends on this block (the first not passed),
   * until one is missed. A step whose exercise is one of the block's reuses its answer.
   */
  readonly steps: readonly TestStep[];
}

export interface AdaptiveTest {
  readonly blocks: readonly TestBlock[];
  /** The share of a block's exercises that must be right the first time (0.75: three of four). */
  readonly pass: number;
}

export interface TestRun {
  /** The exercises to ask next, in order; empty once the test is over. */
  readonly next: readonly Exercise[];
  /** At most this many more exercises after `next`: for the progress bar. */
  readonly later: number;
  /** The index of the last block passed (−1: none). Every earlier block counts as passed. */
  readonly passed: number;
  /** The ids of the steps passed, in order, in the block after `passed`. */
  readonly stepped: readonly string[];
  readonly done: boolean;
}

type Outcome = { readonly tag: "pass" } | { readonly tag: "fail" } | { readonly tag: "open"; readonly rest: readonly Exercise[] };

const outcomeOf = (block: TestBlock, pass: number, answers: ReadonlyMap<string, boolean>): Outcome => {
  const n = block.exercises.length;
  if (n === 0) return { tag: "pass" };
  const need = Math.min(n, Math.max(1, Math.ceil(pass * n - 1e-9)));
  let right = 0;
  let wrong = 0;
  for (const ex of block.exercises) {
    const a = answers.get(ex.id);
    if (a === true) right++;
    else if (a === false) wrong++;
  }
  if (right >= need) return { tag: "pass" };
  if (wrong > n - need) return { tag: "fail" };
  return { tag: "open", rest: block.exercises.filter((ex) => !answers.has(ex.id)) };
};

/** The galloping probe after the last block passed: 0, 1, 3, 7, 15, …, then the last block. */
const gallop = (lo: number, n: number): number => {
  let g = 0;
  while (g <= lo) g = 2 * g + 1;
  return Math.min(g, n - 1);
};

const log2ceil = (x: number): number => (x <= 1 ? 0 : Math.ceil(Math.log2(x)));

/** Where the test stands after these first-try answers (exercise id → right), and what to ask next. */
export const runTest = (test: AdaptiveTest, answers: ReadonlyMap<string, boolean>): TestRun => {
  const { blocks, pass } = test;
  const n = blocks.length;
  const perBlock = Math.max(0, ...blocks.map((b) => b.exercises.length));
  const perSteps = Math.max(0, ...blocks.map((b) => b.steps.length));
  let lo = -1;
  let hi = n;
  for (;;) {
    let b: number;
    if (hi === n) {
      if (lo === n - 1) return { next: [], later: 0, passed: lo, stepped: [], done: true };
      b = gallop(lo, n);
    } else {
      if (hi - lo <= 1) break;
      b = (lo + hi) >> 1;
    }
    const outcome = outcomeOf(blocks[b] as TestBlock, pass, answers);
    if (outcome.tag === "open") {
      // At most: the rest of the gallop, a bisection of the widest gap it can leave, and the steps.
      let left = 0;
      if (hi === n) {
        for (let g = b; g < n - 1; ) {
          g = gallop(g, n);
          left++;
        }
        left += log2ceil(Math.max(b - lo, Math.ceil((n - 1 - b) / 2)));
      } else {
        left = log2ceil(Math.max(b - lo, hi - b)) - 1;
      }
      return { next: outcome.rest, later: Math.max(0, left) * perBlock + perSteps, passed: lo, stepped: [], done: false };
    }
    if (outcome.tag === "pass") lo = b;
    else hi = b;
  }
  const stepped: string[] = [];
  const steps = (blocks[hi] as TestBlock).steps;
  for (const [i, s] of steps.entries()) {
    const a = answers.get(s.exercise.id);
    if (a === undefined) return { next: [s.exercise], later: steps.length - i - 1, passed: lo, stepped, done: false };
    if (!a) break;
    stepped.push(s.id);
  }
  return { next: [], later: 0, passed: lo, stepped, done: true };
};

/** What a test's answers place: every passed block's `places`, then the steps passed after them. */
export const placedBy = (test: AdaptiveTest, answers: ReadonlyMap<string, boolean>): readonly string[] => {
  const run = runTest(test, answers);
  return [...test.blocks.slice(0, run.passed + 1).flatMap((b) => b.places), ...run.stepped];
};
