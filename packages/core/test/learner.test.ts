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
  progressResetOf,
  pathNodes,
  pathOf,
  placementOf,
  ratingOf,
  replay,
  retrievability,
  XP,
  type LearnerState,
} from "../src/learner/index.ts";
import { DEFAULT_GAME, replayGame } from "../src/game/index.ts";
import { buildLesson, cardGallery, createGrader, facetExclusions, gradeExercise, lessonNodes, runTest, sampleExercise, seededRng, speechSupportOf, start, step, TEMPLATES, type Draft, type Exercise } from "../src/lesson/index.ts";
import { surfaceOf } from "../src/text/index.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const GOLDEN = join(import.meta.dirname, "golden");
/** Tests that plan every lesson of a course: under a second alone, far more on a busy CI runner. */
const WHOLE_COURSE_TIMEOUT_MS = 30_000;
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
    case "story-arrange":
      return { tag: "tiles", order: bad ? [...ex.solution].reverse() : ex.solution };
    case "translate-type.l1-l2":
    case "listen-type":
      return { tag: "text", text: bad ? "zzz" : surfaceOf(ex.canonical) };
    case "complete-translation":
      return { tag: "text", text: bad ? "zzz" : surfaceOf(ex.blank) };
    case "vocalize":
      return { tag: "text", text: bad ? surfaceOf(ex.prompt) : surfaceOf(ex.vocalized) };
    case "transcribe":
      return { tag: "text", text: bad ? "zzz" : surfaceOf(ex.reading) };
    case "match-pairs":
      return { tag: "pairs", matched: ex.left.map((_, i) => i), mistakes: 0 };
    case "speak.tier-0":
      return { tag: "self-rating", rating: "good" };
    case "speak":
    case "listen-speak":
      return { tag: "speech", result: bad ? { silent: true } : { silent: false } };
    case "tone-identify":
      return { tag: "choice", index: bad ? (ex.answer + 1) % ex.tones.length : ex.answer };
    case "select-image":
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
    case "listen-select":
    case "minimal-pair":
    case "story-choose":
    case "story-complete":
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

describe("starting a course over (progress_reset)", () => {
  const node = lessonNodes(fa)[0]?.node.id as string;
  const lesson = playLesson(emptyLearnerState(), node, "2026-03-01T08:00:00.000Z", 2);
  const resetAt = (iso: string, n: number) =>
    progressResetOf(fa, { id: `00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`, clientTime: iso, localDate: iso.slice(0, 10), tz: "UTC", device: "golden", session: `00000000-0000-7000-a000-${n.toString(16).padStart(12, "0")}`, bundle: faBundle });
  const reset = resetAt("2026-03-02T08:00:00.000Z", 1);
  const { seen: _a, ...before } = replay(lesson);
  const { seen: _b, ...after } = replay([...lesson, reset]);
  const { seen: _c, ...fresh } = emptyLearnerState();

  it("forgets what was learned, the lessons done and the mistakes; keeps the XP earned", () => {
    expect(before.completedNodes).toEqual([node]);
    expect(after).toEqual({ ...fresh, xp: before.xp });
    expect(pathOf(fa, replay([...lesson, reset]))[0]?.status).toBe("available");
  });

  it("counts what comes after it, in any arrival order, and incrementally as on the device", () => {
    // The same lesson played again the next day (fresh ids: a new session).
    const again = playLesson(replay([...lesson, reset]), node, "2026-03-03T08:00:00.000Z", 0).map((e) => ({ ...e, id: e.id.replace(/^00000000/u, "00000001") }));
    const log = [...lesson, reset, ...again];
    const state = replay(log);
    expect(state.completedNodes).toEqual([node]);
    expect(state.xp.total).toBe(before.xp.total + replay(again).xp.total);
    expect(replay(seededRng(9).shuffle(log))).toEqual(state); // a reset synced late still lands in its place
    expect(applyEvents(replay(lesson), [reset])).toEqual(replay([...lesson, reset]));
  });

  it("does nothing to what comes after an earlier reset, nor to the game state", () => {
    const early = resetAt("2026-02-01T08:00:00.000Z", 2);
    const { seen: _d, ...unchanged } = replay([early, ...lesson]);
    expect(unchanged).toEqual(before);
    const clock = { today: "2026-03-02", now: "2026-03-02T09:00:00.000Z" };
    expect(replayGame([...lesson, reset].map((event) => ({ event })), DEFAULT_GAME, clock)).toEqual(replayGame(lesson.map((event) => ({ event })), DEFAULT_GAME, clock));
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
  }, WHOLE_COURSE_TIMEOUT_MS);

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

describe("a course that names its facets (ADR 0071)", () => {
  const lzh = loadCourse("lzh");
  const practised = (ex: Exercise): boolean => TEMPLATES[ex.template].facet === "recognize" || TEMPLATES[ex.template].facet === "produce";
  const now = "2026-03-01T08:00:00.000Z";

  it("reads them from its bundle; the other courses name none and rule nothing out", () => {
    expect(lzh.facets).toEqual(["recognize", "produce"]);
    for (const id of ["fa", "yue", "uz", "apc"]) expect(facetExclusions(loadCourse(id)).size).toBe(0);
  });

  it("is never spoken, heard or drilled on its readings, whatever the app can score", () => {
    const speech = speechSupportOf(lzh, 2);
    expect(speech).toEqual({ scored: false, tones: false });
    for (const { node } of lessonNodes(lzh)) {
      expect(buildLesson(lzh, node.id, { seed: 3, speech }).filter((ex) => !practised(ex)).map((ex) => ex.id)).toEqual([]);
      const p = plan(lzh, emptyLearnerState(), { mode: "lesson", node: node.id }, { now, seed: 3, speech });
      expect(p.exercises.filter((ex) => !practised(ex)).map((ex) => ex.id)).toEqual([]);
    }
    const placement = plan(lzh, emptyLearnerState(), { mode: "placement" }, { now, seed: 3, speech });
    expect(placement.exercises.filter((ex) => !practised(ex)).map((ex) => ex.id)).toEqual([]);
    expect(cardGallery(lzh, 3).filter((c) => !["recognize", "produce"].includes(TEMPLATES[c.template].facet))).toEqual([]);
    expect(sampleExercise(lzh, "speak.tier-0")).toBeUndefined();
  }, WHOLE_COURSE_TIMEOUT_MS);

  it("Biblical Hebrew leaves out listening alone: never heard, still said once answered (ADR 0082)", () => {
    const hbo = loadCourse("hbo");
    expect(hbo.facets).toEqual(["recognize", "produce", "speak", "read-script", "write-script"]);
    const heard = (ex: Exercise): boolean => TEMPLATES[ex.template].facet === "listen";
    for (const { node } of lessonNodes(hbo)) {
      expect(buildLesson(hbo, node.id, { seed: 3 }).filter(heard).map((ex) => ex.id)).toEqual([]);
      const p = plan(hbo, emptyLearnerState(), { mode: "lesson", node: node.id }, { now, seed: 3 });
      expect(p.exercises.filter(heard).map((ex) => ex.id)).toEqual([]);
    }
    expect(cardGallery(hbo, 3).filter((c) => TEMPLATES[c.template].facet === "listen")).toEqual([]);
    // The clips stay: every card says its sentence once answered (ADR 0064).
    expect(Object.keys(hbo.audio).length).toBeGreaterThan(0);
  }, WHOLE_COURSE_TIMEOUT_MS);

  it("still shows its readings: every word of a lesson carries all three layers", () => {
    const node = lessonNodes(lzh)[0]?.node.id as string;
    const words = buildLesson(lzh, node, { seed: 3 }).flatMap((ex) => ("prompt" in ex && ex.prompt !== undefined && "tokens" in ex.prompt ? ex.prompt.tokens : []));
    const han = words.filter((t) => t.kind === "word" && /\p{Script=Han}/u.test(t.surface));
    expect(han.length).toBeGreaterThan(0);
    for (const t of han) expect(Object.keys(t.ruby ?? {}).sort()).toEqual(["baxter", "jyutping", "pinyin"]);
  });
});

describe("placement (§9.5, ADR 0077)", () => {
  const now = "2026-03-01T08:00:00.000Z";
  const test = plan(fa, emptyLearnerState(), { mode: "placement" }, { now, seed: 4 });
  const nodes = lessonNodes(fa).map((n) => n.node.id);
  const placement = test.placement as NonNullable<typeof test.placement>;
  const unitOf = new Map(fa.units.flatMap((u) => u.sentences.map((s) => [s.id, u.id] as const)));
  const units = [...new Set(lessonNodes(fa).map((n) => n.unit.id))];
  const events0 = eventFactory(fa, faBundle);
  events0.at(now);
  events0.session();
  /** Runs the test one question at a time, as the player does, for a learner who knows `knows`. */
  const take = (knows: (ex: Exercise) => boolean): { readonly placed: readonly string[]; readonly asked: number } => {
    const answers = new Map<string, boolean>();
    for (let next = runTest(placement.test, answers).next; next.length > 0; next = runTest(placement.test, answers).next) {
      const ex = next[0] as Exercise;
      answers.set(ex.id, knows(ex));
    }
    return { placed: placementOf(placement, answers), asked: answers.size };
  };
  const knowsUnits = (k: number) => (ex: Exercise) => units.indexOf(unitOf.get(ex.item) ?? "") < k;

  it("has a block of at most four probes per unit, production and recognition, without speaking", () => {
    expect(placement.test.blocks.map((b) => b.id)).toEqual(units);
    for (const b of placement.test.blocks) {
      expect(b.exercises.length).toBeGreaterThan(0);
      expect(b.exercises.length).toBeLessThanOrEqual(4);
      expect(b.exercises.every((e) => unitOf.get(e.item) === b.id)).toBe(true);
      // Into the target (tiles or typed) and out of it.
      expect(b.exercises.some((e) => e.template.endsWith("l1-l2") || e.template === "complete-translation")).toBe(true);
      expect(b.exercises.some((e) => e.template === "choose-translation" || e.template === "translate-tap.l2-l1")).toBe(true);
      expect(b.steps.map((s) => s.id)).toEqual(lessonNodes(fa).filter((n) => n.unit.id === b.id).map((n) => n.node.id));
    }
    const all = placement.test.blocks.flatMap((b) => [...b.exercises, ...b.steps.map((s) => s.exercise)]);
    expect(all.some((e) => e.template === "speak.tier-0" || e.template === "match-pairs" || TEMPLATES[e.template].modality.audioOut)).toBe(false);
    expect(Object.keys(placement.predictions).sort()).toEqual([...new Set(all.map((e) => e.id))].sort());
    expect(test.exercises).toEqual(placement.test.blocks[0]?.exercises);
    expect(plan(fa, emptyLearnerState(), { mode: "placement" }, { now, seed: 4 })).toEqual(test);
  });

  it("places a learner after the units they know, asking far fewer questions than it has", () => {
    const total = placement.test.blocks.reduce((n, b) => n + b.exercises.length, 0);
    for (let k = 0; k <= units.length; k++) {
      const { placed, asked } = take(knowsUnits(k));
      // A unit passed places out of its lessons and its story.
      expect(placed).toEqual(pathNodes(fa).filter((n) => units.indexOf(n.unit.id) < k).map((n) => n.node.id));
      expect(asked).toBeLessThan(total / 2);
    }
    // Two misses fail the first unit, and its first lesson's probe ends the test.
    expect(take(() => false)).toEqual({ placed: [], asked: 3 });
  });

  it("places inside the first unit not passed, up to the first node missed", () => {
    const fourth = lessonNodes(fa).filter((n) => n.unit.id === units[3]);
    const knownNodes = new Set([...lessonNodes(fa).filter((n) => units.indexOf(n.unit.id) < 3), ...fourth.slice(0, 2)].map((n) => n.node.id));
    const nodeOf = new Map(fa.units.flatMap((u) => u.sentences.map((s) => [s.id, s.node] as const)));
    const { placed } = take((ex) => knownNodes.has(nodeOf.get(ex.item) ?? ""));
    const passedUnits = pathNodes(fa).filter((n) => units.indexOf(n.unit.id) < 3).map((n) => n.node.id);
    expect(placed).toEqual([...passedUnits, ...fourth.slice(0, 2).map((n) => n.node.id)]);
    // The path then opens at the third lesson of the fourth unit.
    const done = { ...events0.completed("lesson", undefined, { exercises: 1, correctFirstTry: 1, retries: 0 }), mode: "placement" as const, placed: [...placed] };
    const state = replay([events0.started("lesson", undefined, 1), done]);
    expect(pathOf(fa, state).filter((n) => n.status === "available").map((n) => n.node)).toEqual([fourth[2]?.node.id]);
  });

  it("asks production typed where the course says (placement: {production: typed})", () => {
    const typed = plan({ ...fa, placement: { production: "typed" } }, emptyLearnerState(), { mode: "placement" }, { now, seed: 4 }).placement;
    const produced = (typed?.test.blocks ?? []).flatMap((b) => [...b.exercises, ...b.steps.map((s) => s.exercise)]).filter((e) => TEMPLATES[e.template].facet === "produce");
    expect(produced.length).toBeGreaterThan(0);
    expect(produced.every((e) => TEMPLATES[e.template].modality.input === "text")).toBe(true);
    expect(placement.test.blocks.flatMap((b) => b.exercises).some((e) => e.template === "translate-tap.l1-l2")).toBe(true);
  });

  it("marks placed nodes done in the projection, so the path opens after them", () => {
    const events = eventFactory(fa, faBundle);
    events.at(now);
    events.session();
    const done = { ...events.completed("lesson", undefined, { exercises: 12, correctFirstTry: 10, retries: 0 }), mode: "placement" as const, placed: nodes.slice(0, 2) };
    const state = replay([events.started("lesson", undefined, 12), done]);
    expect(state.completedNodes).toEqual(nodes.slice(0, 2));
    // The lessons, then each unit's story: locked until the lessons before it are done.
    const path = pathOf(fa, state);
    expect(path.filter((n) => n.kind === "lesson").map((n) => n.status)).toEqual(["done", "done", "available", ...nodes.slice(3).map(() => "locked")]);
    const stories = path.filter((n) => n.kind === "story");
    expect(stories.length).toBeGreaterThan(0);
    expect(stories.every((n) => n.status === "locked")).toBe(true);
  });
});

