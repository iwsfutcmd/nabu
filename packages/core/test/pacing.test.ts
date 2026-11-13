import type { LearnerEvent } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { continueOf, emptyLearnerState, PACE, paceOf, plan, practiceFirst, RECENT_WINDOW, replay, type LearnerState } from "../src/learner/index.ts";
import { allKcs, lessonNodes, type Exercise } from "../src/lesson/index.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const NOW = "2026-06-01T08:00:00.000Z";
const fa = loadCourse("fa");
const words = allKcs(fa).filter((k) => k.kind === "sense" && k.forms?.[fa.orthography] !== undefined);

/** A card reviewed `daysAgo` with this stability: recall falls as the days pass. */
const cardAt = (daysAgo: number, stability: number): LearnerState["cards"][string] => {
  const last = new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString();
  return { due: new Date(Date.parse(last) + stability * 86_400_000).toISOString(), stability, difficulty: 5, elapsed_days: 0, scheduled_days: stability, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: last };
};

/** A learner with `right` of `tries` recent first tries right, and `slipping` words long unpractised. */
const learner = (right: number, tries: number, slipping: number): LearnerState => ({
  ...emptyLearnerState(),
  recent: Array.from({ length: tries }, (_, i) => i < right),
  cards: Object.fromEntries(words.map((k, i) => [`${k.id}|recognize`, i < slipping ? cardAt(40, 2) : cardAt(1, 60)])),
});

describe("the learning pace (ADR 0105)", () => {
  it("stays steady until there is enough practice to judge", () => {
    const pace = paceOf(fa, learner(5, 10, 0), NOW);
    expect([pace.band, pace.reason, pace.success]).toEqual(["steady", "steady", undefined]);
  });

  it("consolidates a learner whose recent first tries run well under the target", () => {
    const pace = paceOf(fa, learner(40, 60, 0), NOW);
    expect([pace.band, pace.reason]).toEqual(["consolidate", "struggling"]);
    expect(pace.settings).toBe(PACE.consolidate);
  });

  it("speeds up a learner whose recent first tries run well over it", () => {
    expect(paceOf(fa, learner(57, 60, 0), NOW).band).toBe("accelerate");
    // Sure answers win over a backlog: such a learner can take both.
    expect(paceOf(fa, learner(57, 60, 40), NOW).band).toBe("accelerate");
  });

  it("consolidates when many words are slipping, however answers go", () => {
    const pace = paceOf(fa, learner(51, 60, 40), NOW);
    expect([pace.band, pace.reason]).toEqual(["consolidate", "backlog"]);
    expect(pace.slipping).toBeGreaterThanOrEqual(30);
  });

  it("takes the learner's own choice over the log's reading (D5)", () => {
    const pace = paceOf(fa, learner(40, 60, 0), NOW, "accelerate");
    expect([pace.band, pace.reason]).toEqual(["accelerate", "chosen"]);
  });

  it("counts due words at the band's target: more due for consolidating, fewer for speeding up", () => {
    const state = learner(51, 60, 0);
    const due = (band: "consolidate" | "steady" | "accelerate"): number => paceOf(fa, { ...state, cards: Object.fromEntries(words.map((k, i) => [`${k.id}|recognize`, cardAt(3 + (i % 9), 6)])) }, NOW, band).due;
    expect(due("consolidate")).toBeGreaterThanOrEqual(due("steady"));
    expect(due("steady")).toBeGreaterThanOrEqual(due("accelerate"));
  });
});

describe("Continue (D6)", () => {
  const first = lessonNodes(fa)[0]?.node.id;

  it("offers practice first once enough words slip, and the next lesson beside it", () => {
    const state = learner(51, 60, 25);
    const pace = paceOf(fa, state, NOW);
    expect(practiceFirst(pace)).toBe(true);
    const to = continueOf(fa, state, pace);
    expect(to.kind).toBe("practice");
    expect(to.kind === "practice" ? to.next?.node : undefined).toBe(first);
  });

  it("goes to the next lesson while little is slipping", () => {
    const state = learner(51, 60, 2);
    const to = continueOf(fa, state, paceOf(fa, state, NOW));
    expect(to.kind === "path" ? to.next.node : to.kind).toBe(first);
  });

  it("offers less practice to a learner speeding up than to one consolidating", () => {
    expect(PACE.accelerate.practiceAt).toBeGreaterThan(PACE.steady.practiceAt);
    expect(PACE.steady.practiceAt).toBeGreaterThan(PACE.consolidate.practiceAt);
    expect(PACE.accelerate.reviewShare).toBeLessThan(PACE.steady.reviewShare);
    expect(PACE.steady.reviewShare).toBeLessThan(PACE.consolidate.reviewShare);
  });
});

describe("recent first tries in the fold", () => {
  it("keeps the last graded first tries: no retries, no self-ratings; a revealed answer is a miss", () => {
    const events = eventFactory(fa, manifestOf("fa").id);
    events.at(NOW);
    const ex = (template: Exercise["template"]): Exercise => ({ id: `${template}:x`, template, item: "x", kcs: [words[0]?.id], orthography: fa.orthography }) as unknown as Exercise;
    const log: LearnerEvent[] = [events.answer(ex("choose-translation"), true, 1), events.answer(ex("choose-translation"), false, 1), events.answer(ex("choose-translation"), true, 2), events.answer(ex("speak.tier-0"), true, 1)];
    const { input: _i, outcome: _o, prediction: _p, ...skip } = events.answer(ex("select-image"), true, 1) as LearnerEvent & { input: unknown; outcome: unknown; prediction?: unknown };
    log.push({ ...skip, type: "exercise_skipped", reason: "skip" } as unknown as LearnerEvent);
    expect(replay(log).recent).toEqual([true, false, false]);
    const many = Array.from({ length: RECENT_WINDOW + 5 }, () => events.answer(ex("choose-translation"), true, 1));
    expect(replay(many).recent).toHaveLength(RECENT_WINDOW);
  });
});

describe("the planner at a pace", () => {
  it("gives a lesson less review speeding up, more consolidating", () => {
    const lessons = lessonNodes(fa);
    const at = lessons.findIndex((n) => n.unit.id === fa.units[4]?.id);
    const node = lessons[at]?.node.id;
    if (node === undefined) throw new Error("fa has a fifth unit");
    const earlier = new Set(lessons.slice(0, at).flatMap((n) => n.node.introduces as readonly string[]));
    const state: LearnerState = { ...emptyLearnerState(), cards: Object.fromEntries([...earlier].map((kc, i) => [`${kc}|recognize`, cardAt(20 + (i % 10), 4)])) };
    const review = (band: "consolidate" | "steady" | "accelerate"): number =>
      plan(fa, state, { mode: "lesson", node }, { now: NOW, seed: 5, pace: band }).exercises.filter((ex) => ex.review === true).length;
    expect(review("accelerate")).toBeLessThanOrEqual(review("steady"));
    expect(review("steady")).toBeLessThanOrEqual(review("consolidate"));
    expect(review("consolidate")).toBeGreaterThan(review("accelerate"));
  });
});
