/**
 * The open mistakes a mistakes session can practise: what the course page counts is exactly what
 * the session holds. A mistake the session cannot bring back now (its template is on a listening
 * or speaking break, its item left the course, it needs a word not yet seen) is not counted.
 */
import { describe, expect, it } from "vitest";
import { emptyLearnerState, plan, practicableMistakes, replay, type LearnerState } from "../src/learner/index.ts";
import { LISTENING, lessonNodes, type Exercise } from "../src/lesson/index.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const NOW = "2026-03-01T08:00:00.000Z";
const LATER = "2026-03-01T09:00:00.000Z";

describe("the mistakes a session can practise", () => {
  const fa = loadCourse("fa");
  const first = lessonNodes(fa)[0]?.node.id;
  if (first === undefined) throw new Error("fa has lessons");

  /** The first lesson with every exercise `wrong` picks answered wrong first, then right. */
  const lessonMissing = (wrong: (ex: Exercise) => boolean): LearnerState => {
    const events = eventFactory(fa, manifestOf("fa").id);
    events.at(NOW);
    const p = plan(fa, emptyLearnerState(), { mode: "lesson", node: first }, { now: NOW, seed: 3 });
    const answers = p.exercises.flatMap((ex) => (wrong(ex) ? [events.answer(ex, false, 1), events.answer(ex, true, 2)] : [events.answer(ex, true, 1)]));
    return replay([events.started("lesson", first, p.exercises.length), ...answers, events.completed("lesson", first, { exercises: p.exercises.length, correctFirstTry: 0, retries: 0 })]);
  };
  const sessionOf = (state: LearnerState, exclude?: ReadonlySet<Exercise["template"]>) =>
    plan(fa, state, { mode: "mistakes" }, { now: LATER, seed: 5, ...(exclude === undefined ? {} : { exclude }) }).exercises;

  it("counts every open mistake the session brings back", () => {
    const state = lessonMissing((ex) => ex.template === "choose-translation" || LISTENING.has(ex.template));
    const open = practicableMistakes(fa, state);
    expect(open.length).toBeGreaterThan(1);
    expect(open.length).toBe(state.mistakes.length);
    expect(new Set(sessionOf(state).map((ex) => ex.id))).toEqual(new Set(open.map((ex) => ex.id)));
  });

  it("leaves out mistakes on listening cards while listening is off: the session would have none", () => {
    const state = lessonMissing((ex) => LISTENING.has(ex.template));
    expect(state.mistakes.length).toBeGreaterThan(0);
    expect(practicableMistakes(fa, state).length).toBe(state.mistakes.length);
    expect(practicableMistakes(fa, state, { exclude: LISTENING })).toEqual([]);
    expect(sessionOf(state, LISTENING)).toEqual([]);
  });

  it("leaves out a mistake whose item has left the course, or that needs a word not yet seen", () => {
    const state = lessonMissing((ex) => !LISTENING.has(ex.template));
    const open = practicableMistakes(fa, state).length;
    expect(open).toBeGreaterThan(0);
    const unseen = fa.units.flatMap((u) => u.sentences).find((s) => s.kcs.some((kc) => !Object.keys(state.cards).some((k) => k.startsWith(`${kc}|`))));
    if (unseen === undefined) throw new Error("fa has sentences beyond its first lesson");
    const stale: LearnerState = {
      ...state,
      mistakes: [...state.mistakes, { item: "fa.no-such-sentence", template: "translate-type.l1-l2", at: NOW }, { item: unseen.id, template: "translate-type.l1-l2", at: NOW }],
    };
    expect(practicableMistakes(fa, stale).length).toBe(open);
    expect(sessionOf(stale).length).toBe(Math.min(10, open));
    // Once its words are seen, the sentence's mistake is practised too.
    const card = Object.values(state.cards)[0];
    if (card === undefined) throw new Error("the lesson made cards");
    const seenAll: LearnerState = { ...stale, cards: { ...stale.cards, ...Object.fromEntries(unseen.kcs.map((kc) => [`${kc}|recognize`, card])) } };
    expect(practicableMistakes(fa, seenAll).map((ex) => ex.item)).toContain(unseen.id);
  });
});
