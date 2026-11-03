import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { exemplars, parseExemplarSet } from "../src/index.ts";

describe("parseExemplarSet", () => {
  it("handles CLDR's syntax", () => {
    expect(parseExemplarSet("[a b {oʻ} {sh} ʼ]")).toEqual(["a", "b", "oʻ", "sh", "ʼ"]);
    expect(parseExemplarSet("[a-c]")).toEqual(["a", "b", "c"]);
    expect(parseExemplarSet("[\\- ‐‑ \\[ \\] \\u200C \\u{1F600} \\x{41}]")).toEqual(["-", "‐", "‑", "[", "]", "\u200C", "😀", "A"]);
    expect(parseExemplarSet("[{e\u0301} é]")).toEqual(["é"]); // strings are NFC and de-duplicated
    expect(parseExemplarSet("[e\u0301]")).toEqual(["e", "\u0301"]); // without braces: two code points
  });
  it("rejects syntax it does not implement", () => {
    expect(() => parseExemplarSet("[[:Lu:]]")).toThrow(SyntaxError);
    expect(() => parseExemplarSet("[\\p{L}]")).toThrow(SyntaxError);
  });
  it("round-trips any set of escaped code points", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 0x21, max: 0x2ffff }).filter((cp) => cp < 0xd800 || cp > 0xdfff), { maxLength: 40 }), (cps) => {
        const set = `[${cps.map((cp) => `\\u{${cp.toString(16)}}`).join(" ")}]`;
        const expected = [...new Set(cps.map((cp) => String.fromCodePoint(cp).normalize("NFC")))];
        expect(parseExemplarSet(set)).toEqual(expected);
      }),
    );
  });
});

describe("generated exemplars", () => {
  it("spell Uzbek oʻ and gʻ with U+02BB and include the tutuq belgisi U+02BC", () => {
    expect(exemplars.uz.main).toEqual(expect.arrayContaining(["oʻ", "gʻ", "ʼ", "sh", "ch"]));
  });
  it("list ZWNJ among Persian auxiliary exemplars", () => {
    expect(exemplars.fa.auxiliary).toContain("\u200C");
  });
});
