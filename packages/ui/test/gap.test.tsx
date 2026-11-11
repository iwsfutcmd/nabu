import type { CompleteTranslation, Outcome } from "@nabu/core/lesson";
import type { KcId, SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { gapFillOf } from "../src/player/Views.tsx";
import { T } from "../src/T.tsx";
import { render } from "./render.tsx";

const JYUTPING = "jyutping" as SchemeId;
const yue = (tokens: TaggedText["tokens"]): TaggedText => ({ lang: "yue-Hant-HK" as TaggedText["lang"], orthography: "yue-Hant-HK/standard" as TaggedText["orthography"], tokens });
// As the compiler writes a token: its reading, and the reading per character as ruby.
const word = (surface: string, jyutping: string): TaggedText["tokens"][number] => {
  const syllables = jyutping.split(" ");
  return { surface, kind: "word", readings: { [JYUTPING]: jyutping }, ruby: { [JYUTPING]: [...surface].map((base, i) => ({ base, text: syllables[i] ?? "" })) } };
};

// 呢個係我[媽媽]。 "This is my mum.", the screen in the report: the gap is the sentence's own word.
const blank = yue([word("媽媽", "maa4 maa1")]);
const ex: CompleteTranslation = {
  template: "complete-translation",
  id: "complete-translation:s.u02.16",
  item: "s.u02.16",
  kcs: ["sense:媽媽" as KcId],
  orthography: "yue-Hant-HK/standard",
  prompt: { lang: "en-Latn" as TaggedText["lang"], orthography: "en-Latn/standard" as TaggedText["orthography"], tokens: [{ surface: "This is my mum.", kind: "word" }] },
  before: yue([word("呢個", "ni1 go3"), word("係", "hai6"), word("我", "ngo5")]),
  after: yue([{ surface: "。", kind: "punct" }]),
  blank,
  accept: "(媽媽|老媽)",
  canonical: yue([word("呢個", "ni1 go3"), word("係", "hai6"), word("我", "ngo5"), word("媽媽", "maa4 maa1"), { surface: "。", kind: "punct" }]),
};
const typed = (text: string) => ({ tag: "text", text }) as const;
const outcome = (verdict: Outcome["verdict"]): Outcome => ({ verdict, notes: [], solution: ex.canonical });

describe("a typed gap once answered", () => {
  it("shows what is typed, without a reading, while the learner answers", () => {
    expect(gapFillOf(ex, typed("媽媽"), undefined)?.tokens).toEqual([{ surface: "媽媽", kind: "word" }]);
    expect(gapFillOf(ex, typed(""), undefined)).toBeUndefined();
  });

  it("shows the sentence's own word, reading and all, once it is accepted", () => {
    for (const verdict of ["CORRECT", "CORRECT_WITH_TYPO", "CORRECT_MARKS", "CORRECT_VARIANT"] as const) {
      expect(gapFillOf(ex, typed("媽媽"), outcome(verdict))).toBe(blank);
    }
    // The reading renders as ruby when readings are on, as it does for the words around the gap.
    const html = render(<T text={gapFillOf(ex, typed("媽媽"), outcome("CORRECT")) as TaggedText} ruby={JYUTPING} />);
    expect(html).toContain("媽<rt>maa4</rt>媽<rt>maa1</rt>");
  });

  it("keeps another accepted word, and a wrong one, as typed: the course pins no reading for them", () => {
    expect(gapFillOf(ex, typed("老媽"), outcome("CORRECT_ALT"))?.tokens).toEqual([{ surface: "老媽", kind: "word" }]);
    expect(gapFillOf(ex, typed("爸爸"), outcome("WRONG_WORD"))?.tokens).toEqual([{ surface: "爸爸", kind: "word" }]);
  });
});
