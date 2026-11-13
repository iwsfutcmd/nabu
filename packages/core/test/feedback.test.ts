/**
 * What the feedback on a wrong answer shows (P3 in the 2026-11 review, ADR 0121): the units that differ
 * marked, a missing accent and marks that make another word among them; a gap where units were left out;
 * the solution's words marked where the answer lines up with it; and what a wrong word means.
 */
import type { KcId, SenseId, TaggedText, Token } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import {
  allSentences,
  answerDiff,
  chosenWordOf,
  createGrader,
  diffParts,
  gradeExercise,
  nearMiss,
  profileOf,
  sampleExercise,
  seededRng,
  otherWordsOf,
  solutionMarks,
  type AnswerDiff,
  type CourseView,
  type Exercise,
  type Outcome,
  type TranslateType,
} from "../src/lesson/index.ts";
import { makeTranslateType } from "../src/lesson/templates.ts";
import type { AlignOp } from "../src/match/grade.ts";
import { wordMeanings, writtenMeanings, type WordMeaning } from "../src/story/index.ts";
import { surfaceOf, textOfSurface } from "../src/text/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

const es = loadCourse("es");
const grader = createGrader(es);
const profile = profileOf(es, es.orthography);

const typed = (course: CourseView, id: string): TranslateType => {
  const s = allSentences(course).find((x) => x.id === id);
  const ex = s === undefined ? undefined : makeTranslateType({ course, rng: seededRng(1), introduced: [] }, s);
  if (ex === undefined) throw new Error(`${id} has no translate-type card`);
  return ex;
};

/** The grade of a typed answer, with its alignment and solution. */
const graded = (ex: Exercise, text: string): Outcome & { readonly alignment: readonly AlignOp[]; readonly solution: TaggedText } => {
  const outcome = gradeExercise(ex, { tag: "text", text }, grader);
  if (outcome.alignment === undefined || outcome.solution === undefined) throw new Error(`no alignment for ${text}`);
  return { ...outcome, alignment: outcome.alignment, solution: outcome.solution };
};

const surfaces = (text: TaggedText, indexes: readonly number[]): readonly (string | undefined)[] => indexes.map((i) => text.tokens[i]?.surface);
/** A diff as a view shows it: its runs of text, and "<gap>" for each gap. */
const parts = (diff: AnswerDiff): readonly string[] => diffParts(diff).map((p) => (p.tag === "gap" ? "<gap>" : surfaceOf(p.text)));

// ¿Tú tienes hambre? Its accept set also takes Tienes [tú] hambre.
const hungry = typed(es, "s.u04.29");
// Yasiel también tiene veinticuatro años.
const age = typed(es, "s.u05.25");

describe("what a wrong answer marks (P3)", () => {
  it("a word left out is a gap between the words around it, and the solution marks it where it goes", () => {
    const o = graded(hungry, "Tú hambre");
    expect(o.verdict).toBe("WRONG");
    expect(o.closestIsSolution).toBe(true);
    expect(nearMiss(o.alignment)).toBe(true);
    const diff = answerDiff(o.alignment, o.solution, " ");
    expect(diff.marked).toEqual([]);
    expect(diff.gaps).toHaveLength(1);
    expect(parts(diff)).toEqual(["Tú ", "<gap>", " hambre"]);
    expect(surfaces(o.solution, solutionMarks(o.alignment, o.solution, profile))).toEqual(["tienes"]);
  });

  it("a gap at either end, one for each run of units left out", () => {
    const o = graded(hungry, "Tú tienes");
    expect(parts(answerDiff(o.alignment, o.solution, " "))).toEqual(["Tú tienes ", "<gap>"]);
    expect(surfaces(o.solution, solutionMarks(o.alignment, o.solution, profile))).toEqual(["hambre"]);
    const ops: readonly AlignOp[] = [
      { op: "delete", expected: "a" },
      { op: "delete", expected: "b" },
      { op: "match", expected: "c", actual: "c", kind: "exact" },
      { op: "delete", expected: "d" },
    ];
    const diff = answerDiff(ops, hungry.canonical, " ");
    expect(diff.missing).toBe(3);
    expect(parts(diff)).toEqual(["<gap>", " c ", "<gap>"]);
  });

  it("in a script without spaces a gap sits between the characters", () => {
    const yue = typed(loadCourse("yue"), "s.u03.12").canonical;
    const ops: readonly AlignOp[] = [
      { op: "match", expected: "我", actual: "我", kind: "exact" },
      { op: "delete", expected: "嘅" },
      { op: "match", expected: "書", actual: "書", kind: "exact" },
    ];
    const diff = answerDiff(ops, yue, "");
    expect(diff.gaps).toEqual([1]);
    expect(parts(diff)).toEqual(["我", "<gap>", "書"]);
  });

  it("a missing accent is marked in the answer and the solution, and so are marks that make another word", () => {
    const marks = graded(age, "Yasiel tambien tiene veinticuatro años");
    expect(marks.verdict).toBe("CORRECT_MARKS");
    const diff = answerDiff(marks.alignment, marks.solution, " ");
    expect(surfaces(diff.text, diff.marked)).toEqual(["tambien"]);
    expect(surfaces(marks.solution, solutionMarks(marks.alignment, marks.solution, profile))).toEqual(["también"]);
    const word = graded(hungry, "Tu tienes hambre");
    expect(word.verdict).toBe("WRONG_WORD");
    const wordDiff = answerDiff(word.alignment, word.solution, " ");
    expect(surfaces(wordDiff.text, wordDiff.marked)).toEqual(["Tu"]);
    expect(surfaces(word.solution, solutionMarks(word.alignment, word.solution, profile))).toEqual(["Tú"]);
  });

  it("case and a fold that raises no note mark nothing", () => {
    const o = graded(hungry, "tú tienes hambre");
    expect(o.verdict).toBe("CORRECT");
    expect(answerDiff(o.alignment, o.solution, " ").marked).toEqual([]);
    const silent: AlignOp = { op: "match", expected: "أنا", actual: "انا", kind: "fold", folds: ["hamza-seat"] };
    expect(answerDiff([silent], hungry.canonical, " ").marked).toEqual([]);
    expect(answerDiff([{ ...silent, note: "hamza" }], hungry.canonical, " ").marked).toEqual([0]);
  });

  it("marks nothing in a solution whose words are not the ones the answer lined up with", () => {
    const other: readonly AlignOp[] = [
      { op: "match", expected: "Tienes", actual: "Tienes", kind: "exact" },
      { op: "delete", expected: "hambre" },
    ];
    expect(solutionMarks(other, hungry.canonical, profile)).toEqual([]);
  });

  it("the words an answer has where the solution has others: its slips, and in a near miss the words it put in place of others", () => {
    expect(otherWordsOf(graded(hungry, "Tu tienes hambre").alignment)).toEqual(["Tu"]);
    // hablas is two edits from hablo: no typo, a word put in its place.
    expect(otherWordsOf(graded(hungry, "Tú hablas hambre").alignment)).toEqual(["hablas"]);
    const ops: readonly AlignOp[] = [
      { op: "match", expected: "habla", actual: "hablo", kind: "typo", note: "contrast-ending" },
      { op: "substitute", expected: "español", actual: "inglés" },
      { op: "match", expected: "書", actual: "輸", kind: "homophone", note: "ime-homophone" },
      { op: "match", expected: "書", actual: "舒", kind: "homophone" },
      { op: "match", expected: "habla", actual: "hablo", kind: "typo" },
      { op: "match", expected: "Tú", actual: "tú", kind: "case" },
    ];
    expect(otherWordsOf(ops)).toEqual(["hablo", "inglés", "輸"]);
    // Far from every wording: its slips only, and never more than three words.
    const far: readonly AlignOp[] = [
      { op: "substitute", expected: "Tú", actual: "perro" },
      { op: "substitute", expected: "tienes", actual: "gato" },
      { op: "match", expected: "hambre", actual: "hambra", kind: "typo" },
    ];
    expect(otherWordsOf(far)).toEqual(["hambra"]);
    const typos = ["a", "b", "c", "d"].map((w): AlignOp => ({ op: "match", expected: `${w}xxxx`, actual: `${w}xxxy`, kind: "typo" }));
    expect(otherWordsOf(typos)).toHaveLength(3);
  });
});

describe("the word a wrong choice chose (P3)", () => {
  it("is the option, on a card whose options are words of the course", () => {
    const gap = sampleExercise(es, "gap-fill", 1);
    if (gap?.template !== "gap-fill") throw new Error("es has a gap-fill card");
    const wrong = (gap.answer + 1) % gap.options.length;
    expect(chosenWordOf(gap, { tag: "choice", index: wrong })).toBe(gap.options[wrong]);
    expect(chosenWordOf(gap, { tag: "choice", index: gap.answer })).toBeUndefined();
    expect(chosenWordOf(gap, null)).toBeUndefined();
    const picture = sampleExercise(es, "select-image", 1);
    if (picture?.template !== "select-image") throw new Error("es has a select-image card");
    const other = (picture.answer + 1) % picture.options.length;
    expect(chosenWordOf(picture, { tag: "choice", index: other })).toBe(picture.options[other]?.text);
  });

  it("is none where the options are translations or readings", () => {
    const translation = sampleExercise(es, "choose-translation", 1);
    if (translation?.template !== "choose-translation") throw new Error("es has a choose-translation card");
    expect(chosenWordOf(translation, { tag: "choice", index: (translation.answer + 1) % translation.options.length })).toBeUndefined();
  });
});

describe("what a wrong word means (P3)", () => {
  const base = hungry.canonical;
  const word = (surface: string): TaggedText => textOfSurface(base, surface);
  const analysed = (token: Token): TaggedText => ({ ...base, tokens: [token] });
  const readings = (meanings: readonly WordMeaning[]): readonly (readonly string[])[] => meanings.map((m) => [...m.glosses.map((g) => g.kc as string), ...(m.form === undefined ? [] : [m.form.kc as string])]);

  it("a word the learner wrote: each reading the course gives it, with the form it is pinned as", () => {
    const hablas = writtenMeanings(es, word("hablas"));
    expect(readings(hablas)).toEqual([["sense:hablar", "form:pres-2s"]]);
    expect(surfaceOf(hablas[0]?.form?.meaning as TaggedText)).toContain("you");
    // Como is comer's "I eat" and the word como, "like".
    expect(readings(writtenMeanings(es, word("como")))).toEqual(expect.arrayContaining([["sense:comer", "form:pres-1s"], ["sense:como.like"]]));
    // esta, where está was asked: the demonstrative.
    expect(readings(writtenMeanings(es, word("esta")))).toEqual([["sense:este"]]);
  });

  it("a slip that makes no word of the course means nothing", () => {
    expect(writtenMeanings(es, word("hbalo"))).toEqual([]);
    expect(writtenMeanings(es, word("cancion"))).toEqual([]);
  });

  it("a chosen word by its own analysis: an inflected form by its sense, never an entry spelled alike", () => {
    const como = wordMeanings(es, analysed({ surface: "Como", kind: "word", sense: "comer" as SenseId, form: "form:pres-1s" as KcId }));
    expect(readings(como)).toEqual([["sense:comer", "form:pres-1s"]]);
    expect(como[0]?.glosses[0]?.meaning).toBeDefined();
  });

  it("a word of a phrase: its own entry alone, else the phrase it is part of", () => {
    expect(readings(wordMeanings(es, analysed({ surface: "por", kind: "word", sense: "por-favor" as SenseId })))).toEqual([["sense:por"]]);
    const dias = wordMeanings(es, analysed({ surface: "días", kind: "word", sense: "buenos-días" as SenseId }));
    expect(readings(dias)).toEqual([["sense:buenos-días"]]);
    expect(dias[0]?.glosses[0]?.span).toBe("phrase");
  });

  it("a word analysed into morphs is glossed morph by morph (uz)", () => {
    const uz = loadCourse("uz", "uz-Latn/standard");
    const analysedWord = (t: Token): boolean => new Set((t.morphs ?? []).map((m) => m.kc)).size > 1;
    const text = allSentences(uz)
      .flatMap((s) => s.forms["uz-Latn/standard"]?.text ?? [])
      .find((t) => t.tokens.some(analysedWord));
    const token = text?.tokens.find(analysedWord);
    if (text === undefined || token === undefined) throw new Error("uz has an analysed word");
    const meanings = wordMeanings(uz, { ...text, tokens: [token] });
    expect(meanings[0]?.glosses.map((g) => g.kc)).toEqual((token.morphs ?? []).map((m) => m.kc));
    expect(meanings[0]?.glosses.every((g) => g.span === "part")).toBe(true);
  });

  it("a KC's form among a card's options is glossed by its entry", () => {
    expect(readings(wordMeanings(es, word("hablar")))).toEqual([["sense:hablar"]]);
  });

  it("nothing for text in another orthography than the one being learned", () => {
    const english = textOfSurface(hungry.prompt, "speak");
    expect(wordMeanings(es, english)).toEqual([]);
    expect(writtenMeanings(es, english)).toEqual([]);
  });
});
