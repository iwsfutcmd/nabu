import type { AlignOp } from "@nabu/core";
import type { Exercise, Outcome } from "@nabu/core/lesson";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { Feedback } from "../src/player/Feedback.tsx";
import { render } from "./render.tsx";

const JYUTPING = "jyutping" as SchemeId;
const ORTH = "yue-Hant-HK/standard";
const yue = (tokens: TaggedText["tokens"]): TaggedText => ({ lang: "yue-Hant-HK" as TaggedText["lang"], orthography: ORTH as TaggedText["orthography"], tokens });
const word = (surface: string, jyutping: string): TaggedText["tokens"][number] => {
  const syllables = jyutping.split(" ");
  return { surface, kind: "word", readings: { [JYUTPING]: jyutping }, ruby: { [JYUTPING]: [...surface].map((base, i) => ({ base, text: syllables[i] ?? "" })) } };
};
// "Where's my book?": the solution is 我嘅書呢？, and 我嘅書喺邊度呀 is accepted too.
const solution = yue([word("我", "ngo5"), word("嘅", "ge3"), word("書", "syu1"), word("呢", "ne1"), { surface: "？", kind: "punct" }]);
const course = { profiles: new Map([[ORTH, { unitKind: "grapheme" }]]) } as never;
const ex = { template: "translate-type", orthography: ORTH } as unknown as Exercise;
const m = (expected: string): AlignOp => ({ op: "match", expected, actual: expected, kind: "exact" });

describe("feedback on a wrong answer nearer another accepted wording", () => {
  // The learner wrote 我嘅書邊度呀: one character from 我嘅書喺邊度呀 (a location question takes 喺).
  const outcome: Outcome = {
    verdict: "WRONG",
    notes: [],
    solution,
    alignment: [m("我"), m("嘅"), m("書"), { op: "delete", expected: "喺" }, m("邊"), m("度"), m("呀")],
    closestIsSolution: false,
  };

  it("shows that wording first, what was left out marked, then the solution with its readings", () => {
    const html = render(<Feedback ex={ex} outcome={outcome} course={course} ruby={JYUTPING} marks="show" />);
    const closest = html.slice(html.indexOf("data-closest"));
    expect(closest).toContain('data-highlight="true">喺</span>');
    expect(html.indexOf("data-closest")).toBeLessThan(html.indexOf("呢<rt>ne1</rt>"));
    for (const ch of "我嘅書喺邊度呀？") expect(closest).toContain(`>${ch}<`);
  });

  it("shows the solution alone when the answer was nearest the solution itself", () => {
    const html = render(<Feedback ex={ex} outcome={{ ...outcome, closestIsSolution: true }} course={course} ruby={JYUTPING} marks="show" />);
    expect(html).not.toContain("data-closest");
    expect(html).toContain("呢<rt>ne1</rt>");
  });
});
