import type { KcCredit, LearnerEvent } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { emptyLearnerState, learnedWords, orderWords, plan, replay, skillsAsked, wordCounts, wordMatcher, type LearnerState } from "../src/learner/index.ts";
import { lessonNodes, type Exercise, type TemplateId } from "../src/lesson/index.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const NOW = "2026-03-01T08:00:00.000Z";

describe("the words a learner has learned", () => {
  const fa = loadCourse("fa");
  const first = lessonNodes(fa)[0]?.node.id;
  if (first === undefined) throw new Error("fa has lessons");

  /** A learner who did the first lesson right, every answer. */
  const afterFirstLesson = () => {
    const events = eventFactory(fa, manifestOf("fa").id);
    events.at(NOW);
    const p = plan(fa, emptyLearnerState(), { mode: "lesson", node: first }, { now: NOW, seed: 3 });
    const log = [events.started("lesson", first, p.exercises.length), ...p.exercises.map((ex) => events.answer(ex, true, 1)), events.completed("lesson", first, { exercises: p.exercises.length, correctFirstTry: p.exercises.length, retries: 0 })];
    return { state: replay(log), practised: new Set(p.exercises.flatMap((ex) => ex.kcs.map(String))) };
  };

  it("is empty before any practice", () => {
    expect(learnedWords(fa, emptyLearnerState(), NOW)).toEqual([]);
  });

  it("lists the words practised, in course order, each with its form and gloss", () => {
    const { state, practised } = afterFirstLesson();
    const words = learnedWords(fa, state, NOW);
    expect(words.length).toBeGreaterThan(2);
    const kcs = new Map(fa.units.flatMap((u) => u.kcs).map((k) => [String(k.id), k] as const));
    const order = fa.units.flatMap((u) => u.kcs.map((k) => String(k.id)));
    expect(words.map((w) => w.kc)).toEqual([...words.map((w) => w.kc)].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    for (const w of words) {
      const kc = kcs.get(w.kc);
      expect(practised.has(w.kc), w.kc).toBe(true);
      expect(kc?.kind === "sense" || kc?.kind === "form", w.kc).toBe(true);
      expect(w.form).toEqual(kc?.forms?.[fa.orthography]?.[0]);
      expect(w.gloss).toEqual(kc?.gloss?.[fa.supportKey]);
      expect(w.reviews).toBeGreaterThan(0);
      // Just practised: remembered, and not due yet.
      expect(w.strength).toBeGreaterThan(0.9);
      expect(w.due).toBe(false);
    }
  });

  it("fades with time, and comes due", () => {
    const { state } = afterFirstLesson();
    const later = "2026-06-01T08:00:00.000Z";
    const now = learnedWords(fa, state, NOW);
    const then = learnedWords(fa, state, later);
    expect(then.map((w) => w.kc)).toEqual(now.map((w) => w.kc));
    then.forEach((w, i) => expect(w.strength).toBeLessThan(now[i]?.strength ?? 0));
    expect(then.every((w) => w.due)).toBe(true);
  });

  it("counts one orthography's script practice only in that orthography", () => {
    const uz = loadCourse("uz", "uz-Latn/standard");
    const cyrl = loadCourse("uz", "uz-Cyrl/standard");
    const kc = uz.units.flatMap((u) => u.kcs).find((k) => k.kind === "sense" && k.forms?.["uz-Latn/standard"] !== undefined && k.forms["uz-Cyrl/standard"] !== undefined);
    if (kc === undefined) throw new Error("uz has a word in both scripts");
    const card = { due: "2026-03-05T08:00:00.000Z", stability: 4, difficulty: 5, elapsed_days: 0, scheduled_days: 4, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: NOW };
    const state = { ...emptyLearnerState(), cards: { [`${kc.id}|write-script|uz-Latn/standard`]: card } };
    expect(learnedWords(uz, state, NOW).map((w) => w.kc)).toEqual([kc.id]);
    expect(learnedWords(cyrl, state, NOW)).toEqual([]);
    // The language's own facets are shared by every orthography.
    const shared = { ...emptyLearnerState(), cards: { [`${kc.id}|recognize`]: card } };
    expect(learnedWords(cyrl, shared, NOW).map((w) => w.form)).toEqual([kc.forms?.["uz-Cyrl/standard"]?.[0]]);
  });
});

describe("browsing the word list", () => {
  const fa = loadCourse("fa");
  const card = { due: "2026-03-05T08:00:00.000Z", stability: 4, difficulty: 5, elapsed_days: 0, scheduled_days: 4, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: NOW };
  const kcs = fa.units.flatMap((u) => u.kcs).filter((k) => (k.kind === "sense" || k.kind === "form") && k.forms?.[fa.orthography] !== undefined && k.gloss?.["en"] !== undefined);
  const state = { ...emptyLearnerState(), cards: Object.fromEntries(kcs.map((k) => [`${k.id}|recognize`, card])) };
  const words = learnedWords(fa, state, NOW);

  it("finds a word by its letters, whatever its vowel marks, and by its meaning in any case", () => {
    const marked = words.find((w) => /[\u064B-\u0652]/u.test(w.form.tokens.map((t) => t.surface).join("")));
    if (marked === undefined) throw new Error("fa has a word with vowel marks");
    const bare = marked.form.tokens.map((t) => t.surface).join("").replace(/[\u064B-\u0652]/gu, "");
    expect(words.filter(wordMatcher(fa, bare)).map((w) => w.kc)).toContain(marked.kc);
    const gloss = marked.gloss?.tokens.map((t) => t.surface).join("") ?? "";
    expect(words.filter(wordMatcher(fa, gloss.toLocaleUpperCase("en"))).map((w) => w.kc)).toContain(marked.kc);
    expect(words.filter(wordMatcher(fa, "  "))).toHaveLength(words.length);
    expect(words.filter(wordMatcher(fa, "zzzqqq"))).toEqual([]);
  });

  it("orders by the course, by the language's collation, or weakest first", () => {
    expect(orderWords(words, "course")).toBe(words);
    const collator = new Intl.Collator("fa", { sensitivity: "base" });
    const surface = (w: (typeof words)[number]): string => w.form.tokens.map((t) => t.surface).join("");
    const alphabetical = orderWords(words, "alphabetical").map(surface);
    expect(alphabetical).toEqual([...alphabetical].sort((a, b) => collator.compare(a, b)));
    const later = learnedWords(fa, { ...state, cards: { ...state.cards, [`${kcs[1]?.id ?? ""}|recognize`]: { ...card, due: "2026-02-01T08:00:00.000Z" } } }, NOW);
    expect(orderWords(later, "weakest")[0]?.kc).toBe(kcs[1]?.id);
  });
});

describe("known words (ADR 0100)", () => {
  const fa = loadCourse("fa");
  const words = fa.units.flatMap((u) => u.kcs).filter((k) => k.kind === "sense" && k.forms?.[fa.orthography] !== undefined);
  const [a, b, c] = words.map((k) => String(k.id));
  if (a === undefined || b === undefined || c === undefined) throw new Error("fa has words");
  /** A stand-in exercise: what the fold reads of one (template, item, KCs). */
  const card = (template: TemplateId, kcs: readonly string[]): Exercise => ({ id: `${template}:${kcs.join("+")}`, template, item: kcs.join("+"), kcs, orthography: fa.orthography }) as unknown as Exercise;
  const day = (n: number): string => `2026-03-${String(n).padStart(2, "0")}T08:00:00.000Z`;
  const log = () => {
    const events = eventFactory(fa, manifestOf("fa").id);
    const out: LearnerEvent[] = [];
    const on = (n: number) => {
      events.at(day(n));
      events.session();
    };
    /** A first try (or `attempt`), with each KC's credit (true: right; false: wrong; undefined: given). */
    const answer = (ex: Exercise, credits: readonly (boolean | undefined)[], attempt = 1): void => {
      const e = events.answer(ex, credits.every((x) => x !== false), attempt) as LearnerEvent & { outcome: { kcs: KcCredit[] } };
      out.push({ ...e, outcome: { ...e.outcome, kcs: ex.kcs.map((kc, i): KcCredit => ({ kc, status: credits[i] === undefined ? "given" : credits[i] ? "right" : "wrong" })) } } as LearnerEvent);
    };
    const skip = (ex: Exercise): void => {
      const { input: _i, outcome: _o, prediction: _p, ...e } = events.answer(ex, false, 1) as LearnerEvent & { input: unknown; outcome: unknown; prediction?: unknown };
      out.push({ ...e, type: "exercise_skipped", reason: "skip" } as unknown as LearnerEvent);
    };
    return { on, answer, skip, state: (): LearnerState => replay(out) };
  };
  const word = (kc: string) => card("choose-translation", [kc]);
  const sentence = (...kcs: string[]) => card("translate-type.l1-l2", kcs);

  it("shows a skill only on a later day than the word was met", () => {
    const l = log();
    l.on(1);
    l.answer(word(a), [true]);
    expect(l.state().met[a]).toBe("2026-03-01");
    expect(l.state().shown).toEqual({});
    l.on(2);
    l.answer(word(a), [true]);
    expect(l.state().shown).toEqual({ [`${a}|recognize`]: "2026-03-02" });
  });

  it("takes a skill away on a miss, and shows it again only after another night", () => {
    const l = log();
    l.on(1);
    l.answer(word(a), [true]);
    l.on(2);
    l.answer(word(a), [true]);
    l.answer(word(a), [false]);
    expect(l.state().shown[`${a}|recognize`]).toBeUndefined();
    expect(l.state().missed[`${a}|recognize`]).toBe("2026-03-02");
    l.on(2);
    l.answer(word(a), [true]);
    expect(l.state().shown[`${a}|recognize`]).toBeUndefined();
    l.on(3);
    l.answer(word(a), [true]);
    expect(l.state().shown[`${a}|recognize`]).toBe("2026-03-03");
  });

  it("pins a miss on a word only where the grading does", () => {
    const l = log();
    l.on(1);
    l.answer(sentence(a, b, c), [true, true, true]);
    l.on(2);
    l.answer(sentence(a, b, c), [true, true, true]);
    const shown = { [`${a}|produce`]: "2026-03-02", [`${b}|produce`]: "2026-03-02", [`${c}|produce`]: "2026-03-02" };
    expect(l.state().shown).toEqual(shown);
    // Missed as a whole: nothing says which word failed.
    l.answer(sentence(a, b, c), [false, false, false]);
    expect(l.state().shown).toEqual(shown);
    // One word typed wrong among words typed right: that word is missed.
    l.answer(sentence(a, b, c), [true, false, true]);
    expect(Object.keys(l.state().shown).sort()).toEqual([`${a}|produce`, `${c}|produce`].sort());
    // A word a pronunciation card does not ask about is given: neither shown nor missed.
    l.answer(card("translate-type.l1-l2", [a, c]), [undefined, false]);
    expect(Object.keys(l.state().shown)).toEqual([`${a}|produce`]);
  });

  it("counts first tries only, and a revealed answer on a word card as a miss", () => {
    const l = log();
    l.on(1);
    l.answer(word(a), [true]);
    l.answer(word(b), [true]);
    l.on(2);
    l.answer(word(a), [true], 2);
    expect(l.state().shown).toEqual({});
    l.answer(word(b), [true]);
    l.skip(word(b));
    expect(l.state().shown).toEqual({});
    expect(l.state().missed[`${b}|recognize`]).toBe("2026-03-02");
  });

  it("asks every word to be recognized and produced, and heard where the voice may be relied on", () => {
    const asked = skillsAsked(fa);
    const heard = words.find((k) => fa.audio[k.id] !== undefined);
    if (heard === undefined) throw new Error("fa has word clips");
    expect(asked(heard.id)).toEqual(["recognize", "produce", "listen"]);
    // A word no sentence uses cannot be produced, nor heard without a clip of its own.
    const sentences = fa.units.flatMap((u) => u.sentences);
    const unwritten = words.find((k) => !sentences.some((s) => s.kcs.includes(k.id)));
    if (unwritten !== undefined) expect(asked(unwritten.id)).not.toContain("produce");
    // Only words are known: a construction, a letter or an id the course lacks asks nothing.
    expect(asked("sense:no-such-word")).toEqual([]);
    // An iffy voice (ADR 0091) plans no listening; Classical Chinese practises recognize and produce.
    for (const id of ["hbo", "tok", "lzh"]) {
      const course = loadCourse(id);
      const ask = skillsAsked(course);
      const kcs = course.units.flatMap((u) => u.kcs).filter((k) => k.kind === "sense");
      expect(kcs.some((k) => ask(k.id).includes("produce")), id).toBe(true);
      expect(kcs.some((k) => ask(k.id).includes("listen")), id).toBe(false);
    }
  });

  it("knows a word once it has shown every skill asked of it", () => {
    const heard = words.find((k) => fa.audio[k.id] !== undefined && skillsAsked(fa)(k.id).length === 3);
    if (heard === undefined) throw new Error("fa has a word asked all three skills");
    const reviewed = { due: "2026-03-05T08:00:00.000Z", stability: 4, difficulty: 5, elapsed_days: 0, scheduled_days: 4, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: NOW };
    const base = { ...emptyLearnerState(), cards: { [`${heard.id}|recognize`]: reviewed } };
    const shown = (...skills: string[]) => Object.fromEntries(skills.map((s) => [`${heard.id}|${s}`, "2026-03-02"]));
    const learning = learnedWords(fa, { ...base, shown: shown("recognize", "produce") }, NOW);
    expect(learning.map((w) => [w.known, w.skills])).toEqual([
      [false, [{ skill: "recognize", shown: true }, { skill: "produce", shown: true }, { skill: "listen", shown: false }]],
    ]);
    expect(wordCounts(learning)).toEqual({ known: 0, learning: 1 });
    const known = learnedWords(fa, { ...base, shown: shown("recognize", "produce", "listen") }, NOW);
    expect(known.map((w) => w.known)).toEqual([true]);
    expect(wordCounts(known)).toEqual({ known: 1, learning: 0 });
  });
});

describe("finding a word by its reading", () => {
  const yue = loadCourse("yue");
  const kcs = yue.units.flatMap((u) => u.kcs).filter((k) => k.kind === "sense" && k.forms?.[yue.orthography] !== undefined);
  const card = { due: "2026-03-05T08:00:00.000Z", stability: 4, difficulty: 5, elapsed_days: 0, scheduled_days: 4, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: NOW };
  const words = learnedWords(yue, { ...emptyLearnerState(), cards: Object.fromEntries(kcs.map((k) => [`${k.id}|recognize`, card])) }, NOW);
  const found = (q: string): readonly string[] => words.filter(wordMatcher(yue, q)).map((w) => w.kc);

  it("finds it with or without tones and spaces, in any case", () => {
    expect(words.map((w) => w.kc)).toContain("sense:早晨");
    for (const q of ["zou2 san4", "zou2san4", "zousan", "ZOU SAN", "zou2"]) expect(found(q), q).toContain("sense:早晨");
    expect(found("zou3 san4")).not.toContain("sense:早晨");
  });
});
