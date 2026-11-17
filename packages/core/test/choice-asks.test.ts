/**
 * A choice asks one thing (ADR 0132). A gap-fill asks which word (every option in the answer's form and
 * of its part of speech; none the sentence's accept set takes) or which form (the answer's own word in
 * other forms the course writes); it credits what it asked, and a mistake on it is asked again as the
 * same question. A story's `complete` question shows the options the compiler resolved.
 */
import type { BundleKc, BundleSentence, LearnerEvent, TaggedText, Token } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { askedKcs, creditOf } from "../src/learner/credit.ts";
import { emptyLearnerState, replay } from "../src/learner/index.ts";
import { allKcs, allSentences, createGrader, isCorrect, seededRng, type CourseView, type Exercise, type GapFill } from "../src/lesson/index.ts";
import { formSignature, senseKcOf, signatureKey } from "../src/lesson/signature.ts";
import { makeGapFill } from "../src/lesson/templates.ts";
import { allStories, formMeanings, storyScript } from "../src/story/index.ts";
import { surfaceOf } from "../src/text/tagged-text.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const COURSES = ["es", "chg", "uz", "apc", "fa", "yue", "lzh", "tok", "hbo", "grc"] as const;

const tokenOf = (t: TaggedText): Token => t.tokens.find((x) => x.kind === "word" || x.kind === "number") as Token;

/** Every `step`-th sentence's gap-fill, each built as a lesson would (its KCs new). */
const gapFills = (course: CourseView, step: number): readonly { readonly s: BundleSentence; readonly ex: GapFill }[] =>
  allSentences(course)
    .filter((s, i) => !s.id.startsWith("drill.") && i % step === 0)
    .flatMap((s, i) => {
      const ex = makeGapFill({ course, rng: seededRng(i), introduced: s.kcs }, s);
      return ex === undefined ? [] : [{ s, ex }];
    });

describe("a gap-fill asks one thing (ADR 0132)", () => {
  const courses = Object.fromEntries(COURSES.map((id) => [id, loadCourse(id)])) as Record<(typeof COURSES)[number], CourseView>;

  it("asks which word with every option in the answer's form and of its part of speech", () => {
    let words = 0;
    for (const id of COURSES) {
      const course = courses[id];
      const kcs = new Map<string, BundleKc>(allKcs(course).map((k) => [k.id, k]));
      for (const { ex } of gapFills(course, 3)) {
        if (ex.asks !== "word") continue;
        words++;
        const answer = tokenOf(ex.options[ex.answer] as TaggedText);
        const own = kcs.get(senseKcOf(answer) ?? "");
        for (const [i, o] of ex.options.entries()) {
          if (i === ex.answer) continue;
          const t = tokenOf(o);
          expect(signatureKey(t), `${id} ${ex.id}: ${surfaceOf(o)}`).toBe(signatureKey(answer));
          expect(t.sense, `${id} ${ex.id}`).not.toBe(answer.sense);
          if (own?.pos !== undefined) {
            const theirs = kcs.get(senseKcOf(t) ?? "");
            expect(theirs?.pos, `${id} ${ex.id}: ${surfaceOf(o)}`).toBe(own.pos);
            expect(theirs?.features ?? {}, `${id} ${ex.id}: ${surfaceOf(o)}`).toEqual(own.features ?? {});
          }
        }
      }
    }
    expect(words).toBeGreaterThan(200);
  }, 300_000);

  it("asks which form with the answer's own word in other forms, each of its own", () => {
    let forms = 0;
    for (const id of COURSES) {
      for (const { ex } of gapFills(courses[id], 3)) {
        if (ex.asks !== "form") continue;
        forms++;
        const answer = tokenOf(ex.options[ex.answer] as TaggedText);
        expect(formSignature(answer).length, `${id} ${ex.id}`).toBeGreaterThan(0);
        const signatures = ex.options.map((o) => signatureKey(tokenOf(o)));
        expect(new Set(signatures).size, `${id} ${ex.id}`).toBe(ex.options.length);
        for (const o of ex.options) expect(tokenOf(o).sense, `${id} ${ex.id}`).toBe(answer.sense);
      }
    }
    // The courses that model their forms ask them: endings (chg, uz, apc, fa), pinned forms (es, hbo).
    expect(forms).toBeGreaterThan(30);
  }, 300_000);

  it("never offers an option the sentence's accept set takes in the gap", () => {
    for (const id of ["es", "apc", "uz"] as const) {
      const course = courses[id];
      const grader = createGrader(course);
      for (const { s, ex } of gapFills(course, 4)) {
        const accept = s.forms[course.orthography]?.reverse;
        if (accept === undefined) continue;
        for (const [i, o] of ex.options.entries()) {
          if (i === ex.answer) continue;
          const sentence = `${surfaceOf(ex.before)}${surfaceOf(o)}${surfaceOf(ex.after)}`;
          expect(isCorrect(grader.grade(course.orthography, accept, sentence).verdict), `${id} ${ex.id}: ${sentence}`).toBe(false);
        }
      }
    }
  }, 300_000);

  it("credits what it asked: the sense for a word, the form KCs for a form, both on a card from before", () => {
    const chg = courses.chg;
    const all = gapFills(chg, 1).map((g) => g.ex);
    const word = all.find((e) => e.asks === "word" && formSignature(tokenOf(e.options[e.answer] as TaggedText)).length > 0);
    const form = all.find((e) => e.asks === "form");
    if (word === undefined || form === undefined) throw new Error("chg asks both questions");
    const wordToken = tokenOf(word.options[word.answer] as TaggedText);
    const formToken = tokenOf(form.options[form.answer] as TaggedText);
    expect(askedKcs(word)).toEqual([senseKcOf(wordToken)]);
    expect(askedKcs(form)).toEqual(formSignature(formToken));
    const { asks: _asks, ...before } = word;
    expect([...new Set(askedKcs(before as Exercise) ?? [])].sort()).toEqual([senseKcOf(wordToken), ...formSignature(wordToken)].sort());
    // A wrong form question lays the miss on the form, never on the word.
    const credit = creditOf(form, { verdict: "WRONG", notes: [] }, chg.profiles);
    const sense = senseKcOf(formToken);
    expect(credit.find((c) => c.kc === sense)?.status ?? "given").toBe("given");
    for (const kc of formSignature(formToken)) expect(credit.find((c) => c.kc === kc)?.status).toBe("wrong");
  }, 300_000);
});

describe("a mistake on a fill-in (ADR 0132)", () => {
  const chg = loadCourse("chg");
  const cards = gapFills(chg, 1).map((g) => g.ex);
  const form = cards.find((e) => e.asks === "form");
  if (form === undefined) throw new Error("chg asks form questions");
  const events = (log: (f: ReturnType<typeof eventFactory>) => LearnerEvent[]): LearnerEvent[] => {
    const f = eventFactory(chg, manifestOf("chg").id);
    f.at("2026-03-01T08:00:00.000Z");
    return log(f);
  };

  it("records which question it was", () => {
    const state = replay(events((f) => [f.answer(form, false, 1)]));
    const [mistake] = state.mistakes;
    expect(mistake?.asks).toBe("form");
    expect(mistake?.ask).toEqual([...(askedKcs(form) ?? [])].map(String).sort());
  });

  it("is closed by an answer to the same question, and one from before ADR 0132 by either", () => {
    const right = (ex: Exercise) => (f: ReturnType<typeof eventFactory>) => [f.answer(ex, false, 1), f.answer(ex, true, 1)];
    expect(replay(events(right(form))).mistakes).toEqual([]);
    // The card as it was planned before: no `asks`, credited to all of the word's KCs.
    const { asks: _asks, ...before } = form;
    const legacy = replay(events((f) => [f.answer(before, false, 1)]));
    expect(legacy.mistakes[0]?.asks).toBeUndefined();
    const closed = replay(events((f) => [f.answer(before, false, 1), f.answer(form, true, 1)]));
    expect(closed.mistakes).toEqual([]);
    expect(emptyLearnerState().mistakes).toEqual([]);
  });
});

describe("a story's complete question (ADR 0132)", () => {
  it("shows the options the compiler resolved, and says what it asks", () => {
    const chg = loadCourse("chg");
    let word = 0;
    let form = 0;
    for (const story of allStories(chg)) {
      for (const step of storyScript(chg, story, seededRng(1)).steps) {
        if (step.tag !== "question" || step.ex.template !== "story-complete") continue;
        const ex = step.ex;
        expect(ex.asks, ex.id).toBeDefined();
        const answer = tokenOf(ex.options[ex.answer] as TaggedText);
        for (const [i, o] of ex.options.entries()) {
          if (i === ex.answer) continue;
          const t = tokenOf(o);
          if (ex.asks === "word") expect(signatureKey(t), ex.id).toBe(signatureKey(answer));
          else expect(t.sense, ex.id).toBe(answer.sense);
        }
        if (ex.asks === "word") word++;
        else form++;
      }
    }
    expect(word).toBeGreaterThan(10);
    expect(form).toBeGreaterThan(0);
  });

  it("explains a form by what each of its KCs means, in the order the word writes them", () => {
    const chg = loadCourse("chg");
    const tiz = allStories(chg)
      .flatMap((story) => storyScript(chg, story, seededRng(1)).steps)
      .flatMap((step) => (step.tag === "question" && step.ex.template === "story-complete" && step.ex.asks === "form" ? [step.ex] : []))
      .find((ex) => tokenOf(ex.options[ex.answer] as TaggedText).sense === "tiz");
    if (tiz === undefined) throw new Error("chg asks the form of tiz");
    const meanings = formMeanings(chg, tiz.options[tiz.answer] as TaggedText);
    expect(meanings.sense).toBe("sense:tiz");
    // tiz-i-ǧa: the possessive, then the dative.
    expect(meanings.forms.map((f) => f.kc)).toEqual(["form:poss3", "form:dat"]);
  });
});
