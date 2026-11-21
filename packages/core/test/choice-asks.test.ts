/**
 * A choice asks one thing (ADR 0132). A gap-fill asks which word (every option in the answer's form and
 * of its part of speech; none the sentence's accept set takes) or which form (the answer's own word in
 * other forms the course writes); it credits what it asked, and a mistake on it is asked again as the
 * same question. A story's `complete` question shows the options the compiler resolved.
 */
import type { BundleLexeme, BundleSentence, LearnerEvent, TaggedText, Token } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { askedParts, creditOf } from "../src/learner/credit.ts";
import { emptyLearnerState, replay } from "../src/learner/index.ts";
import { allLexemes, allSentences, lexemesById, createGrader, isCorrect, seededRng, type CourseView, type Exercise, type GapFill } from "../src/lesson/index.ts";
import { baseIdOf, effectiveFeats, formPartsOf, formSignature, lexemeIdsOf, lexemesOf } from "../src/lesson/lexemes.ts";
import { makeGapFill } from "../src/lesson/templates.ts";
import { allStories, formMeanings, storyScript } from "../src/story/index.ts";
import { surfaceOf } from "../src/text/tagged-text.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const COURSES = ["es", "chg", "uz", "apc", "fa", "yue", "lzh", "tok", "hbo", "grc"] as const;

const tokenOf = (t: TaggedText): Token => t.tokens.find((x) => x.kind === "word" || x.kind === "number") as Token;

/** A token's form signature as one string (ADR 0132): what it writes but which lexeme its base is. */
const signatureKey = (course: CourseView, token: Token): string => formSignature(token, lexemesById(course).get(baseIdOf(token) ?? "")).join(" ");

/** Every `step`-th sentence's gap-fill, each built as a lesson would (its parts new). */
const gapFills = (course: CourseView, step: number): readonly { readonly s: BundleSentence; readonly ex: GapFill }[] =>
  allSentences(course)
    .filter((s, i) => !s.id.startsWith("drill.") && i % step === 0)
    .flatMap((s, i) => {
      const ex = makeGapFill({ course, rng: seededRng(i), introduced: s.parts }, s);
      return ex === undefined ? [] : [{ s, ex }];
    });

describe("a gap-fill asks one thing (ADR 0132)", () => {
  const courses = Object.fromEntries(COURSES.map((id) => [id, loadCourse(id)])) as Record<(typeof COURSES)[number], CourseView>;

  it("asks which word with every option in the answer's form and of its part of speech", () => {
    let words = 0;
    for (const id of COURSES) {
      const course = courses[id];
      const lexemes = lexemesById(course);
      for (const { ex } of gapFills(course, 3)) {
        if (ex.asks !== "lexeme") continue;
        words++;
        const answer = tokenOf(ex.options[ex.answer] as TaggedText);
        const own = lexemes.get(baseIdOf(answer) ?? "");
        for (const [i, o] of ex.options.entries()) {
          if (i === ex.answer) continue;
          const t = tokenOf(o);
          // The signature holds the values each lexeme has of itself too (a noun's gender, ADR 0146).
          expect(signatureKey(course, t), `${id} ${ex.id}: ${surfaceOf(o)}`).toBe(signatureKey(course, answer));
          expect(baseIdOf(t), `${id} ${ex.id}`).not.toBe(baseIdOf(answer));
          if (own?.pos !== undefined) expect(lexemes.get(baseIdOf(t) ?? "")?.pos, `${id} ${ex.id}: ${surfaceOf(o)}`).toBe(own.pos);
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
        // Something to credit: a lexeme written with the base, or a value the sentence teaches.
        expect(formPartsOf(answer, new Set(ex.parts)).length, `${id} ${ex.id}`).toBeGreaterThan(0);
        const signatures = ex.options.map((o) => signatureKey(courses[id], tokenOf(o)));
        expect(new Set(signatures).size, `${id} ${ex.id}`).toBe(ex.options.length);
        for (const o of ex.options) expect(baseIdOf(tokenOf(o)), `${id} ${ex.id}`).toBe(baseIdOf(answer));
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

  it("never blanks or offers a word of a phrase lexeme (por of por favor), but a word its line repeats apart", () => {
    const es = courses.es;
    const lexemes = lexemesById(es);
    const phrase = (t: Token): boolean => (lexemes.get(baseIdOf(t) ?? "")?.forms?.[es.orthography]?.[0]?.tokens.filter((x) => x.kind === "word").length ?? 1) > 1;
    let cards = 0;
    for (const { ex } of gapFills(es, 2)) {
      cards++;
      for (const o of ex.options) expect(phrase(tokenOf(o)), `${ex.id}: ${surfaceOf(o)}`).toBe(false);
    }
    expect(cards).toBeGreaterThan(300);
    // A word a sentence repeats apart (el … la, mi … mi) is a word of its own: it may be the blank.
    let apart = 0;
    for (const [i, s] of allSentences(es).entries()) {
      const text = s.forms[es.orthography]?.text;
      if (text === undefined || s.id.startsWith("drill.")) continue;
      const ws = text.tokens.filter((t) => t.kind === "word");
      const base = (t: Token | undefined): string | undefined => (t === undefined ? undefined : baseIdOf(t));
      const repeated = ws.find((t, k) => base(t) !== undefined && ws.some((u, j) => j > k + 1 && base(u) === base(t)) && base(ws[k + 1]) !== base(t));
      const lexeme = base(repeated);
      if (lexeme === undefined) continue;
      const ex = makeGapFill({ course: es, rng: seededRng(i), introduced: [lexeme] }, s);
      if (ex !== undefined && baseIdOf(tokenOf(ex.options[ex.answer] as TaggedText)) === lexeme) apart++;
    }
    expect(apart).toBeGreaterThan(20);
  }, 300_000);

  it("credits what it asked: the lexeme for a word, the form's parts for a form, all its lexemes on a card from before", () => {
    const chg = courses.chg;
    const all = gapFills(chg, 1).map((g) => g.ex);
    const word = all.find((e) => e.asks === "lexeme" && lexemesOf(tokenOf(e.options[e.answer] as TaggedText)).length > 1);
    const form = all.find((e) => e.asks === "form");
    if (word === undefined || form === undefined) throw new Error("chg asks both questions");
    const wordToken = tokenOf(word.options[word.answer] as TaggedText);
    const formToken = tokenOf(form.options[form.answer] as TaggedText);
    expect(askedParts(word)).toEqual([baseIdOf(wordToken)]);
    const formParts = formPartsOf(formToken, new Set(form.parts));
    expect(formParts.length).toBeGreaterThan(0);
    expect(askedParts(form)).toEqual(formParts);
    // A card from before ADR 0132 (no `asks`) credits every lexeme the word writes: its base and its suffixes.
    const { asks: _asks, ...before } = word;
    expect([...new Set(askedParts(before as Exercise) ?? [])].sort()).toEqual([...lexemeIdsOf(wordToken)].sort());
    expect(lexemeIdsOf(wordToken).length).toBeGreaterThan(1);
    // A wrong form question lays the miss on the form, never on the word.
    const credit = creditOf(form, { verdict: "WRONG", notes: [] }, chg.profiles);
    const lexeme = baseIdOf(formToken);
    expect(credit.find((c) => c.part === lexeme)?.status ?? "given").toBe("given");
    for (const part of formParts) expect(credit.find((c) => c.part === part)?.status).toBe("wrong");
  }, 300_000);
});

describe("agreement is the token's form (ADR 0132 amendments, 0146)", () => {
  /**
   * The gender a token's form has (its own values over its lexeme's): Fem feminine, Neut neuter
   * (grc), else masculine; apc's plural has none.
   */
  const genderOf = (course: CourseView, token: Token): string | undefined => {
    const feats = effectiveFeats(token, lexemesById(course).get(baseIdOf(token) ?? ""));
    if (course.id === "apc" && feats["Number"] === "Plur") return undefined;
    if (feats["Gender"] === "Fem") return "f";
    if (course.id === "grc" && feats["Gender"] === "Neut") return "n";
    return "m";
  };
  // Nouns whose lexeme names a man or a woman (hermano, hermana; jar, jara; ὁ, ἡ παῖς), and hbo's רָעָה
  // "evil" beside the masculine רָע: the only nouns written in two genders.
  const BOTH: Record<string, readonly string[]> = {
    es: ["azúcar", "don", "hermano", "hijo", "mecánico", "mijo", "muchacho", "niño", "novio", "primo", "yuma"],
    apc: ["7abibi", "jar", "m3allem", "mhandes", "rfi2", "tilmiz"],
    hbo: ["ivri", "raah.evil"],
    grc: ["pais"],
  };

  it("keeps a noun's gender wherever the course writes it: its lexeme's, or its token's where the lexeme has none", () => {
    for (const [id, both] of Object.entries(BOTH)) {
      const course = loadCourse(id);
      const nouns = new Map<string, BundleLexeme>(allLexemes(course).filter((k) => k.pos === "NOUN" || k.pos === "PROPN").map((k) => [k.id, k]));
      const texts: TaggedText[] = [
        ...allSentences(course).flatMap((s) => Object.values(s.forms).map((f) => f.text)),
        ...allStories(course).flatMap((st) => st.steps.flatMap((step) => Object.values(step.line?.forms ?? {}))),
      ];
      const genders = new Map<string, Set<string>>();
      const chosenOverStored = new Set<string>();
      for (const t of texts.flatMap((x) => x.tokens)) {
        const lexeme = baseIdOf(t);
        if (lexeme === undefined || !nouns.has(lexeme)) continue;
        const g = genderOf(course, t);
        if (g !== undefined) genders.set(lexeme, (genders.get(lexeme) ?? new Set()).add(g));
        const own = lexemesOf(t).find((l) => l.lexeme === lexeme)?.feats?.["Gender"];
        if (own !== undefined && nouns.get(lexeme)?.feats?.["Gender"] !== undefined) chosenOverStored.add(lexeme);
      }
      const mixed = [...genders].filter(([, gs]) => gs.size > 1).map(([lexeme]) => lexeme);
      const expected = both.map((name) => `lexeme:${name}`).sort();
      expect(mixed.sort(), id).toEqual(expected);
      // A noun's gender is its lexeme's (ADR 0146): a token chooses one only for a noun that stores none
      // (one that names a man or a woman: hermano, hermana; doctora, the only one the course writes).
      expect([...chosenOverStored], id).toEqual([]);
    }
  });

  it("asks a word question on a feminine word with feminine words only", () => {
    for (const [id, least] of [["es", 10], ["apc", 10], ["hbo", 10], ["grc", 1]] as const) {
      const course = loadCourse(id);
      let feminine = 0;
      for (const { ex } of gapFills(course, 1)) {
        const answer = tokenOf(ex.options[ex.answer] as TaggedText);
        if (ex.asks !== "lexeme" || genderOf(course, answer) !== "f") continue;
        feminine++;
        for (const o of ex.options) expect(genderOf(course, tokenOf(o)), `${id} ${ex.id}: ${surfaceOf(o)}`).toBe("f");
      }
      expect(feminine, id).toBeGreaterThanOrEqual(least);
    }
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
    expect(mistake?.ask).toEqual([...(askedParts(form) ?? [])].map(String).sort());
  });

  it("is closed by an answer to the same question, and one from before ADR 0132 by either", () => {
    const right = (ex: Exercise) => (f: ReturnType<typeof eventFactory>) => [f.answer(ex, false, 1), f.answer(ex, true, 1)];
    expect(replay(events(right(form))).mistakes).toEqual([]);
    // The card as it was planned before: no `asks`, credited to all of the word's lexemes.
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
          if (ex.asks === "lexeme") expect(signatureKey(chg, t), ex.id).toBe(signatureKey(chg, answer));
          else expect(baseIdOf(t), ex.id).toBe(baseIdOf(answer));
        }
        if (ex.asks === "lexeme") word++;
        else form++;
      }
    }
    expect(word).toBeGreaterThan(10);
    expect(form).toBeGreaterThan(0);
  });

  it("explains a form by what each of its parts means, in the order the word writes them", () => {
    const chg = loadCourse("chg");
    const tiz = allStories(chg)
      .flatMap((story) => storyScript(chg, story, seededRng(1)).steps)
      .flatMap((step) => (step.tag === "question" && step.ex.template === "story-complete" && step.ex.asks === "form" ? [step.ex] : []))
      .find((ex) => baseIdOf(tokenOf(ex.options[ex.answer] as TaggedText)) === "lexeme:tiz");
    if (tiz === undefined) throw new Error("chg asks the form of tiz");
    const meanings = formMeanings(chg, tiz.options[tiz.answer] as TaggedText);
    expect(meanings.lexeme).toBe("lexeme:tiz");
    // tiz-i-ǧa: the possessive, then the dative (affix lexemes, ADR 0146).
    expect(meanings.forms.map((f) => f.id)).toEqual(["lexeme:poss3", "lexeme:dat"]);
  });
});
