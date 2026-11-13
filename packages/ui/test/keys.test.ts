import { describe, expect, it } from "vitest";
import { markCarrier } from "../src/player/AnswerInput.tsx";
import { digitIndex } from "../src/player/shared.ts";

describe("number-key shortcuts", () => {
  it("pick options 1 to 9 in any script's digits", () => {
    expect(digitIndex("1")).toBe(0);
    expect(digitIndex("9")).toBe(8);
    // Persian, Arabic-Indic, Devanagari and fullwidth digits, as those keyboards type them.
    expect(["۳", "٣", "३", "３"].map(digitIndex)).toEqual([2, 2, 2, 2]);
  });

  it("ignore 0, numbers and other keys", () => {
    expect(["0", "۰", "10", "a", "Enter", " "].map(digitIndex)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });
});

describe("a lone mark's carrier", () => {
  it("is the tatweel in the scripts it joins, a dotted circle elsewhere", () => {
    expect(markCarrier("apc-Arab-LB")).toBe("ـ");
    expect(markCarrier("fa-Arab-IR")).toBe("ـ");
    expect(markCarrier("hbo-Hebr")).toBe("◌");
    expect(markCarrier("grc-Grek")).toBe("◌");
    // From the script subtag, explicit or likely: Arabic is written in Arabic script.
    expect(markCarrier("ar")).toBe("ـ");
    // A script Unicode does not encode (sitelen pona's private-use subtag).
    expect(markCarrier("tok-Qaap")).toBe("◌");
  });
});
