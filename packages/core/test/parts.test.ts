/**
 * A word and its parts (ADR 0152): `parts-whole` (the word built from its parts, typed) and
 * `whole-parts` (its parts picked out). Both are made of every sentence of every fixture course and
 * checked: a course that has not switched them on plans none, so its lessons never show these here.
 */
import type { BundleLabel, BundleSentence } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { askedParts, creditOf } from "../src/learner/credit.ts";
import { applyEvents, emptyLearnerState, parseCardKey, plan, practicableMistakes, type LearnerState } from "../src/learner/index.ts";
import {
  allSentences,
  baseOf,
  bound,
  cardGallery,
  courseExclusions,
  createGrader,
  gradeExercise,
  isCorrect,
  labelOf,
  lessonNodes,
  lexemeIdsOf,
  lexemesById,
  makePartsWhole,
  makeWholeParts,
  PARTS,
  retryOf,
  sampleExercise,
  seededRng,
  type CourseView,
  type Exercise,
  type MakeContext,
  type PartsWhole,
  type WholeParts,
  type WordPart,
} from "../src/lesson/index.ts";
import { labelId } from "../src/lesson/templates.ts";
import { effectiveFeats } from "../src/lesson/lexemes.ts";
import { surfaceOf } from "../src/text/index.ts";
import { rightAnswer, wrongAnswer } from "./answers.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";
import { walkPath } from "./planned.ts";

/**
 * Every fixture course, in each orthography it is learned in, and what its words carry: forms the
 * course asks by these cards ("asked"), a form or two it does not ("few": Cantonese has one, the
 * pronouns' plural, with no other form to tell it from), or none.
 */
const COURSES: readonly (readonly [string, string, "asked" | "few" | "none"])[] = [
  ["apc", "apc-Arab/standard", "asked"],
  ["apc", "apc-Latn/arabizi", "asked"],
  ["chg", "chg-Arab/standard", "asked"],
  ["es", "es-Latn/standard", "asked"],
  ["fa", "fa-Arab/standard", "asked"],
  ["grc", "grc-Grek/polytonic", "asked"],
  ["hbo", "hbo-Hebr/tiberian", "asked"],
  ["lzh", "lzh-Hant/standard", "none"],
  ["tok", "tok-Latn/standard", "none"],
  ["tok", "tok-Qaap/sitelen-pona", "none"],
  ["uz", "uz-Latn/standard", "asked"],
  ["uz", "uz-Cyrl/standard", "asked"],
  ["yue", "yue-Hant-HK/standard", "few"],
  ["yue", "yue-Latn/jyutping", "few"],
];

interface Made {
  readonly sentence: BundleSentence;
  readonly build: PartsWhole | undefined;
  readonly apart: WholeParts | undefined;
}

const made = new Map<string, { readonly course: CourseView; readonly cards: readonly Made[] }>();

/** Both cards of every sentence of a course, made once (a fresh rng per sentence: each card is its own). */
const cardsOf = (id: string, orthography: string): { readonly course: CourseView; readonly cards: readonly Made[] } => {
  const key = `${id} ${orthography}`;
  let found = made.get(key);
  if (found === undefined) {
    const course = loadCourse(id, orthography);
    const cards = allSentences(course).map((sentence, i): Made => {
      const ctx: MakeContext = { course, rng: seededRng(i + 1), introduced: [] };
      return { sentence, build: makePartsWhole(ctx, sentence), apart: makeWholeParts(ctx, sentence) };
    });
    found = { course, cards };
    made.set(key, found);
  }
  return found;
};

const label = (part: WordPart): string => surfaceOf(part.text ?? part.gloss);

describe.each(COURSES)("the parts cards of %s (%s)", (id, orthography, forms) => {
  it(forms === "asked" ? "makes both cards from its sentences" : forms === "few" ? "takes no word apart: there is no other form to offer" : "makes none: its words carry no forms", () => {
    const { course, cards } = cardsOf(id, orthography);
    const builds = cards.filter((c) => c.build !== undefined).length;
    const aparts = cards.filter((c) => c.apart !== undefined).length;
    expect(course.wordParts === true).toBe(forms === "asked");
    if (forms === "asked") {
      expect(builds).toBeGreaterThan(20);
      expect(aparts).toBeGreaterThan(20);
    } else {
      if (forms === "none") expect(builds).toBe(0);
      expect(aparts).toBe(0);
    }
  });

  it("builds a word from its own word and the forms it carries, in the sentence's place for it", () => {
    const { course, cards } = cardsOf(id, orthography);
    const lexemes = lexemesById(course);
    for (const { sentence, build } of cards) {
      if (build === undefined) continue;
      const text = sentence.forms[orthography]?.text;
      expect(text, sentence.id).toBeDefined();
      expect(`${surfaceOf(build.before)}${surfaceOf(build.whole)}${surfaceOf(build.after)}`, sentence.id).toBe(surfaceOf(text as NonNullable<typeof text>));
      expect(build.whole.tokens.length, sentence.id).toBe(1);
      expect(build.wordParts.length, sentence.id).toBeGreaterThanOrEqual(2);
      expect(build.wordParts.filter((p) => p.base === true).length, sentence.id).toBe(1);
      expect(build.wordParts.filter((p) => p.text === undefined).length, sentence.id).toBeGreaterThanOrEqual(1);
      expect(new Set(build.wordParts.map((p) => p.id)).size, sentence.id).toBe(build.wordParts.length);
      // A lexeme the course cites is shown as the course writes it; a form, and a lexeme written only
      // inside words (an ending: `bound`), is named.
      for (const part of build.wordParts) {
        const lexeme = lexemes.get(part.id);
        expect(lexeme !== undefined && !bound(lexeme), `${sentence.id} ${part.id}`).toBe(part.text !== undefined);
        if (lexeme === undefined) expect(part.id.startsWith("form:"), `${sentence.id} ${part.id}`).toBe(true);
      }
    }
  });

  it("takes the word typed, and never a part typed as the card shows it", () => {
    const { course, cards } = cardsOf(id, orthography);
    const grader = createGrader(course);
    for (const { sentence, build } of cards) {
      if (build === undefined) continue;
      expect(isCorrect(gradeExercise(build, rightAnswer(build), grader).verdict), `${sentence.id} ${surfaceOf(build.whole)}`).toBe(true);
      const wrong = wrongAnswer(build);
      expect(wrong !== undefined && isCorrect(gradeExercise(build, wrong, grader).verdict), sentence.id).toBe(false);
      for (const part of build.wordParts) {
        if (part.text === undefined) continue;
        const typed = gradeExercise(build, { tag: "text", text: surfaceOf(part.text) }, grader);
        expect(isCorrect(typed.verdict), `${sentence.id}: ${surfaceOf(part.text)} is taken for ${surfaceOf(build.whole)}`).toBe(false);
      }
    }
  });

  it("credits a word built or taken apart to its forms; its words, shown on the card, are given", () => {
    const { course, cards } = cardsOf(id, orthography);
    /** What a card's named parts credit: each lexeme named, and each value a form names that the sentence teaches. */
    const formsAmong = (parts: readonly WordPart[], taught: readonly string[]): readonly string[] => [
      ...new Set(parts.filter((p) => p.text === undefined).flatMap((p) => p.parts.filter((part) => !part.startsWith("feature:") || taught.includes(part)))),
    ];
    for (const { sentence, build, apart } of cards) {
      if (build !== undefined) {
        const asked = askedParts(build) ?? [];
        expect(asked, sentence.id).toEqual(formsAmong(build.wordParts, sentence.parts));
        expect(asked.length, sentence.id).toBeGreaterThan(0);
        // Nothing the card shows as written is asked.
        for (const part of asked) expect(build.wordParts.some((p) => p.text !== undefined && p.id === part), `${sentence.id} ${part}`).toBe(false);
        // Each lexeme and each part asked is one of the sentence's: nothing is credited that the sentence does not teach.
        for (const part of [...build.wordParts.filter((p) => p.id.startsWith("lexeme:")).map((p) => p.id), ...asked]) expect(sentence.parts, `${sentence.id} ${part}`).toContain(part);
        const credit = creditOf(build, { verdict: "CORRECT", notes: [] }, course.profiles);
        for (const word of build.wordParts.filter((p) => p.text !== undefined)) expect(credit.find((c) => c.part === word.id)?.status, `${sentence.id} ${word.id}`).toBe("given");
        for (const part of asked) expect(credit.find((c) => c.part === part)?.status, `${sentence.id} ${part}`).toBe("right");
      }
      if (apart !== undefined) {
        const asked = askedParts(apart) ?? [];
        const own = apart.solution.map((i) => apart.options[i] as WordPart);
        expect(asked, sentence.id).toEqual(formsAmong(own, sentence.parts));
        expect(asked.length, sentence.id).toBeGreaterThan(0);
        for (const part of [...own.filter((p) => p.id.startsWith("lexeme:")).map((p) => p.id), ...asked]) expect(sentence.parts, `${sentence.id} ${part}`).toContain(part);
        const credit = creditOf(apart, { verdict: "WRONG", notes: [] }, course.profiles);
        for (const word of own.filter((p) => p.text !== undefined)) expect(credit.find((c) => c.part === word.id)?.status, `${sentence.id} ${word.id}`).toBe("given");
        for (const part of asked) expect(credit.find((c) => c.part === part)?.status, `${sentence.id} ${part}`).toBe("wrong");
      }
    }
  });

  it("offers a word's parts among others: no two alike, none of the others the word's own", () => {
    const { course, cards } = cardsOf(id, orthography);
    const labelsById = new Map((course.lexicon.labels ?? []).map((l) => [labelId(l), l] as const));
    /** What a named form adds to a word of a part of speech: its values but those of the cell its lexemes are cited in. */
    const added = (l: BundleLabel, pos: string | undefined): readonly string[] =>
      Object.keys(l.feats)
        .filter((name) => (pos === undefined ? undefined : course.lexicon.bare?.[pos]?.[name]) !== l.feats[name])
        .map((name) => `${name}=${l.feats[name] ?? ""}`);
    for (const { sentence, apart } of cards) {
      if (apart === undefined) continue;
      const token = apart.prompt.tokens[apart.word];
      expect(token?.kind, sentence.id).toBe("lexical");
      expect(apart.solution.length, sentence.id).toBeGreaterThanOrEqual(2);
      expect(new Set(apart.solution).size, sentence.id).toBe(apart.solution.length);
      expect(apart.options.length - apart.solution.length, sentence.id).toBeGreaterThanOrEqual(2);
      // A form the word does not have is among them: its own forms are not the only ones offered.
      expect(apart.options.some((o, i) => o.text === undefined && !apart.solution.includes(i)), sentence.id).toBe(true);
      const labels = apart.options.map(label);
      expect(new Set(labels).size, `${sentence.id}: ${labels.join(" | ")}`).toBe(labels.length);
      expect(new Set(apart.options.map((o) => o.id)).size, sentence.id).toBe(apart.options.length);
      const own = apart.solution.map((i) => apart.options[i] as WordPart);
      expect(own.filter((p) => p.base === true).length, sentence.id).toBe(1);
      // No other form's name adds only what the name the word stands in adds, or the reverse (feminine
      // beside feminine plural): it might be true of the word too. No other part is a lexeme the word writes.
      const base = token === undefined ? undefined : baseOf(token);
      const entry = lexemesById(course).get(base?.lexeme ?? "");
      const carried = token === undefined || Object.keys(base?.feats ?? {}).length === 0 ? undefined : labelOf(course, effectiveFeats(token, entry), entry?.pos);
      const written = token === undefined ? [] : lexemeIdsOf(token);
      for (const [i, option] of apart.options.entries()) {
        if (apart.solution.includes(i)) continue;
        expect(option.base, sentence.id).toBeUndefined();
        expect(written, `${sentence.id}: ${option.id}`).not.toContain(option.id);
        const other = labelsById.get(option.id);
        if (carried === undefined || other === undefined) continue;
        const a = added(carried, entry?.pos);
        const b = added(other, entry?.pos);
        expect(a.every((p) => b.includes(p)) || b.every((p) => a.includes(p)), `${sentence.id}: ${option.id} beside ${labelId(carried)}`).toBe(false);
      }
    }
  });

  it("takes a word's parts in any order, and nothing less or more", () => {
    const { course, cards } = cardsOf(id, orthography);
    const grader = createGrader(course);
    for (const { sentence, apart } of cards) {
      if (apart === undefined) continue;
      const other = apart.options.findIndex((_, i) => !apart.solution.includes(i));
      const verdict = (order: readonly number[]): string => gradeExercise(apart, { tag: "tiles", order }, grader).verdict;
      expect(verdict(apart.solution), sentence.id).toBe("CORRECT");
      expect(verdict([...apart.solution].reverse()), sentence.id).toBe("CORRECT");
      expect(verdict(apart.solution.slice(1)), sentence.id).toBe("WRONG");
      expect(verdict([...apart.solution, other]), sentence.id).toBe("WRONG");
      expect(verdict([...apart.solution.slice(1), other]), sentence.id).toBe("WRONG");
      const wrong = wrongAnswer(apart);
      expect(wrong !== undefined && isCorrect(gradeExercise(apart, wrong, grader).verdict), sentence.id).toBe(false);
    }
  });

  it("brings a missed card back with its parts in a new order, the same parts right", () => {
    const { course, cards } = cardsOf(id, orthography);
    const grader = createGrader(course);
    for (const { sentence, apart } of cards.slice(0, 60)) {
      if (apart === undefined) continue;
      const again = retryOf(apart, 1);
      if (again.template !== "whole-parts") throw new Error("a retry keeps its template");
      expect(again.options.map((o) => o.id).sort(), sentence.id).toEqual(apart.options.map((o) => o.id).sort());
      expect(again.solution.map((i) => again.options[i]?.id), sentence.id).toEqual(apart.solution.map((i) => apart.options[i]?.id));
      expect(gradeExercise(again, rightAnswer(again), grader).verdict, sentence.id).toBe("CORRECT");
    }
  });

  it("asks a mistake's word again, and no other", () => {
    const { course, cards } = cardsOf(id, orthography);
    for (const [i, { sentence, build, apart }] of cards.slice(0, 80).entries()) {
      for (const [card, make] of [
        [build, makePartsWhole],
        [apart, makeWholeParts],
      ] as const) {
        if (card === undefined) continue;
        const ask = [...new Set((askedParts(card) ?? []).map(String))].sort();
        const again = make({ course, rng: seededRng(1000 + i), introduced: [], ask }, sentence);
        expect(again, `${sentence.id} ${card.template}`).toBeDefined();
        expect([...new Set((askedParts(again as NonNullable<typeof again>) ?? []).map(String))].sort(), sentence.id).toEqual(ask);
        // A word the sentence does not have is not asked.
        expect(make({ course, rng: seededRng(1), introduced: [], ask: ["lexeme:no-such-word"] }, sentence), sentence.id).toBeUndefined();
      }
    }
  });

  it("plans them only where the course switched them on", () => {
    const { course } = cardsOf(id, orthography);
    const excluded = courseExclusions(course);
    for (const template of PARTS) {
      expect(excluded.has(template), template).toBe(course.wordParts !== true);
      if (course.wordParts !== true) {
        expect(sampleExercise(course, template), template).toBeUndefined();
        expect(cardGallery(course).some((c) => c.template === template), template).toBe(false);
      }
    }
  });
});

describe("a word and its parts in a learner's sessions", () => {
  const DAY = 86_400_000;
  const START = Date.parse("2026-02-02T09:00:00.000Z");
  const iso = (ms: number): string => new Date(ms).toISOString();

  /** A learner's state after the first `lessons` lessons of a course, one a day, every card right. */
  const after = (course: CourseView, lessons: number): { readonly state: LearnerState; readonly at: number; readonly events: ReturnType<typeof eventFactory> } => {
    const events = eventFactory(course, manifestOf(course.id).id);
    let state = emptyLearnerState();
    let at = START;
    for (const { node } of lessonNodes(course).slice(0, lessons)) {
      const now = iso(at);
      events.at(now);
      events.session();
      const planned = plan(course, state, { mode: "lesson", node: node.id }, { now, today: now.slice(0, 10), seed: 11 });
      state = applyEvents(state, [
        events.started("lesson", node.id, planned.exercises.length),
        ...planned.exercises.map((ex) => events.answer(ex, true, 1)),
        events.completed("lesson", node.id, { exercises: planned.exercises.length, correctFirstTry: planned.exercises.length, retries: 0 }),
      ]);
      at += DAY;
    }
    return { state, at, events };
  };

  // A missed card of either kind is the session's only mistake. A mistakes session practises its
  // mistakes and owes no typing slots (ADR 0101), so a built word waits for nothing there.
  for (const [id, orthography] of [
    ["es", "es-Latn/standard"],
    ["uz", "uz-Latn/standard"],
    ["hbo", "hbo-Hebr/tiberian"],
  ] as const)
    it(`brings a missed card back in a mistakes session, alone (${id})`, () => {
      const course = loadCourse(id, orthography);
      const { state, at, events } = after(course, 8);
      const seen = new Set(Object.keys(state.cards).map((k) => parseCardKey(k).part));
      expect(state.mistakes).toEqual([]);
      for (const make of [makePartsWhole, makeWholeParts]) {
        const card = allSentences(course)
          // A lexeme's own feature (lexeme:mano|Gender) is never a card: it is no part to have seen.
          .filter((s) => s.parts.every((part) => part.includes("|") || seen.has(part)))
          .map((s, i) => make({ course, rng: seededRng(i + 1), introduced: [] }, s))
          .find((ex) => ex !== undefined);
        if (card === undefined) throw new Error(`${id} makes a card of words the learner has seen`);
        events.at(iso(at));
        events.session();
        const missed = applyEvents(state, [events.answer(card, false, 1)]);
        expect(missed.mistakes.map((m) => [m.item, m.template]), card.template).toEqual([[card.item, card.template]]);
        const now = iso(at + DAY);
        const session = plan(course, missed, { mode: "mistakes" }, { now, today: now.slice(0, 10), seed: 5 }).exercises;
        expect(session.map((ex) => [ex.item, ex.template, askedParts(ex)]), card.template).toEqual([[card.item, card.template, askedParts(card)]]);
        expect(practicableMistakes(course, missed).map((ex) => ex.id), card.template).toEqual(session.map((ex) => ex.id));
        // Answered right, about its word, the mistake is closed.
        events.at(now);
        events.session();
        expect(applyEvents(missed, [events.answer(session[0] as (typeof session)[number], true, 1)]).mistakes, card.template).toEqual([]);
      }
    });

  // What plan() plans learners who walk the path, missing every seventh card (test/planned.ts). How
  // often a card comes rests on three learners: one walk's count turns on its seed (a Spanish lesson
  // now has a spelling card too, ADR 0148, and one learner's walk went from 14 words taken apart to
  // 1 while the two beside it kept 11 and 20), the three together do not.
  const WALKS = [7, 8, 9];
  for (const [id, orthography] of [
    ["es", "es-Latn/standard"],
    ["hbo", "hbo-Hebr/tiberian"],
  ] as const)
    it(`plans both along the path, at most one of each a session (${id})`, () => {
      const course = loadCourse(id, orthography);
      const walks = WALKS.map((seed) => walkPath(course, { lessons: 24, seed }));
      const count = (exercises: readonly Exercise[], template: Exercise["template"]): number => exercises.filter((ex) => ex.template === template).length;
      for (const template of PARTS) {
        let planned = 0;
        for (const [i, sessions] of walks.entries()) {
          for (const s of sessions) expect(count(s.plan.exercises, template), `learner ${String(WALKS[i])} ${s.label} ${template}`).toBeLessThanOrEqual(1);
          const lessons = sessions.filter((s) => s.request.mode === "lesson");
          const own = lessons.reduce((a, s) => a + count(s.plan.exercises, template), 0);
          // Every learner meets the card along the path.
          expect(own, `learner ${String(WALKS[i])} ${template}`).toBeGreaterThan(0);
          planned += own;
        }
        // More than three a learner, on average, in twenty-four lessons.
        expect(planned / walks.length, template).toBeGreaterThan(3);
      }
    });
});
