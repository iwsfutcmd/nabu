/**
 * Word-bank tiles in lower case but for words that must be capitalized (ADR 0130): a capital that
 * only marks where a sentence starts would mark the answer's first tile, and every distractor that
 * was another sentence's first word.
 */
import type { BundleSentence, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { allSentences, createGrader, gradeExercise, seededRng, type CourseView } from "../src/lesson/index.ts";
import { makeTapL1L2, makeTapL2L1, type MakeContext } from "../src/lesson/templates.ts";
import { caseForTiles } from "../src/lesson/tiles.ts";
import { surfaceOf } from "../src/text/tagged-text.ts";
import { loadCourse } from "./learner-fixtures.ts";

const es = loadCourse("es");
const ctx = (seed: number): MakeContext => ({ course: es, rng: seededRng(seed), introduced: [] });
const sentence = (id: string): BundleSentence => {
  const s = allSentences(es).find((x) => x.id === id);
  if (s === undefined) throw new Error(`es has no ${id}`);
  return s;
};
const surfaces = (tiles: readonly TaggedText[]): readonly string[] => tiles.map(surfaceOf);

describe("word-bank tiles in lower case (ADR 0130)", () => {
  it("lowers a sentence's first word, and keeps a name and I", () => {
    const hello = makeTapL2L1(ctx(1), sentence("s.u01.22"));
    expect(surfaceOf(hello?.canonical as TaggedText)).toMatch(/^Hello/u);
    const tiles = surfaces(hello?.tiles ?? []);
    expect(tiles).toContain("hello");
    expect(tiles).not.toContain("Hello");
    expect(tiles).toContain("Daniel");
    expect(tiles.some((t) => t.startsWith("I"))).toBe(true);
    // The solution after the answer keeps the sentence as it is written.
    expect(surfaceOf(hello?.canonical as TaggedText)).toContain("Hello");
  });

  it("lowers the target's first word too, after an opening ¿", () => {
    const questions = allSentences(es).filter((s) => surfaceOf(s.forms[es.orthography]?.text as TaggedText).startsWith("¿"));
    let lowered = 0;
    for (const [i, s] of questions.entries()) {
      const ex = makeTapL1L2(ctx(i), s);
      if (ex === undefined) continue;
      const first = ex.tiles[ex.solution[0] as number] as TaggedText;
      const word = first.tokens.find((t) => t.kind === "lexical")?.surface ?? "";
      if (word !== "" && word === word.toLocaleLowerCase("es")) lowered++;
    }
    expect(lowered).toBeGreaterThan(10);
  });

  it("leaves no capital that only marks a sentence's start on any tile, answer or distractor", () => {
    // Words the course writes in lower case somewhere, and capitalized words it writes inside a
    // sentence (names: Calle Ocho, Aunt Cachita, I). A tile with a capital the course only ever
    // gives a word at a sentence's start shows where the answer starts, or a distractor.
    const lower = new Set<string>();
    const inside = new Set<string>();
    for (const s of allSentences(es)) {
      for (const text of [s.forms[es.orthography]?.text, s.translations[es.supportKey]?.text]) {
        let start = true;
        for (const t of text?.tokens ?? []) {
          if (t.kind === "punct" && /[.?!]/u.test(t.surface)) start = true;
          if (t.kind !== "lexical") continue;
          if (t.surface === t.surface.toLocaleLowerCase(text?.lang)) lower.add(t.surface);
          else if (!start) inside.add(t.surface);
          start = false;
        }
      }
    }
    let cards = 0;
    const capitals: string[] = [];
    for (const [i, s] of allSentences(es).filter((_, j) => j % 3 === 0).entries()) {
      for (const make of [makeTapL2L1, makeTapL1L2]) {
        const ex = make(ctx(i), s);
        if (ex === undefined) continue;
        cards++;
        for (const tile of ex.tiles) {
          const word = tile.tokens.find((t) => t.kind === "lexical")?.surface ?? "";
          const lowered = word.toLocaleLowerCase(tile.lang);
          if (word !== lowered && lower.has(lowered) && !inside.has(word)) capitals.push(`${s.id}: ${word}`);
        }
      }
    }
    expect(cards).toBeGreaterThan(200);
    expect(capitals).toEqual([]);
  }, 120_000);

  it("grades an answer built from lower-case tiles as right", () => {
    const grader = createGrader(es);
    for (const id of ["s.u01.1", "s.u01.22", "s.u02.1"]) {
      for (const make of [makeTapL2L1, makeTapL1L2]) {
        const ex = make(ctx(3), sentence(id));
        if (ex === undefined) continue;
        expect(gradeExercise(ex, { tag: "tiles", order: ex.solution }, grader).verdict, `${id} ${ex.template}`).toBe("CORRECT");
      }
    }
  });

  it("lowers in the text's own language: Turkish İ is i, not i with a dot above", () => {
    const tr = "tr-Latn/standard" as TaggedText["orthography"];
    const text = (words: readonly string[]): TaggedText => ({
      lang: "tr" as TaggedText["lang"],
      orthography: tr,
      tokens: words.flatMap((w, i) => [...(i === 0 ? [] : [{ surface: " ", kind: "space" as const }]), { surface: w, kind: "lexical" as const, tileGroup: i }]),
    });
    // A course that writes "iyi" in lower case somewhere, and "İstanbul" only with its capital.
    const course = { ...es, units: [{ id: "u", sentences: [{ id: "s", forms: { [tr]: { text: text(["çok", "iyi", "İstanbul"]) } } }] }] } as unknown as CourseView;
    expect(surfaces([caseForTiles(course, text(["İyi", "günler"]))])).toEqual(["iyi günler"]);
    expect(surfaces([caseForTiles(course, text(["İstanbul", "güzel"]))])).toEqual(["İstanbul güzel"]);
  });
});
