/**
 * Spelling cards (ADR 0142, as amended 2026-11-22): a word among its other spellings of its sound,
 * as lessons plan them (`lessonCandidates`). One other spelling that is a wrong answer is enough:
 * the card then offers the word and that spelling; with more, up to three others.
 */
import type { TaggedText, Token } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { courseHomophones, createGrader, gradeExercise, isCorrect, lessonNodes, otherSpellings, profileOf, seededRng, TEMPLATES, allSentences, type CourseView, type Exercise, type GapFill, type TemplateId } from "../src/lesson/index.ts";
import { lessonCandidates } from "../src/lesson/candidates.ts";
import { loadCourse } from "./learner-fixtures.ts";

const text = (t: TaggedText): string => t.tokens.map((x) => x.surface).join("");
const ONLY: Record<string, ReadonlySet<TemplateId>> = {};
const onlyOf = (template: TemplateId): ReadonlySet<TemplateId> => (ONLY[template] ??= new Set((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => t !== template)));

/** Every card of a kind the course's lessons make among their candidates, lesson by lesson. */
const candidates = (course: CourseView, template: TemplateId): Exercise[] =>
  lessonNodes(course).flatMap((at) => lessonCandidates({ course, rng: seededRng(1), introduced: at.node.introduces }, at, new Set(), onlyOf(template)));

const spellingCards = (course: CourseView): GapFill[] => candidates(course, "spelling-choice").flatMap((ex) => (ex.template === "spelling-choice" ? [ex] : []));

/** A sentence's token of that surface, with its other spellings in the course. */
const word = (course: CourseView, item: string, surface: string): { readonly token: Token; readonly others: readonly string[] } => {
  const token = allSentences(course)
    .find((s) => s.id === item)
    ?.forms[course.orthography]?.text.tokens.find((t) => t.surface === surface);
  if (token === undefined) throw new Error(`${item} writes no ${surface}`);
  return { token, others: otherSpellings(profileOf(course, course.orthography), token, courseHomophones(course)) };
};

const es = loadCourse("es");
const fa = loadCourse("fa");

describe("a spelling card where the word has one other spelling (ADR 0142 amendment)", () => {
  it("es: Hola against Ola, its only other spelling, the right answer the sentence's word", () => {
    expect(word(es, "s.u01.1", "Hola").others).toEqual(["Ola"]);
    const card = spellingCards(es).find((ex) => ex.item === "s.u01.1");
    if (card === undefined) throw new Error("no spelling card for s.u01.1");
    expect(card.options.map(text).sort()).toEqual(["Hola", "Ola"]);
    expect(text(card.options[card.answer] as TaggedText)).toBe("Hola");
    const grader = createGrader(es);
    expect(isCorrect(gradeExercise(card, { tag: "choice", index: card.answer }, grader).verdict)).toBe(true);
    expect(isCorrect(gradeExercise(card, { tag: "choice", index: 1 - card.answer }, grader).verdict)).toBe(false);
  });

  it("fa: نه against نح likewise", () => {
    expect(word(fa, "s.5", "نَه").others).toEqual(["نَح"]);
    const card = spellingCards(fa).find((ex) => ex.item === "s.5");
    if (card === undefined) throw new Error("no spelling card for s.5");
    expect(card.options.map(text).sort()).toEqual(["نَح", "نَه"].sort());
    expect(text(card.options[card.answer] as TaggedText)).toBe("نَه");
  });

  it("a word with several other spellings keeps three or four options; every option is the word or one of its other spellings", () => {
    for (const course of [es, fa]) {
      const cards = spellingCards(course);
      const counts = new Set(cards.map((ex) => ex.options.length));
      expect([...counts].sort(), course.id).toEqual([2, 3, 4]);
      for (const ex of cards) {
        const right = text(ex.options[ex.answer] as TaggedText);
        expect(new Set(ex.options.map(text)).size, ex.id).toBe(ex.options.length);
        const token = ex.before.tokens.length;
        const asked = allSentences(course).find((s) => s.id === ex.item)?.forms[course.orthography]?.text.tokens[token];
        expect(asked?.surface, ex.id).toBe(right);
        const others = otherSpellings(profileOf(course, course.orthography), asked as Token, courseHomophones(course));
        for (const [i, o] of ex.options.entries()) if (i !== ex.answer) expect(others, ex.id).toContain(text(o));
        if (ex.options.length === 2) expect(others.length, ex.id).toBeGreaterThanOrEqual(1);
        else expect(others.length, ex.id).toBeGreaterThanOrEqual(ex.options.length - 1);
      }
    }
  });

  it("no card where the word's only other spelling is one the sentence's accept set takes (es: ¿Qué bolá?, volá)", () => {
    expect(word(es, "s.u01.9", "bolá").others).toEqual(["volá"]);
    expect(spellingCards(es).some((ex) => ex.item === "s.u01.9")).toBe(false);
  });

  it("the other choice cards keep two wrong options at least", () => {
    for (const course of [es, fa]) {
      for (const template of ["gap-fill", "vocalize"] as const) {
        for (const ex of candidates(course, template)) if ("options" in ex) expect(ex.options.length, ex.id).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
