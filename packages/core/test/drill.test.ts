/**
 * Words met in passages (ADR 0144): a passage's drill node, its sessions, the planner's drill
 * sessions (every word presented, recognized, then written, in the passage's own lines and from its
 * gloss), the path (drills never hold it back), Continue, and the words a name is never asked.
 */
import { describe, expect, it } from "vitest";
import type { BundleNode, BundleUnit, LearnerEvent } from "@nabu/schema";
import { creditedKcs, facetOf } from "../src/learner/credit.ts";
import { applyEvents, continueOf, emptyLearnerState, learnedWords, paceOf, pathOf, plan, plannable, skillsAsked, undrilledWords, type LearnerState } from "../src/learner/index.ts";
import { createGrader, DRILL_WORDS, drillNodes, drillSessionAt, gradeExercise, isDrilled, makeWriteWord, seededRng, TEMPLATES, type CourseView, type Exercise } from "../src/lesson/index.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";
import { rightAnswer } from "./answers.ts";

/**
 * A course whose passage at `storyNode` introduces `count` of its words (as a compiled bundle would
 * have it after a lesson stopped teaching them): a drill node after it, the words most used first.
 */
const withDrill = (course: CourseView, storyNode: string, count: number): CourseView => {
  const units = course.units.map((unit): BundleUnit => {
    const at = unit.nodes.findIndex((n) => n.id === storyNode);
    const story = (unit.stories ?? []).find((s) => s.node === storyNode);
    if (at < 0 || story === undefined) return unit;
    const kcs = new Map(unit.kcs.map((k) => [k.id as string, k]));
    const words = story.kcs.filter((kc) => kc.startsWith("sense:") && kcs.has(kc)).slice(0, count);
    const drill: BundleNode = { id: `${storyNode}.words`, kind: "drill", introduces: [], reinforces: [], sentences: [], drill: { story: storyNode, words } };
    return { ...unit, nodes: [...unit.nodes.slice(0, at + 1), drill, ...unit.nodes.slice(at + 1)] };
  });
  return { ...course, units };
};

const chg = loadCourse("chg");
const STORY = "chg.u03.story";
const drilled = withDrill(chg, STORY, 12);
const NOW = "2026-03-02T09:00:00.000Z";

/**
 * The learner's state once they have read the story, having taken every node before it and learned
 * every word the course has but those its drills teach (a placement test's seeding, ADR 0111).
 */
const readThrough = (course: CourseView, node: string): LearnerState => {
  const events = eventFactory(course, manifestOf(course.id).id);
  const log: LearnerEvent[] = [];
  const nodes = course.units.flatMap((u) => u.nodes.map((n) => n.id));
  const drilledWords = new Set(drillNodes(course).flatMap((d) => d.sessions.flatMap((s) => s.words.map((k) => k.id as string))));
  const known = course.units.flatMap((u) => u.kcs.map((k) => k.id)).filter((kc) => !drilledWords.has(kc));
  events.session();
  const placement = events.completed("lesson", undefined, { exercises: 0, correctFirstTry: 0, retries: 0 });
  log.push({ ...placement, mode: "placement", placed: [], seeded: known } as LearnerEvent);
  for (const id of nodes.slice(0, nodes.indexOf(node) + 1)) {
    events.session();
    log.push(events.completed(id === node ? "story" : "lesson", id, { exercises: 0, correctFirstTry: 0, retries: 0 }));
  }
  return applyEvents(emptyLearnerState(), log);
};

describe("drill nodes", () => {
  it("split a passage's words into sessions of a few words, in order, none two alike", () => {
    const [drill] = drillNodes(drilled);
    expect(drill?.node.drill.story).toBe(STORY);
    const sessions = drill?.sessions ?? [];
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.every((s) => s.words.length > 0 && s.words.length <= DRILL_WORDS)).toBe(true);
    expect(sessions.map((s) => s.id)).toEqual(sessions.map((_, i) => `${STORY}.words.${String(i + 1)}`));
    // Every word once.
    const words = sessions.flatMap((s) => s.words.map((k) => k.id));
    expect(new Set(words).size).toBe(words.length);
    expect(plannable(drilled, { mode: "lesson", node: sessions[0]?.id ?? "" })).toBe(true);
    expect(drillSessionAt(drilled, `${STORY}.words.99`)).toBeUndefined();
  });

  it("never drill a name", () => {
    expect(drillNodes(drilled).flatMap((d) => d.sessions.flatMap((s) => s.words)).every(isDrilled)).toBe(true);
  });
});

describe("a drill session", () => {
  const state = readThrough(drilled, STORY);
  const [drill] = drillNodes(drilled);
  const session = drill?.sessions[0];
  if (drill === undefined || session === undefined) throw new Error("no drill");
  const planned = plan(drilled, state, { mode: "lesson", node: session.id }, { now: NOW, today: NOW.slice(0, 10), seed: 3 });
  const words = new Set<string>(session.words.map((k) => k.id));

  it("presents every word, then has it recognized, then written", () => {
    const exs = planned.exercises;
    expect(exs.length).toBeGreaterThanOrEqual(10);
    const presentedAt = new Map<string, number>();
    exs.forEach((ex, i) => {
      if (TEMPLATES[ex.template].presents === true) for (const kc of creditedKcs(ex)) if (!presentedAt.has(kc)) presentedAt.set(kc, i);
    });
    for (const kc of words) expect(presentedAt.has(kc), kc).toBe(true);
    // A word is written (typed) only after a card presented it.
    exs.forEach((ex, i) => {
      if (facetOf(ex.template) !== "produce") return;
      for (const kc of creditedKcs(ex)) if (words.has(kc)) expect(presentedAt.get(kc) ?? Infinity, `${ex.id} ${kc}`).toBeLessThan(i);
    });
    // Words are written: typed from their gloss, or into the passage's lines.
    expect(exs.some((ex) => ex.template === "write-word" || ex.template === "complete-translation")).toBe(true);
  });

  it("asks only its words and words the learner has met; the passage's other words are context", () => {
    for (const ex of planned.exercises) {
      if (ex.review === true) continue;
      for (const kc of creditedKcs(ex)) expect(words.has(kc) || state.cards[`${kc}|recognize`] !== undefined, `${ex.id} ${kc}`).toBe(true);
    }
    // Some cards come from the passage's own lines.
    expect(planned.exercises.some((ex) => ex.item.startsWith(`${drill.story?.id ?? ""}#`))).toBe(true);
  });

  it("grades a line's typed word against the line, and a written word against its forms", () => {
    const grader = createGrader(drilled);
    for (const ex of planned.exercises) {
      if (ex.template !== "complete-translation" && ex.template !== "write-word") continue;
      expect(gradeExercise(ex, rightAnswer(ex), grader).verdict, ex.id).toMatch(/^CORRECT/u);
      expect(gradeExercise(ex, { tag: "text", text: "qqqq" }, grader).verdict, ex.id).toBe("WRONG");
    }
  });
});

describe("write-word", () => {
  const rng = seededRng(1);
  const ctx = { course: chg, rng, introduced: [] };
  const grader = createGrader(chg);
  const card = (id: string): Exercise => {
    const kc = chg.units.flatMap((u) => u.kcs).find((k) => k.id === id);
    const ex = kc === undefined ? undefined : makeWriteWord(ctx, kc);
    if (ex === undefined) throw new Error(`no write-word card for ${id}`);
    return ex;
  };

  it("shows the gloss and takes the lemma, a stem with or without its hyphen", () => {
    const ex = card("sense:bol");
    if (ex.template !== "write-word") throw new Error("write-word");
    expect(ex.kcs).toEqual(["sense:bol"]);
    expect(gradeExercise(ex, { tag: "text", text: "بول-" }, grader).verdict).toBe("CORRECT");
    expect(gradeExercise(ex, { tag: "text", text: "بول" }, grader).verdict).toMatch(/^CORRECT/u);
    expect(gradeExercise(ex, { tag: "text", text: "بار" }, grader).verdict).not.toMatch(/^CORRECT/u);
  });

  it("is never made for a name", () => {
    const name = chg.units.flatMap((u) => u.kcs).find((k) => k.pos === "PROPN");
    expect(name?.drill).toBe(false);
    expect(name === undefined ? undefined : makeWriteWord(ctx, name)).toBeUndefined();
  });
});

describe("the path and Continue", () => {
  it("open a drill once its passage is read, and never hold the path back", () => {
    const before = pathOf(drilled, readThrough(drilled, chg.units.flatMap((u) => u.nodes.map((n) => n.id))[0] ?? ""));
    expect(before.find((n) => n.kind === "drill")?.status).toBe("locked");
    const state = readThrough(drilled, STORY);
    const path = pathOf(drilled, state);
    const at = path.findIndex((n) => n.kind === "drill");
    const entry = path[at];
    expect(entry?.status).toBe("available");
    expect(entry?.drill).toEqual({ done: 0, total: drillNodes(drilled)[0]?.sessions.length, next: `${STORY}.words.1` });
    // The node after the drill opens with the passage read: drills never block (D6).
    expect(path[at + 1]?.status).toBe("available");
  });

  it("are done once every session is", () => {
    const sessions = drillNodes(drilled)[0]?.sessions ?? [];
    const events = eventFactory(drilled, manifestOf("chg").id);
    let state = readThrough(drilled, STORY);
    for (const s of sessions) {
      events.session();
      state = applyEvents(state, [events.completed("lesson", s.id, { exercises: 10, correctFirstTry: 10, retries: 0 })]);
    }
    const entry = pathOf(drilled, state).find((n) => n.kind === "drill");
    expect(entry?.status).toBe("done");
    expect(entry?.drill?.done).toBe(sessions.length);
    expect(undrilledWords(drilled, state)).toBe(0);
  });

  it("offer drills first to a learner who consolidates, the next node to one who speeds up", () => {
    const state = readThrough(drilled, STORY);
    expect(undrilledWords(drilled, state)).toBe(drillNodes(drilled)[0]?.sessions.reduce((n, x) => n + x.words.length, 0));
    // An hour after the learner's last session: nothing is slipping yet.
    const soon = "2026-01-01T10:00:00.000Z";
    const consolidate = continueOf(drilled, state, paceOf(drilled, state, soon, "consolidate"));
    expect(consolidate.kind).toBe("drill");
    if (consolidate.kind === "drill") expect(consolidate.next?.kind).not.toBe("drill");
    expect(continueOf(drilled, state, paceOf(drilled, state, soon, "accelerate")).kind).toBe("path");
  });
});

describe("names (drill: false)", () => {
  it("are asked nothing and are no words to learn", () => {
    const names = chg.units.flatMap((u) => u.kcs).filter((k) => !isDrilled(k));
    expect(names.length).toBeGreaterThan(0);
    const asked = skillsAsked(chg);
    for (const k of names) expect(asked(k.id), k.id).toEqual([]);
    // A sentence practises its words but its names.
    const kcs = new Set(chg.units.flatMap((u) => u.sentences.flatMap((s) => s.kcs)));
    for (const k of names) expect(kcs.has(k.id), k.id).toBe(false);
    expect(learnedWords(chg, emptyLearnerState(), NOW)).toEqual([]);
  });

  it("are asked of every drilled word in writing", () => {
    const asked = skillsAsked(chg);
    const words = chg.units.flatMap((u) => u.kcs).filter((k) => k.kind === "sense" && isDrilled(k) && k.forms?.[chg.orthography] !== undefined && k.gloss?.en !== undefined);
    expect(words.every((k) => asked(k.id).includes("produce"))).toBe(true);
  });
});
