import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDigits } from "../src/digits.ts";

/** Every Unicode set of decimal digits, by its zero. */
const ZEROS: readonly number[] = (() => {
  const zeros: number[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (!/^\p{Nd}$/u.test(String.fromCodePoint(cp))) continue;
    // A run of Nd is one or more sets of ten; its zeros are every tenth code point from its start.
    const runStart = zeros.length > 0 && /^\p{Nd}$/u.test(String.fromCodePoint(cp - 1)) ? undefined : cp;
    if (runStart !== undefined) for (let z = cp; /^\p{Nd}$/u.test(String.fromCodePoint(z)); z += 10) zeros.push(z);
  }
  return zeros;
})();

const write = (n: number, zero: number): string => [...String(n)].map((c) => String.fromCodePoint(zero + Number(c))).join("");

describe("parseDigits", () => {
  it("reads the digits keyboards give", () => {
    expect(parseDigits("16")).toBe(16);
    expect(parseDigits("\u06F1\u06F6")).toBe(16); // Persian (Extended Arabic-Indic)
    expect(parseDigits("\u0661\u0666")).toBe(16); // Arabic-Indic
    expect(parseDigits("\u0967\u096C")).toBe(16); // Devanagari
    expect(parseDigits("\uFF11\uFF16")).toBe(16); // fullwidth
    expect(parseDigits("\u{1D7CF}\u{1D7D4}")).toBe(16); // mathematical bold, one of several adjacent sets
    expect(parseDigits("007")).toBe(7);
  });

  it("ignores surrounding space and bidi marks", () => {
    expect(parseDigits(" 16\n")).toBe(16);
    expect(parseDigits("\u200F\u06F1\u06F6\u200F")).toBe(16);
    expect(parseDigits("\u2066\u0661\u0666\u2069")).toBe(16);
  });

  it("refuses anything but one set of decimal digits", () => {
    for (const text of ["", " ", "-1", "+1", "1.5", "1,000", "1 6", "1\u06F6", "\u0661\u06F6", "sixteen", "\u5341\u516D", "1\u20E3", "\u00B9\u2076", "1234567890123456"]) {
      expect(parseDigits(text), JSON.stringify(text)).toBeUndefined();
    }
  });

  it("knows every set Unicode has", () => {
    expect(ZEROS.length).toBeGreaterThan(60);
    expect(ZEROS).toContain(0x30);
    expect(ZEROS).toContain(0x6f0);
    expect(ZEROS).toContain(0x1d7ce);
    expect(ZEROS).toContain(0x1d7d8);
  });

  it("reads back any number written in any set (property)", () => {
    fc.assert(fc.property(fc.nat({ max: 999_999 }), fc.constantFrom(...ZEROS), (n, zero) => parseDigits(write(n, zero)) === n));
  });
});
