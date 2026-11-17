/**
 * The open mistakes a mistakes session can practise: what the course page counts is exactly what
 * the session holds. A mistake the session cannot bring back now (its template is on a listening
 * or speaking break, its item left the course, it needs a word not yet seen) is not counted.
 *
 * A card about one word of its sentence (a blank, a word's marks or reading) comes back about that
 * word, and only an answer about that word closes it.
 */
import type { KcCredit, LearnerEvent } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { askedKcs } from "../src/learner/credit.ts";
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

describe("a mistake on one word of a sentence", () => {
  const word = (ex: Exercise): string => [...new Set((askedKcs(ex) ?? []).map(String))].sort().join("+");

  /** One lesson's answers: every card right but `missed`, which is wrong on its first try. */
  const missing = (course: ReturnType<typeof loadCourse>, node: string, missed: Exercise, all: readonly Exercise[]): LearnerEvent[] => {
    const events = eventFactory(course, manifestOf(course.id).id);
    events.at(NOW);
    return [events.started("lesson", node, all.length), ...all.map((ex) => events.answer(ex, ex.id !== missed.id, 1))];
  };

  it("comes back about the word that was missed: a blank, a word's marks or its reading", () => {
    let checked = 0;
    for (const id of ["fa", "yue", "uz", "apc", "es", "chg", "hbo"]) {
      const course = loadCourse(id);
      for (const n of lessonNodes(course).slice(0, 4)) {
        const p = plan(course, emptyLearnerState(), { mode: "lesson", node: n.node.id }, { now: NOW, seed: 3 });
        for (const ex of p.exercises.filter((e) => askedKcs(e) !== undefined)) {
          const back = practicableMistakes(course, replay(missing(course, n.node.id, ex, p.exercises))).find((e) => e.item === ex.item && e.template === ex.template);
          expect(back, `${id} ${ex.id}`).toBeDefined();
          expect(word(back as Exercise), `${id} ${ex.id}`).toBe(word(ex));
          // A fill-in comes back as the same question: which word, or which form (ADR 0132).
          expect("asks" in (back as Exercise) ? (back as { asks?: unknown }).asks : undefined, `${id} ${ex.id}`).toBe("asks" in ex ? ex.asks : undefined);
          checked += 1;
        }
      }
    }
    // Gap-fill, complete-the-translation, vowel marks and readings in context, in several courses.
    expect(checked).toBeGreaterThan(30);
  });

  // A gap-fill on a sentence of several words, each its own KC: a blank on another word is another card.
  const es = loadCourse("es");
  const node = lessonNodes(es).find((n) =>
    plan(es, emptyLearnerState(), { mode: "lesson", node: n.node.id }, { now: NOW, seed: 3 }).exercises.some((e) => e.template === "gap-fill"),
  )?.node.id;
  if (node === undefined) throw new Error("es plans a gap-fill");
  const lesson = plan(es, emptyLearnerState(), { mode: "lesson", node }, { now: NOW, seed: 3 }).exercises;
  const gap = lesson.find((e) => e.template === "gap-fill") as Exercise;
  const other = gap.kcs.find((kc) => !(askedKcs(gap) ?? []).includes(kc));
  if (other === undefined) throw new Error("the gap-fill's sentence has another word");
  /** The same card answered right, credited as though its blank were another word of the sentence. */
  const aboutAnother = (): LearnerEvent => {
    const events = eventFactory(es, manifestOf("es").id);
    events.at(LATER);
    const e = events.answer(gap, true, 1) as LearnerEvent & { outcome: { kcs: KcCredit[] } };
    return { ...e, outcome: { ...e.outcome, kcs: gap.kcs.map((kc): KcCredit => ({ kc, status: kc === other ? "right" : "given" })) } } as LearnerEvent;
  };

  it("stays open after a right answer about another word of the sentence, and closes on its own word", () => {
    const log = missing(es, node, gap, lesson);
    const open = (events: readonly LearnerEvent[]) => replay(events).mistakes.filter((m) => m.item === gap.item && m.template === "gap-fill");
    expect(open(log).map((m) => m.ask?.join("+"))).toEqual([word(gap)]);
    expect(open([...log, aboutAnother()])).toHaveLength(1);
    const events = eventFactory(es, manifestOf("es").id);
    events.at(LATER);
    expect(open([...log, events.answer(gap, true, 1)])).toEqual([]);
  });

  it("is no longer practised once its sentence no longer has the word", () => {
    const state = replay(missing(es, node, gap, lesson));
    expect(practicableMistakes(es, state).some((e) => e.item === gap.item && e.template === "gap-fill")).toBe(true);
    const moved: LearnerState = { ...state, mistakes: state.mistakes.map((m) => (m.item === gap.item ? { ...m, ask: ["sense:no-such-word"] } : m)) };
    expect(practicableMistakes(es, moved).some((e) => e.item === gap.item && e.template === "gap-fill")).toBe(false);
  });
});
