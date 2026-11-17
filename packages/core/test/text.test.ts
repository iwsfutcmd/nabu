import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { graphemeCount, graphemes, hasReading, surfaceOf, tileGroups, wordAt } from "../src/index.ts";

describe("graphemes", () => {
  it.each([
    ["é", ["é"]],
    ["각", ["각"]], // Hangul jamo L V T
    ["\u{1F469}\u200D\u{1F4BB}", ["\u{1F469}\u200D\u{1F4BB}"]], // ZWJ sequence
    ["\u{1F1EE}\u{1F1F7}", ["\u{1F1EE}\u{1F1F7}"]], // regional-indicator flag
    ["oʻzbek", ["o", "ʻ", "z", "b", "e", "k"]], // Uzbek oʻ is two graphemes: letters need the profile (Phase 1)
    ["کتاب\u200Cها", ["ک", "ت", "ا", "ب\u200C", "ه", "ا"]], // ZWNJ extends
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
  it("takes a word out as a text of its own (a tapped word), never punctuation", () => {
    expect(wordAt(yue, 1)).toEqual({ ...yue, tokens: [yue.tokens[1]] });
    expect(wordAt(yue, 2)).toBeUndefined();
    expect(wordAt(yue, 9)).toBeUndefined();
  });
  it("says whether a text has a reading in a scheme", () => {
    const jyutping = "jyutping" as SchemeId;
    const read: TaggedText = { ...yue, tokens: [{ surface: "去", kind: "word", ruby: { [jyutping]: [{ base: "去", text: "heoi3" }] } }] };
    expect(hasReading(read, jyutping)).toBe(true);
    expect(hasReading(read, "pinyin" as SchemeId)).toBe(false);
    expect(hasReading(yue, jyutping)).toBe(false);
  });
});
