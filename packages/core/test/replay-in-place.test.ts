/**
 * The fold changes its draft in place (ADR 0119, R2 in the 2026-11 review): a first try no longer
 * copies the performance model's KC and item maps. Replaying must give exactly the state the fold
 * gave before (fold-before-r2.ts), as values and as JSON, key order included: on a long simulated
 * log, folded whole and event by event as the app records it, and on logs with every kind of event
 * the fold reads, in any order and with duplicates. The state a fold starts from is never changed.
 */
import fc from "fast-check";
import type { AnswerSubmitted, LearnerEvent, OrthographyId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { applyEvents, compareEvents, emptyLearnerState, placedKcs, replay, type LearnerState } from "../src/learner/index.ts";
import { lessonNodes, seededRng } from "../src/lesson/index.ts";
import { applyEventsBefore, replayBefore } from "./fold-before-r2.ts";
import { loadCourse } from "./learner-fixtures.ts";
import { simulate } from "./simulator.ts";

/** A long simulation plans a few hundred sessions: seconds alone, longer on a busy CI runner. */
const LONG_TIMEOUT_MS = 300_000;

/** Equal as values and as JSON, key order included (what the golden files compare). */
const same = (a: LearnerState, b: LearnerState): void => {
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(a).toEqual(b);
};

const simulated = (course: string, seed: number, ability: number, days?: number): LearnerEvent[] => {
  const log: LearnerEvent[] = [];
  simulate(course, undefined, seed, ability, (e) => log.push(e), days === undefined ? {} : { days });
  return log;
};

/** Every object and array in it frozen: a fold that wrote to the state it was given would throw. */
const frozen = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
};

describe("the fold in place equals the fold that copied (ADR 0119)", () => {
  it(
    "on three months of es, every word of the course met: whole, event by event, shuffled with duplicates",
    () => {
      const log = simulated("es", 41, 2.0, 90);
      const state = replay(log);
      // Long enough that the model's maps hold every word of the course and a thousand items.
      expect(Object.keys(state.performance.kc).length).toBeGreaterThan(700);
      expect(Object.keys(state.performance.item).length).toBeGreaterThan(1000);
      same(state, replayBefore(log));
      // The app folds each event as it is recorded, into the state it holds.
      const split = log.length - 400;
      let now = replay(log.slice(0, split));
      let before = replayBefore(log.slice(0, split));
      for (const e of log.slice(split)) {
        now = applyEvents(now, [e]);
        before = applyEventsBefore(before, [e]);
      }
      same(now, before);
      same(now, state);
      const rng = seededRng(7);
      const messy = rng.shuffle([...log, ...rng.shuffle(log).slice(0, 500)]);
      same(replay(messy), state);
    },
    LONG_TIMEOUT_MS,
  );

  it("never changes the state it starts from", () => {
    const log = simulated("fa", 3, 1.3);
    const half = Math.floor(log.length / 2);
    const start = frozen(replay(log.slice(0, half)));
    const copy = JSON.stringify(start);
    same(applyEvents(start, log.slice(half)), replayBefore(log));
    expect(JSON.stringify(start)).toBe(copy);
  });

  describe("on every kind of event the fold reads, in any order", () => {
    const course = loadCourse("fa");
    // A simulated month (it sets no goal: every event belongs to a session).
    const base = simulated("fa", 5, 1.0).filter((e): e is Exclude<LearnerEvent, { type: "goal_set" }> => e.type !== "goal_set");
    const answers = base.filter((e): e is AnswerSubmitted => e.type === "answer_submitted");
    const nodes = lessonNodes(course).map((n) => n.node.id);
    const at = (iso: string, seconds: number): string => new Date(Date.parse(iso) + seconds * 1000).toISOString();
    let n = 0;
    const fresh = (): string => `00000000-0000-7000-b000-${(++n).toString(16).padStart(12, "0")}`;
    const meta = (e: (typeof base)[number], seconds: number) => {
      const clientTime = at(e.clientTime, seconds);
      return { id: fresh(), schema: 1 as const, device: "other", course: course.id, orthography: course.orthography as OrthographyId, support: course.supportKey, bundle: "b", session: e.session, clientTime, localDate: clientTime.slice(0, 10), tz: "UTC" };
    };

    /** The simulated month with answers hinted, self-rated, skipped, claimed and revised, a placement test, a reset and stopped sessions. */
    const mutated = fc
      .record({
        hinted: fc.array(fc.nat(), { maxLength: 30 }),
        rated: fc.array(fc.tuple(fc.nat(), fc.constantFrom("again" as const, "hard" as const, "good" as const)), { maxLength: 15 }),
        skipped: fc.array(fc.tuple(fc.nat(), fc.constantFrom("skip" as const, "cant-listen" as const, "cant-speak" as const)), { maxLength: 30 }),
        claims: fc.array(fc.tuple(fc.nat(), fc.constantFrom("accept" as const, "reject" as const, undefined), fc.integer({ min: 1, max: 90_000 })), { maxLength: 30 }),
        revised: fc.array(fc.tuple(fc.nat(), fc.boolean(), fc.integer({ min: 1, max: 90_000 })), { maxLength: 20 }),
        placement: fc.option(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 6 }), fc.boolean()), { nil: undefined }),
        reset: fc.option(fc.nat(), { nil: undefined }),
        stopped: fc.array(fc.nat(), { maxLength: 6 }),
        duplicates: fc.array(fc.nat(), { maxLength: 60 }),
        seed: fc.integer({ min: 1, max: 1_000_000 }),
      })
      .map((m) => {
        const pick = <T>(xs: readonly T[], i: number): T => xs[i % xs.length] as T;
        const changed = new Map<string, LearnerEvent>();
        const answer = (i: number): AnswerSubmitted => {
          const a = pick(answers, i);
          return (changed.get(a.id) as AnswerSubmitted | undefined) ?? a;
        };
        for (const i of m.hinted) {
          const a = answer(i);
          changed.set(a.id, { ...a, input: { ...a.input, hinted: true } });
        }
        for (const [i, rating] of m.rated) {
          const a = answer(i);
          changed.set(a.id, { ...a, input: { ...a.input, selfRating: rating } });
        }
        for (const [i, reason] of m.skipped) {
          const a = answer(i);
          const { input: _input, outcome: _outcome, prediction: _prediction, ...rest } = a;
          changed.set(a.id, { ...rest, type: "exercise_skipped", reason });
        }
        const added: LearnerEvent[] = [];
        for (const [i, claim, seconds] of m.claims) {
          const a = pick(answers, i);
          added.push({ ...meta(a, seconds), type: "answer_reported", answer: a.id, exercise: a.exercise, text: "x", ...(claim === undefined ? {} : { claim }) });
        }
        for (const [i, right, seconds] of m.revised) {
          const a = pick(answers, i);
          const kcs = a.outcome.kcs.map((k) => ({ ...k, status: k.status === "given" ? k.status : right ? ("right" as const) : ("wrong" as const) }));
          added.push({ ...meta(a, seconds), type: "outcome_revised", answer: a.id, outcome: { kind: right ? "CORRECT_PROVISIONAL" : "WRONG", notes: [], kcs }, by: "judge" });
        }
        if (m.placement !== undefined) {
          const [i, count, completed] = m.placement;
          const placed = nodes.slice(0, count);
          const summary = { completed, exercises: 12, correctFirstTry: 9, retries: 0, skipped: 0 };
          added.push({ ...meta(pick(base, i), 1), type: "session_completed", mode: "placement", summary, placed, seeded: placedKcs(course, placed) });
        }
        if (m.reset !== undefined) added.push({ ...meta(pick(base, m.reset), 1), type: "progress_reset" });
        const sessions = base.filter((e) => e.type === "session_completed");
        for (const i of m.stopped) {
          const s = pick(sessions, i);
          if (s.type === "session_completed") changed.set(s.id, { ...s, summary: { ...s.summary, completed: false } });
        }
        const log = [...base.map((e) => changed.get(e.id) ?? e), ...added];
        const rng = seededRng(m.seed);
        return rng.shuffle([...log, ...m.duplicates.map((i) => pick(log, i))]);
      });

    it("replay", () => {
      fc.assert(
        fc.property(mutated, (log) => same(replay(log), replayBefore(log))),
        { numRuns: 25 },
      );
    }, LONG_TIMEOUT_MS);

    it("applyEvents, the newer part of the log onto a state replayed from the older", () => {
      fc.assert(
        fc.property(mutated, fc.integer({ min: 0, max: 100 }), (shuffled, share) => {
          // applyEvents takes what a device just recorded: events newer than those the state holds.
          const log = [...shuffled].sort(compareEvents);
          const split = Math.floor((log.length * share) / 100);
          same(applyEvents(replay(log.slice(0, split)), log.slice(split)), applyEventsBefore(replayBefore(log.slice(0, split)), log.slice(split)));
        }),
        { numRuns: 25 },
      );
    }, LONG_TIMEOUT_MS);
  });

  it("an empty log gives the empty state", () => {
    same(replay([]), replayBefore([]));
    same(replay([]), emptyLearnerState());
  });
});
