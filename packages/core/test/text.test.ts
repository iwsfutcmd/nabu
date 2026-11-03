import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { TaggedText } from "@nabu/schema";
import { graphemeCount, graphemes, surfaceOf, tileGroups } from "../src/index.ts";

describe("graphemes", () => {
  it.each([
    ["é", ["é"]],
    ["각", ["각"]], // Hangul jamo L V T
    ["\u{1F469}‍\u{1F4BB}", ["\u{1F469}‍\u{1F4BB}"]], // ZWJ sequence
    ["\u{1F1EE}\u{1F1F7}", ["\u{1F1EE}\u{1F1F7}"]], // regional-indicator flag
    ["oʻzbek", ["o", "ʻ", "z", "b", "e", "k"]], // Uzbek oʻ is two graphemes: letters need the profile (Phase 1)
    ["کتاب‌ها", ["ک", "ت", "ا", "ب‌", "ه", "ا"]], // ZWNJ extends
  ])("%s", (text, expected) => {
    expect(graphemes(text)).toEqual(expected);
    expect(graphemeCount(text)).toBe(expected.length);
  });

  it("concatenate back to the input", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), (s) => {
        expect(graphemes(s).join("")).toBe(s);
      }),
    );
  });
});

const yue = {
  lang: "yue-Hant-HK",
  orthography: "yue-Hant-HK/standard",
  tokens: [
    { surface: "我哋", kind: "word", tileGroup: 0 },
    { surface: "去", kind: "word", tileGroup: 1 },
    { surface: "！", kind: "punct" },
  ],
} as unknown as TaggedText;

describe("TaggedText helpers", () => {
  it("joins surfaces", () => expect(surfaceOf(yue)).toBe("我哋去！"));
  it("splits tiles by group and keeps lang/orthography", () => {
    const tiles = tileGroups(yue);
    expect(tiles.map(surfaceOf)).toEqual(["我哋", "去"]);
    expect(tiles[0]?.lang).toBe("yue-Hant-HK");
  });
});
