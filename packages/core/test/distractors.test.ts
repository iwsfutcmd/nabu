import type { BundleSentence, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { allKcs, allSentences, seededRng } from "../src/lesson/index.ts";
import { cardGloss, makeChooseTranslation, makeGapFill, makeMatchPairs, type MakeContext } from "../src/lesson/templates.ts";
import { surfaceOf } from "../src/text/tagged-text.ts";
import { loadCourse } from "./learner-fixtures.ts";

const es = loadCourse("es");
const ctx = (seed: number): MakeContext => ({ course: es, rng: seededRng(seed), introduced: [] });
const end = (t: TaggedText): string => {
  const last = [...t.tokens].reverse().find((x) => x.kind !== "space");
  return last?.kind === "punct" ? last.surface : "";
};
const capital = (t: TaggedText): boolean => {
  const word = t.tokens.find((x) => x.kind === "word")?.surface ?? "";
  return word !== word.toLocaleLowerCase(t.lang);
};

describe("distractors that don't give the answer away (P2)", () => {
  // Every fourth sentence of the course: hundreds of cards, in reasonable time.
  const sentences: readonly BundleSentence[] = allSentences(es).filter((s, i) => !s.id.startsWith("drill.") && i % 4 === 0);

  it("choose-translation offers sentences that end like the answer", () => {
    let options = 0;
    let alike = 0;
    for (const [i, s] of sentences.entries()) {
      const ex = makeChooseTranslation(ctx(i), s);
      if (ex === undefined) continue;
      const answer = ex.options[ex.answer] as TaggedText;
      for (const [j, o] of ex.options.entries()) {
        if (j === ex.answer) continue;
        options++;
        if (end(o) === end(answer)) alike++;
      }
    }
    expect(options).toBeGreaterThan(200);
    // Before, distractors were drawn at random, whatever their punctuation.
    expect(alike / options).toBeGreaterThan(0.9);
  }, 120_000);

  it("gap-fill options share the answer's capital, so a sentence's first word isn't the odd one out", () => {
    let cards = 0;
    let giveaway = 0;
    for (const [i, s] of sentences.entries()) {
      const ex = makeGapFill(ctx(i), s);
      if (ex === undefined) continue;
      cards++;
      const answer = ex.options[ex.answer] as TaggedText;
      const others = ex.options.filter((_, j) => j !== ex.answer);
      if (others.every((o) => capital(o) !== capital(answer))) giveaway++;
    }
    expect(cards).toBeGreaterThan(50);
    expect(giveaway / cards).toBeLessThan(0.05);
  }, 120_000);
});

describe("short glosses on match-pairs cards (W7)", () => {
  it("keeps a gloss's first sense, without notes", () => {
    const yue = loadCourse("yue");
    const gloss = (id: string): TaggedText => {
      const g = allKcs(yue).find((k) => k.id === id)?.gloss?.["en"];
      if (g === undefined) throw new Error(`no gloss for ${id}`);
      return g;
    };
    expect(surfaceOf(cardGloss(gloss("sense:呀")))).toBe("sentence-final particle: softens a statement or a question");
    expect(surfaceOf(cardGloss(gloss("sense:呀")))).not.toContain("aa3");
    for (const k of allKcs(yue)) {
      const g = k.gloss?.["en"];
      if (g !== undefined) expect(cardGloss(g).tokens.some((t) => t.kind === "word"), k.id).toBe(true);
    }
  });

  it("puts the short glosses on the card, each meaning once", () => {
    const words = allKcs(es).filter((k) => k.kind === "sense" && k.gloss?.["en"] !== undefined && k.forms?.[es.orthography] !== undefined).slice(0, 12);
    const ex = makeMatchPairs(ctx(3), words);
    if (ex === undefined) throw new Error("es makes match-pairs");
    const right = ex.right.map(surfaceOf);
    expect(new Set(right).size).toBe(right.length);
    for (const r of right) expect(r).not.toMatch(/[;(]/u);
  });
});
