import { describe, expect, it } from "vitest";
import { emptyLearnerState, learnedWords, orderWords, plan, replay, wordMatcher } from "../src/learner/index.ts";
import { lessonNodes } from "../src/lesson/index.ts";
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
