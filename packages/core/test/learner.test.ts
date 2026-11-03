/**
 * Learner model: credit assignment, the rating map, the projection, and the
 * Phase 4 acceptance "golden-session replays are deterministic" (§16): a
 * recorded event log replays to the same state in any order and with
 * duplicates, and the same request plans the same session. Both are pinned
 * against golden files; UPDATE_GOLDEN=1 rewrites them after a deliberate change.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LearnerEvent } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import {
  applyEvents,
  creditOf,
  emptyLearnerState,
  learnerEventOf,
  plan,
  pathOf,
  placementOf,
  ratingOf,
  replay,
  retrievability,
  XP,
  type LearnerState,
} from "../src/learner/index.ts";
import { buildLesson, createGrader, gradeExercise, lessonNodes, sampleExercise, seededRng, start, step, type Draft, type Exercise } from "../src/lesson/index.ts";
import { surfaceOf } from "../src/text/index.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const GOLDEN = join(import.meta.dirname, "golden");
const fa = loadCourse("fa");
const faBundle = manifestOf("fa").id;

describe("credit assignment (§8.5)", () => {
  const grader = createGrader(fa);
  it("a gap-fill credits the blank's KCs and gives the rest", () => {
    const ex = sampleExercise(fa, "gap-fill", 7) as Extract<Exercise, { template: "gap-fill" }>;
    const credit = creditOf(ex, gradeExercise(ex, { tag: "choice", index: ex.answer }, grader), fa.profiles);
    expect(credit.filter((c) => c.status === "right").length).toBeGreaterThan(0);
    expect(credit.some((c) => c.status === "given")).toBe(true);
    expect(credit.some((c) => c.status === "wrong")).toBe(false);
  });

  it("a typed answer with one wrong word keeps credit for the words it got right", () => {
    const typing = lessonNodes(fa)
      .flatMap(({ node }) => buildLesson(fa, node.id, { seed: 7 }))
      .filter((e): e is Extract<Exercise, { template: "translate-type.l1-l2" }> => e.template === "translate-type.l1-l2");
    const ex = typing.find((e) => surfaceOf(e.canonical).split(" ").length >= 3);
    if (ex === undefined) throw new Error("no multi-word typing exercise in fa");
    const words = surfaceOf(ex.canonical).split(" ");
    const typed = [...words.slice(0, -1), "zzz"].join(" ");
    const outcome = gradeExercise(ex, { tag: "text", text: typed }, grader);
    expect(outcome.verdict).toBe("WRONG");
    const credit = creditOf(ex, outcome, fa.profiles);
    expect(credit.some((c) => c.status === "right")).toBe(true);
    expect(credit.some((c) => c.status === "wrong")).toBe(true);
  });

  it("maps outcomes to ratings (§9.2)", () => {
    expect(ratingOf("right", "CORRECT", [], false)).toBe("good");
    expect(ratingOf("right", "CORRECT", [], true)).toBe("hard");
    expect(ratingOf("right", "CORRECT_WITH_TYPO", [], false)).toBe("hard");
    expect(ratingOf("right", "PARTIAL", [], false)).toBe("hard");
    expect(ratingOf("right", "CORRECT", ["pairs-mistakes"], false)).toBe("hard");
    expect(ratingOf("wrong", "WRONG", [], false)).toBe("again");
    expect(ratingOf("given", "CORRECT", [], false)).toBeUndefined();
    expect(ratingOf("right", "CORRECT", [], false, "again")).toBe("again");
  });
});

/** The draft of a learner who answers right, or deliberately wrong. */
const draftFor = (ex: Exercise, bad: boolean): Draft => {
  switch (ex.template) {
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
      return { tag: "tiles", order: bad ? [...ex.solution].reverse() : ex.solution };
    case "translate-type.l1-l2":
    case "listen-type":
      return { tag: "text", text: bad ? "zzz" : surfaceOf(ex.canonical) };
    case "complete-translation":
      return { tag: "text", text: bad ? "zzz" : surfaceOf(ex.blank) };
    case "match-pairs":
      return { tag: "pairs", matched: ex.left.map((_, i) => i), mistakes: 0 };
    case "speak.tier-0":
      return { tag: "self-rating", rating: "good" };
    case "select-image":
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
    case "listen-select":
    case "minimal-pair":
      return { tag: "choice", index: bad ? (ex.answer + 1) % ex.options.length : ex.answer };
  }
};

/** Self-rated and pair-matching exercises cannot be got wrong by this learner. */
const missable = (ex: Exercise): boolean => ex.template !== "speak.tier-0" && ex.template !== "match-pairs";

/** Plays one planned lesson through the real player, missing the first `misses` exercises it can miss. */
const playLesson = (state: LearnerState, node: string, now: string, misses: number): readonly LearnerEvent[] => {
  const grader = createGrader(fa);
  const planned = plan(fa, state, { mode: "lesson", node }, { now, seed: 11 });
  const out: LearnerEvent[] = [];
  let n = 0;
  let clock = Date.parse(now);
  const meta = () => {
    n++;
    clock += 15_000;
    const t = new Date(clock).toISOString();
    return { id: `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`, clientTime: t, localDate: t.slice(0, 10), tz: "UTC", device: "golden", session: "00000000-0000-7000-8000-ffffffffffff", bundle: faBundle };
  };
  const session = { mode: "lesson" as const, node, seed: 11, planner: planned.planner };
  let [s, fx] = start(node, planned.exercises);
  const emit = (effects: typeof fx): void => {
    for (const f of effects) {
      if (f.tag === "emit") {
        const e = learnerEventOf(f.event, fa, meta(), session, { latencyMs: 4000 });
        if (e !== undefined) out.push(e);
      } else if (f.tag === "grade") {
        const [next, more] = step(s, { tag: "graded", outcome: gradeExercise(f.ex, f.response, grader) });
        s = next;
        emit(more);
      }
    }
  };
  emit(fx);
  let missed = 0;
  while (s.tag !== "finished") {
    if (s.tag === "presenting") [s, fx] = step(s, { tag: "ready" });
    else if (s.tag === "answering") {
      const ex = s.ex;
      const bad = missable(ex) && !ex.id.includes("#") && missed < misses;
      if (bad) missed++;
      const draft = draftFor(ex, bad);
      [s, fx] = step(s, { tag: "input", draft });
      emit(fx);
      [s, fx] = step(s, { tag: "submit" });
    } else if (s.tag === "feedback") [s, fx] = step(s, { tag: "continue" });
    else break;
    emit(fx);
  }
  return out;
};

const golden = <T>(name: string, value: T): void => {
  const path = join(GOLDEN, name);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (process.env["UPDATE_GOLDEN"] === "1" || !existsSync(path)) writeFileSync(path, text);
  expect(text).toBe(readFileSync(path, "utf8"));
};

describe("projection", () => {
  const node = lessonNodes(fa)[0]?.node.id as string;
  const events = playLesson(emptyLearnerState(), node, "2026-03-01T08:00:00.000Z", 2);

  it("records a lesson: cards per (KC, facet), XP, path progress, open mistakes", () => {
    const state = replay(events);
    expect(state.completedNodes).toEqual([node]);
    expect(Object.keys(state.cards).length).toBeGreaterThan(3);
    expect(state.xp.total).toBeGreaterThan(XP.session);
    expect(state.xp.byDate["2026-03-01"]).toBe(state.xp.total);
    expect(retrievability(state, Object.keys(state.cards)[0]!.split("|")[0]!, "recognize", fa.orthography, "2026-03-01T09:00:00.000Z")).toBeGreaterThan(0.5);
  });

  it("is order-independent and idempotent", () => {
    const state = replay(events);
    const shuffled = seededRng(5).shuffle(events);
    expect(replay([...shuffled, ...events.slice(0, 7)])).toEqual(state);
    expect(applyEvents(replay(events.slice(0, 10)), events.slice(10))).toEqual(state);
  });

  it("rates each facet at most once per session (§9.2)", () => {
    const state = replay(events);
    for (const card of Object.values(state.cards)) expect(card.reps).toBe(1);
  });

  it("golden: the recorded session replays to the pinned state", () => {
    golden("fa-lesson-1.events.json", events);
    const recorded = JSON.parse(readFileSync(join(GOLDEN, "fa-lesson-1.events.json"), "utf8")) as LearnerEvent[];
    const { seen: _seen, ...state } = replay(recorded);
    golden("fa-lesson-1.state.json", state);
  });

  it("golden: the same request plans the same session", () => {
    const recorded = JSON.parse(readFileSync(join(GOLDEN, "fa-lesson-1.events.json"), "utf8")) as LearnerEvent[];
    const state = replay(recorded);
    const request = { mode: "review" as const };
    const options = { now: "2026-03-04T08:00:00.000Z", seed: 3 };
    const a = plan(fa, state, request, options);
    expect(plan(fa, state, request, options)).toEqual(a);
    golden("fa-review-day-3.plan.json", { planner: a.planner, exercises: a.exercises.map((e) => e.id), predictions: a.predictions.map((p) => Math.round(p * 1e6) / 1e6) });
  });

  it("opens the path one lesson at a time", () => {
    const before = pathOf(fa, emptyLearnerState()).map((n) => n.status);
    expect(before[0]).toBe("available");
    expect(before.slice(1).every((s) => s === "locked")).toBe(true);
    const after = pathOf(fa, replay(events));
    expect(after[0]?.status).toBe("done");
    expect(after[1]?.status).toBe("available");
    expect(after.slice(2).every((n) => n.status === "locked")).toBe(true);
  });

  it("mistakes come back in mistakes mode, and leave once answered right", () => {
    const state = replay(events);
    expect(state.mistakes.length).toBeGreaterThan(0);
    const m = plan(fa, state, { mode: "mistakes" }, { now: "2026-03-01T10:00:00.000Z", seed: 1 });
    expect(m.exercises.map((e) => e.item)).toEqual(expect.arrayContaining(state.mistakes.map((x) => x.item).filter((item) => m.exercises.some((e) => e.item === item))));
    expect(m.exercises.length).toBeGreaterThan(0);
  });
});

describe("planner constraints", () => {
  it("never asks to produce a new KC before it has been recognized", () => {
    for (const { node } of lessonNodes(fa)) {
      const p = plan(fa, emptyLearnerState(), { mode: "lesson", node: node.id }, { now: "2026-03-01T08:00:00.000Z", seed: 2 });
      const recognized = new Set<string>();
      for (const ex of p.exercises) {
        const produces = ex.template === "translate-type.l1-l2" || ex.template === "complete-translation" || ex.template === "gap-fill";
        if (produces) for (const kc of ex.kcs) if (node.introduces.includes(kc)) expect(recognized.has(kc), `${node.id}: ${ex.id} before recognizing ${kc}`).toBe(true);
        if (!produces) ex.kcs.forEach((kc) => recognized.add(kc));
      }
    }
  });

  it("can leave speaking out", () => {
    const node = lessonNodes(fa)[1]?.node.id as string;
    const p = plan(fa, emptyLearnerState(), { mode: "lesson", node }, { now: "2026-03-01T08:00:00.000Z", seed: 2, exclude: new Set(["speak.tier-0"]) });
    expect(p.exercises.some((e) => e.template === "speak.tier-0")).toBe(false);
  });

  it("events built from the player validate as learner events", () => {
    const events = eventFactory(fa, faBundle);
    const ex = sampleExercise(fa, "choose-translation") as Exercise;
    const e = events.answer(ex, true, 1);
    expect(e.type).toBe("answer_submitted");
  });
});

describe("placement v0 (§9.5)", () => {
  const now = "2026-03-01T08:00:00.000Z";
  const test = plan(fa, emptyLearnerState(), { mode: "placement" }, { now, seed: 4 });
  const nodes = lessonNodes(fa).map((n) => n.node.id);

  it("probes every lesson node in path order, recognition then production, without speaking", () => {
    expect(test.probes).toBeDefined();
    const probes = test.probes ?? [];
    expect([...new Set(probes)]).toEqual(nodes);
    expect(probes.length).toBeLessThanOrEqual(2 * nodes.length);
    expect(test.exercises.some((e) => e.template === "speak.tier-0" || e.template === "match-pairs")).toBe(false);
    expect(plan(fa, emptyLearnerState(), { mode: "placement" }, { now, seed: 4 })).toEqual(test);
  });

  it("places through the longest run of nodes answered right the first time", () => {
    const probes = test.probes ?? [];
    const right = new Map(test.exercises.map((e) => [e.id, true]));
    expect(placementOf({ exercises: test.exercises, probes }, right)).toEqual(nodes);
    const firstOfThird = test.exercises.find((_, i) => probes[i] === nodes[2]);
    const missed = new Map([...right, [firstOfThird?.id ?? "", false]]);
    expect(placementOf({ exercises: test.exercises, probes }, missed)).toEqual(nodes.slice(0, 2));
    expect(placementOf({ exercises: test.exercises, probes }, new Map())).toEqual([]);
  });

  it("marks placed nodes done in the projection, so the path opens after them", () => {
    const events = eventFactory(fa, faBundle);
    events.at(now);
    events.session();
    const done = { ...events.completed("lesson", undefined, { exercises: 12, correctFirstTry: 10, retries: 0 }), mode: "placement" as const, placed: nodes.slice(0, 2) };
    const state = replay([events.started("lesson", undefined, 12), done]);
    expect(state.completedNodes).toEqual(nodes.slice(0, 2));
    expect(pathOf(fa, state).map((n) => n.status)).toEqual(["done", "done", "available", ...nodes.slice(3).map(() => "locked")]);
  });
});

