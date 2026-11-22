/**
 * What the statements leave to learn (ADR 0148, "Done in one go" 4 and 5): the bundle's leftovers
 * as the compiler writes them, credit and the cards that ask them, the fold's count of misses per
 * correspondence, and the readers the word list uses (`partsOf`, `ruleEntries`, `missedLetters`).
 */
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { creditOf } from "../src/learner/credit.ts";
import { exerciseRefOf, learnerEventOf, practised, progressResetOf } from "../src/learner/events.ts";
import { cardKey, emptyLearnerState, missedLetters, partsOf, plan, replay, ruleEntries, ruleMatcher } from "../src/learner/index.ts";
import { allSentences, glossOfPart, labelOf, ownFeatureLabel } from "../src/lesson/index.ts";
import { surfaceOf } from "../src/text/index.ts";
import { createGrader, gradeExercise, lessonNodes, lexemesById, sampleExercise, seededRng, type CourseView, type Exercise, type TranslateType } from "../src/lesson/index.ts";
import { makeTranslateType } from "../src/lesson/templates.ts";
import { replayBefore } from "./fold-before-r2.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const es = loadCourse("es");
const ES = "es-Latn/standard" as OrthographyId;

const typed = (course: CourseView, id: string): TranslateType => {
  const s = allSentences(course).find((x) => x.id === id);
  const ex = s === undefined ? undefined : makeTranslateType({ course, rng: seededRng(1), introduced: [] }, s);
  if (ex === undefined) throw new Error(`${id} has no translate-type card`);
  return ex;
};

describe("the bundle's leftovers (the compiler, through core)", () => {
  it("es: words a fixed correspondence could spell otherwise, and only those", () => {
    const projection = es.profiles.get(ES)?.projection;
    if (projection?.from !== "spelling") throw new Error("es reads its sound off its spelling");
    let listed = 0;
    for (const lexeme of es.lexicon.lexemes) {
      const first = lexeme.forms?.[ES]?.[0];
      if (first === undefined) continue;
      const others = first.tokens.filter((t) => t.kind === "lexical").some((t) => projection.spellings(t.surface).length > 0);
      expect(lexeme.leftovers?.spelling?.includes(ES) ?? false, lexeme.id).toBe(others);
      if (others) listed += 1;
    }
    expect(listed).toBeGreaterThan(100);
  });

  it("chg: words whose reading the Arabic script leaves open, in Schluessel's", () => {
    const chg = loadCourse("chg");
    const open = chg.lexicon.lexemes.filter((l) => l.leftovers?.reading?.some((r) => r.scheme === "schluessel" && r.orthography === "chg-Arab/standard"));
    expect(open.length).toBeGreaterThan(100);
    expect(chg.lexicon.lexemes.some((l) => l.leftovers?.spelling !== undefined)).toBe(false);
  });

  it("none where the statements lose nothing (uz, tok)", () => {
    for (const id of ["uz", "tok"]) expect(loadCourse(id).lexicon.lexemes.some((l) => l.leftovers !== undefined), id).toBe(false);
  });

  it("grc's words with a vowel the letters leave long or short have a reading leftover in attic, and no spelling one", () => {
    const grc = loadCourse("grc");
    const open = grc.lexicon.lexemes.filter((l) => l.leftovers !== undefined);
    expect(open.length).toBeGreaterThan(50);
    for (const l of open) {
      expect(l.leftovers?.spelling, l.id).toBeUndefined();
      expect(l.leftovers?.reading, l.id).toEqual([{ orthography: "grc-Grek/polytonic", scheme: "attic" }]);
    }
  });
});

describe("a course that does not write gets no write-script credit (facets, ADR 0071)", () => {
  it("lzh does not practise write-script; es does", () => {
    const lzh = loadCourse("lzh");
    expect(practised(lzh, "write-script")).toBe(false);
    expect(practised(es, "write-script")).toBe(true);
    expect(practised(lzh, "produce")).toBe(true);
  });

  it("the answer event leaves out a spelling leftover's credit where the course does not practise it", () => {
    const lzh = loadCourse("lzh");
    // lzh states no leftovers: give every lexeme one, as a course that did would.
    const pretend: CourseView = { ...lzh, lexicon: { ...lzh.lexicon, lexemes: lzh.lexicon.lexemes.map((l) => ({ ...l, leftovers: { spelling: [lzh.orthography as OrthographyId] } })) } };
    const ex = sampleExercise(pretend, "translate-type.l1-l2");
    if (ex?.template !== "translate-type.l1-l2") throw new Error("lzh has a typed card");
    const graded = gradeExercise(ex, { tag: "text", text: ex.canonical.tokens.map((t) => t.surface).join("") }, createGrader(pretend));
    expect(creditOf(ex, graded, pretend.profiles, lexemesById(pretend)).some((c) => c.skill === "write-script")).toBe(true);
    const meta = { id: "00000000-0000-7000-8000-000000000001", clientTime: "2026-11-21T10:00:00.000Z", localDate: "2026-11-21", tz: "UTC", device: "d", session: "s", bundle: "b" };
    const e = learnerEventOf({ type: "answer_submitted", exercise: exerciseRefOf(ex), response: { tag: "text", text: "x" }, outcome: { kind: graded.verdict, notes: graded.notes }, ex, graded }, pretend, meta, { mode: "lesson", seed: 1, planner: "test" });
    expect(e?.type === "answer_submitted" && e.outcome.parts.some((c) => c.skill === "write-script")).toBe(false);
  });

  it("and plans no spelling card", () => {
    const lzh = loadCourse("lzh");
    expect(sampleExercise(lzh, "spelling-choice")).toBeUndefined();
  });
});

describe("the fold counts misses per correspondence (ADR 0148), and schedules nothing", () => {
  const ex = typed(es, "s.u03.2");
  const events = eventFactory(es, manifestOf("es").id);
  const missing = (at: string, ids: readonly string[], correct = false): LearnerEvent => {
    events.at(at);
    const e = events.answer(ex, correct, 1);
    if (e.type !== "answer_submitted") throw new Error("an answer");
    return { ...e, outcome: { ...e.outcome, labels: correct ? [] : ["orthographic"], correspondences: [...ids] } };
  };
  const log = [
    missing("2026-03-01T08:00:00.000Z", [`${ES}:s`, `${ES}:b`]),
    missing("2026-03-02T08:00:00.000Z", [`${ES}:s`, `${ES}:s`]),
    missing("2026-03-03T08:00:00.000Z", [`${ES}:h`], true),
    missing("2026-03-04T08:00:00.000Z", [`${ES}:~h`]),
  ];

  it("counts each answer not accepted once per correspondence, with when last", () => {
    const state = replay(log);
    expect(state.letters).toEqual({
      [`${ES}:s`]: { missed: 2, last: "2026-03-02T08:00:00.000Z" },
      [`${ES}:b`]: { missed: 1, last: "2026-03-01T08:00:00.000Z" },
      [`${ES}:~h`]: { missed: 1, last: "2026-03-04T08:00:00.000Z" },
    });
    expect(missedLetters(state).map((m) => m.id)).toEqual([`${ES}:s`, `${ES}:~h`, `${ES}:b`]);
    // No card is kept for a correspondence.
    expect(Object.keys(state.cards).some((k) => k.includes(`${ES}:`))).toBe(false);
  });

  it("as the oracle fold does, and a log without them counts none", () => {
    expect(replayBefore(log)).toEqual(replay(log));
    const plain = log.map((e) => (e.type === "answer_submitted" ? { ...e, outcome: { kind: e.outcome.kind, notes: e.outcome.notes, labels: e.outcome.labels, parts: e.outcome.parts } } : e));
    expect(replay(plain).letters).toEqual({});
  });

  it("forgets them when the course is started over", () => {
    const reset = progressResetOf(es, { id: "00000000-0000-7000-9000-000000000001", clientTime: "2026-03-05T08:00:00.000Z", localDate: "2026-03-05", tz: "UTC", device: "d", session: "00000000-0000-7000-a000-000000000001", bundle: manifestOf("es").id });
    expect(replay([...log, reset]).letters).toEqual({});
    expect(replayBefore([...log, reset])).toEqual(replay([...log, reset]));
  });
});

describe("a word's spelling is missed only where it has one to miss (ADR 0148)", () => {
  /** The sentence's own answer typed with one word traded, graded, and what the answer is credited. */
  const traded = (course: CourseView, id: string, from: string, to: string): { graded: ReturnType<typeof gradeExercise>; credits: ReturnType<typeof creditOf> } => {
    const ex = typed(course, id);
    expect(ex.canonical.tokens.some((t) => t.surface === from), `${id} writes ${from}`).toBe(true);
    const graded = gradeExercise(ex, { tag: "text", text: ex.canonical.tokens.map((t) => (t.surface === from ? to : t.surface)).join("") }, createGrader(course));
    return { graded, credits: creditOf(ex, graded, course.profiles, lexemesById(course)) };
  };
  const missedSpellings = (credits: ReturnType<typeof creditOf>): readonly string[] => credits.filter((c) => c.skill === "write-script" && c.status === "wrong").map((c) => String(c.part));

  it("es: caza for casa misses casa's spelling, and counts against the correspondence", () => {
    const { graded, credits } = traded(es, "s.u03.1", "casa", "caza");
    expect(graded.labels).toEqual(["orthographic"]);
    expect(graded.correspondences).toEqual([`${ES}:s`]);
    expect(lexemesById(es).get("lexeme:casa")?.leftovers?.spelling).toContain(ES);
    expect(missedSpellings(credits)).toEqual(["lexeme:casa"]);
  });

  it("es: akí for aquí is a spelling the norm never uses there: the correspondence alone", () => {
    const { graded, credits } = traded(es, "s.u03.9", "aquí", "akí");
    expect(graded.labels).toEqual(["orthographic"]);
    expect(graded.correspondences).toEqual([`${ES}:k`]);
    // No card could ask aquí's spelling again: it has no other the norm would write.
    expect(lexemesById(es).get("lexeme:aquí")?.leftovers?.spelling).toBeUndefined();
    expect(missedSpellings(credits)).toEqual([]);
    // The word was the right one, by the card's skill.
    expect(credits).toContainEqual({ part: "lexeme:aquí", skill: "produce", status: "right" });
  });

  it("uz in Cyrillic: two letters for one likewise", () => {
    const uz = loadCourse("uz", "uz-Cyrl/standard");
    const { graded, credits } = traded(uz, "s.12", "яхши", "йахши");
    expect(graded.labels).toEqual(["orthographic"]);
    expect(graded.correspondences).toEqual(["uz-Cyrl/standard:я"]);
    expect(missedSpellings(credits)).toEqual([]);
  });

  it("no card of the fold's is left for a word with no spelling to miss", () => {
    const { graded } = traded(es, "s.u03.9", "aquí", "akí");
    const ex = typed(es, "s.u03.9");
    const meta = { id: "00000000-0000-7000-8000-000000000002", clientTime: "2026-11-01T10:00:00.000Z", localDate: "2026-11-01", tz: "UTC", device: "d", session: "00000000-0000-7000-8000-0000000000aa", bundle: manifestOf("es").id };
    const e = learnerEventOf({ type: "answer_submitted", exercise: exerciseRefOf(ex), response: { tag: "text", text: "x" }, outcome: { kind: graded.verdict, notes: graded.notes }, ex, graded }, es, meta, { mode: "lesson", seed: 1, planner: "test" });
    if (e?.type !== "answer_submitted") throw new Error("an answer");
    const state = replay([e]);
    expect(state.cards[cardKey("lexeme:aquí", "write-script", ES)]).toBeUndefined();
    // The count is kept all the same.
    expect(state.letters[`${ES}:k`]?.missed).toBe(1);
  });
});

/** A learner who answered every card of the first lessons right, on two days running. */
const twoDays = (course: CourseView, lessons: number): { state: ReturnType<typeof replay>; exercises: readonly Exercise[] } => {
  const events = eventFactory(course, manifestOf(course.id).id);
  const log: LearnerEvent[] = [];
  const exercises: Exercise[] = [];
  for (const [day, at] of ["2026-03-01T08:00:00.000Z", "2026-03-02T08:00:00.000Z"].entries()) {
    events.at(at);
    for (const { node } of lessonNodes(course).slice(0, lessons)) {
      events.session();
      const p = plan(course, replay(log), { mode: "lesson", node: node.id }, { now: at, seed: 3 + day });
      exercises.push(...p.exercises);
      log.push(events.started("lesson", node.id, p.exercises.length), ...p.exercises.map((ex) => events.answer(ex, true, 1)));
    }
  }
  return { state: replay(log), exercises };
};

describe("a word's parts, each shown or not (partsOf)", () => {
  it("es: the skills asked, a typed word's spelling leftover, its own gender not yet asked", () => {
    const { state, exercises } = twoDays(es, 3);
    const typedWords = new Set(exercises.filter((ex) => ex.template === "translate-type.l1-l2").flatMap((ex) => ex.parts.map(String)));
    const lexemes = lexemesById(es);
    const shownSpelling = [...typedWords].filter((id) => partsOf(es, state, id).some((p) => p.kind === "spelling" && p.status === "shown"));
    expect(shownSpelling.length).toBeGreaterThan(0);
    for (const id of shownSpelling) {
      expect(lexemes.get(id)?.leftovers?.spelling).toContain(ES);
      expect(state.shown[cardKey(id, "write-script", ES)]).toBeDefined();
    }
    // A word with no spelling leftover is asked none.
    const plain = [...lexemes.values()].find((l) => l.leftovers === undefined && l.forms?.[ES] !== undefined);
    expect(partsOf(es, state, plain?.id as string).some((p) => p.kind === "spelling")).toBe(false);
    // A lexical feature of its own that no default gives: a part, given on every card today.
    const own = [...lexemes.values()].find((l) => (l.parts ?? []).some((p) => p === `${l.id}|Gender`));
    if (own === undefined) throw new Error("es has a noun whose gender no default gives");
    expect(partsOf(es, state, own.id)).toContainEqual({ kind: "feature", part: `${own.id}|Gender`, status: "not-asked" });
    // Named as the language labels its lemma's form (the word list's entry): a feminine noun's
    // feminine singular; a masculine noun's is the bare cell, which no label names.
    const fem = [...lexemes.values()].find((l) => l.pos === "NOUN" && l.feats?.["Gender"] === "Fem" && (l.parts ?? []).includes(`${l.id}|Gender`));
    if (fem === undefined) throw new Error("es has a feminine noun whose gender no default gives");
    expect(ownFeatureLabel(es, `${fem.id}|Gender`)).toEqual(labelOf(es, { Gender: "Fem", Number: "Sing" }, "NOUN")?.gloss[es.supportKey]);
    const feminine = ownFeatureLabel(es, `${fem.id}|Gender`);
    expect(feminine === undefined ? "" : surfaceOf(feminine)).toMatch(/^feminine/u);
    const masc = [...lexemes.values()].find((l) => l.pos === "NOUN" && l.feats?.["Gender"] === "Masc" && (l.parts ?? []).includes(`${l.id}|Gender`));
    if (masc === undefined) throw new Error("es has a masculine noun whose gender no default gives");
    expect(ownFeatureLabel(es, `${masc.id}|Gender`)).toBeUndefined();
    expect(ownFeatureLabel(es, own.id)).toBeUndefined();
    expect(ownFeatureLabel(es, "lexeme:no-such-word|Gender")).toBeUndefined();
    // The skills come first, as skillsAsked asks them.
    const parts = partsOf(es, state, shownSpelling[0] as string);
    expect(parts.filter((p) => p.kind === "skill").map((p) => p.skill)[0]).toBe("recognize");
    expect(partsOf(es, state, "lexeme:no-such-word")).toEqual([]);
  });

  it("chg: a reading leftover, shown by a reading card read right on a later day", () => {
    const chg = loadCourse("chg");
    const { state, exercises } = twoDays(chg, 6);
    const read = new Set(exercises.filter((ex) => ex.template === "char-read" || ex.template === "reading-feature").flatMap((ex) => ex.parts.map(String)));
    const shown = [...read].filter((id) => partsOf(chg, state, id).some((p) => p.kind === "reading" && p.status === "shown"));
    expect(shown.length).toBeGreaterThan(0);
    for (const id of shown) expect(partsOf(chg, state, id)).toContainEqual({ kind: "reading", orthography: "chg-Arab/standard", scheme: "schluessel", status: "shown" });
  });
});

describe("rules and forms have entries (ruleEntries)", () => {
  it("es: each feature value met, by its label, in course order, with how many skills are shown", () => {
    const { state } = twoDays(es, 4);
    const entries = ruleEntries(es, state);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(state.met[e.part], e.part).toBeDefined();
      expect(e.part.includes("|")).toBe(false);
      expect(e.shown).toBe(e.skills.filter((k) => k.shown).length);
      expect(e.shown).toBeLessThanOrEqual(e.skills.length);
    }
    const features = entries.filter((e) => e.kind === "feature");
    expect(features.length).toBeGreaterThan(0);
    // Labelled as glossOfPart labels it: where language.yaml names the value alone (es names Tense=Pres only
    // with a person, so none of the first lessons' values has a label of its own).
    for (const e of entries) expect(e.label, e.part).toEqual(glossOfPart(es, e.part));
    expect(features.every((e) => e.skills.every((k) => k.skill === "read-off" || k.skill === "choose"))).toBe(true);
    expect(ruleEntries(es, emptyLearnerState())).toEqual([]);
  });

  it("an entry is found by the word list's search: by its label, whatever the case, or by its id", () => {
    const apc = loadCourse("apc");
    const { state } = twoDays(apc, 20);
    const entries = ruleEntries(apc, state);
    const labelled = entries.find((e) => e.label !== undefined);
    if (labelled?.label === undefined) throw new Error("apc's entries have a label");
    const word = surfaceOf(labelled.label).split(/\s+/u).find((w) => w.length > 3) ?? surfaceOf(labelled.label);
    expect(entries.filter(ruleMatcher(apc, word.toLocaleUpperCase("en")))).toContain(labelled);
    expect(entries.filter(ruleMatcher(apc, labelled.part))).toContain(labelled);
    expect(entries.filter(ruleMatcher(apc, ""))).toEqual(entries);
    expect(entries.filter(ruleMatcher(apc, "zzzzqq"))).toEqual([]);
  });

  it("apc: a rule the learner met, with its gloss", () => {
    const apc = loadCourse("apc");
    const { state } = twoDays(apc, 20);
    const rules = ruleEntries(apc, state).filter((e) => e.kind === "rule");
    for (const r of rules) expect(r.label, r.part).toBeDefined();
    expect(rules.length + ruleEntries(apc, state).filter((e) => e.kind === "feature").length).toBeGreaterThan(0);
  });
});
